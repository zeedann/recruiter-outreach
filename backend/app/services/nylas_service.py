import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class NylasService:
    def __init__(self):
        self.api_uri = settings.nylas_api_uri
        self.client_id = settings.nylas_client_id

    @property
    def api_key(self):
        return settings.nylas_api_key

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def get_auth_url(self, redirect_uri: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "access_type": "online",
            "provider": "google",
            "scope": "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.api_uri}/v3/connect/auth?{query}"

    async def exchange_code(self, code: str, redirect_uri: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.api_uri}/v3/connect/token",
                json={
                    "client_id": self.client_id,
                    "client_secret": self.api_key,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def send_email(
        self, grant_id: str, to_email: str, subject: str, body_html: str
    ) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.api_uri}/v3/grants/{grant_id}/messages/send",
                headers=self._headers(),
                json={
                    "subject": subject,
                    "body": body_html,
                    "to": [{"email": to_email}],
                },
            )
            if resp.status_code >= 400:
                logger.error(f"Nylas send error {resp.status_code}: {resp.text}")
            resp.raise_for_status()
            return resp.json()

    async def reply_to_message(
        self, grant_id: str, message_id: str, body_html: str
    ) -> dict:
        async with httpx.AsyncClient() as client:
            # Get original message to build reply
            msg_resp = await client.get(
                f"{self.api_uri}/v3/grants/{grant_id}/messages/{message_id}",
                headers=self._headers(),
            )
            msg_resp.raise_for_status()
            original = msg_resp.json().get("data", msg_resp.json())

            reply_to = original.get("from", [])
            subject = original.get("subject", "")
            if not subject.lower().startswith("re:"):
                subject = f"Re: {subject}"
            thread_id = original.get("thread_id")

            payload = {
                "subject": subject,
                "body": body_html,
                "to": reply_to,
                "reply_to_message_id": message_id,
            }
            if thread_id:
                payload["thread_id"] = thread_id

            resp = await client.post(
                f"{self.api_uri}/v3/grants/{grant_id}/messages/send",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_message(self, grant_id: str, message_id: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.api_uri}/v3/grants/{grant_id}/messages/{message_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", data)

    async def list_recent_messages(
        self, grant_id: str, received_after: int, limit: int = 50
    ) -> list[dict]:
        """List messages received after a given unix timestamp."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.api_uri}/v3/grants/{grant_id}/messages",
                headers=self._headers(),
                params={
                    "received_after": received_after,
                    "limit": limit,
                },
            )
            if resp.status_code >= 400:
                logger.error(f"Nylas list messages error {resp.status_code}: {resp.text}")
                return []
            data = resp.json()
            return data.get("data", [])


nylas_service = NylasService()
