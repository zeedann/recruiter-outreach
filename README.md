# Recruiter Outreach Automation

A full-stack web app that automates recruiter email outreach workflows. Recruiters connect their Gmail via Nylas, create multi-step email sequences, upload candidate CSVs, and track replies with AI-powered classification.

## Architecture Overview

```
                    +-----------+
                    |  Frontend |  React + TypeScript + Vite
                    |  (5173)   |  shadcn/ui + Tailwind + Recharts
                    +-----+-----+
                          |
                    +-----+-----+
                    |  Backend  |  Python + FastAPI + SQLAlchemy
                    |  (8000)   |  JWT auth, async background worker
                    +-----+-----+
                          |
              +-----------+-----------+
              |           |           |
        +-----+----+ +---+---+ +-----+-----+
        | Postgres | | Nylas | |  OpenAI   |
        |  (5432)  | | API   | |  API      |
        +----------+ +-------+ +-----------+
```

**Backend (FastAPI)**
- JWT cookie-based auth tied to Nylas OAuth
- Async SQLAlchemy with Postgres
- Background worker: sequence engine (sends emails on schedule) + reply poller (checks for new messages every 30s)
- OpenAI gpt-4o-mini for reply classification
- Bleach for server-side HTML sanitization
- Alembic for database migrations

**Frontend (React + TypeScript)**
- shadcn/ui component library with Tailwind CSS
- Recharts for analytics visualizations
- DOMPurify for client-side HTML sanitization
- Axios with cookie credentials for API calls

**Database Schema**
- `recruiters` - Connected Gmail accounts (Nylas grants)
- `sequences` - Email campaign definitions
- `sequence_steps` - Individual emails in a sequence (subject, body, delay)
- `candidates` - People enrolled in sequences
- `candidate_state_logs` - Full audit trail of status transitions
- `sent_emails` - Record of every email sent
- `replies` - Captured replies with AI classification
- `referrals` - Tracked referrals linking candidates

## Setup

### Prerequisites
- Docker and Docker Compose
- Nylas v3 account ([nylas.com](https://www.nylas.com/))
- OpenAI API key
- Google Cloud project with Gmail API enabled

### 1. Clone and configure

```bash
git clone https://github.com/zeedann/recruiter-outreach.git
cd recruiter-outreach
cp .env.example .env
```

Edit `.env` with your credentials:

```env
NYLAS_CLIENT_ID=your_nylas_client_id
NYLAS_API_KEY=your_nylas_api_key
NYLAS_CALLBACK_URI=http://localhost:8000/api/auth/callback
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=generate-a-strong-random-secret
```

### 2. Nylas setup

1. Create a Nylas v3 application at [dashboard.nylas.com](https://dashboard-v3.nylas.com)
2. Add `http://localhost:8000/api/auth/callback` as an allowed redirect URI
3. Note your Client ID and API Key

### 3. Google Cloud setup

1. Enable the **Gmail API** in your Google Cloud project
2. Add these OAuth scopes in **Data Access**:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
3. Add your email as a test user if the app is in testing mode

### 4. Run

```bash
docker compose up --build
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### 5. First use

1. Open http://localhost:5173 — you'll see the Connect page
2. Click **Connect Gmail** and complete the OAuth flow
3. Create a sequence with email steps
4. Upload a CSV of candidates (format: `email,name`)
5. Click **Start Sequence** to begin sending

## Key Features

- **Email sequences**: Multi-step campaigns with configurable delays between steps (minutes treated as days per spec)
- **Template variables**: `{{name}}`, `{{email}}`, `{{company}}` resolved per-candidate
- **CSV upload**: Bulk enroll candidates with deduplication
- **Manual activation**: "Start Sequence" button — candidates stay pending until you're ready
- **Reply capture**: Polls Nylas every 30s for new inbound messages (webhook support via Hookdeck also available)
- **AI classification**: Replies classified as interested / not_interested / neutral / referral using GPT-4o-mini
- **Smart referral capture**: Extracts referred contacts from replies, auto-creates new leads, enrolls in "Thanks for Referral" sequence
- **Dashboard analytics**: KPI cards, conversion funnel, status distribution donut chart, per-sequence analytics table, activity feed
- **Sequence management**: Duplicate, rename, delete sequences; drag-reorder steps; inline editing with live preview
- **Candidate management**: Search, status filter tabs, bulk select/delete, progress dots

## Assumptions and Tradeoffs

**Days as minutes**: Per the spec, delay values are in minutes but represent days. A "2 day" follow-up fires after 2 minutes.

**Polling over webhooks**: Nylas blocks ngrok URLs for webhooks. The app uses a 30-second polling loop as the primary reply capture mechanism. Webhook support exists and works with Hookdeck if you need real-time capture.

**Single-recruiter focus**: Auth supports multiple recruiters, but the background worker processes all active candidates globally. In production, you'd scope the worker per-recruiter or use a task queue.

**In-process background worker**: The sequence engine runs as an asyncio task inside the FastAPI process. This is fine for demo/small scale but would need Celery or a separate worker process for production reliability.

**No rich text editor**: Email body input is a plain textarea accepting HTML. A WYSIWYG editor (TinyMCE, Quill) would improve the recruiter experience.

**Classification model**: Uses gpt-4o-mini for cost efficiency. Could upgrade to gpt-4o for better accuracy on ambiguous replies.

## What I'd Do With 2-3 More Days

**1. Real-time updates + production worker infrastructure**
- Replace the in-process asyncio worker with Celery + Redis for reliable task processing, retries, and dead-letter handling
- Add WebSocket support (FastAPI WebSockets or SSE) so the dashboard and candidate views update in real-time without polling
- Add per-sequence scheduling (pause/resume, schedule for specific times)

**2. Email deliverability + threading improvements**
- Add open/click tracking via Nylas message events or tracking pixels
- Improve email threading so follow-ups appear in the same Gmail thread
- Add unsubscribe link handling and bounce detection
- A/B testing support: create variant steps and split candidates to compare performance

**3. Polish and operational readiness**
- Replace the HTML textarea with a rich text editor (TinyMCE or Quill)
- Add comprehensive error toasts and retry logic throughout the frontend
- Add pagination on all list endpoints
- Set up structured logging, error tracking (Sentry), and health check monitoring
- Add database unique constraints and row-level locking to prevent duplicate sends
- Rate limiting on API endpoints
- CI/CD pipeline with tests
