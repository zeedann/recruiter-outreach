import json

from openai import AsyncOpenAI

from app.config import settings

client = AsyncOpenAI(api_key=settings.openai_api_key)

CLASSIFICATION_PROMPT = """You are a recruiter assistant. Classify the following email reply from a candidate into exactly one of these categories:

- "interested": The candidate expresses interest in the role or wants to learn more.
- "not_interested": The candidate declines, is not looking, or asks to be removed.
- "referral": The candidate refers someone else (e.g., "talk to X", "not me but try Y").
- "neutral": Anything else (auto-reply, unclear, question without clear interest).

Also check if the reply contains a referral. If someone is referred, extract their details.

Reply with valid JSON only:
{
  "classification": "interested" | "not_interested" | "referral" | "neutral",
  "has_referral": true | false,
  "referral_email": "email or null",
  "referral_name": "name or null"
}

Email body:
"""


async def classify_reply(body: str) -> dict:
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": CLASSIFICATION_PROMPT},
            {"role": "user", "content": body},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {
            "classification": "neutral",
            "has_referral": False,
            "referral_email": None,
            "referral_name": None,
        }
