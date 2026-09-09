<div align="center">

# VCollab

**Real-time video collaboration for teams — meetings, cloud recording, AI-powered meeting analysis, and a complete collaboration workspace in one place.**

Built with React · TypeScript · Convex · LiveKit

</div>

---

## 📖 Overview

VCollab is a production-grade video collaboration platform. It combines real-time meetings (LiveKit), server-side cloud recording (LiveKit Egress), genuine speech-to-text (Deepgram), and AI-driven meeting intelligence (NVIDIA Nemotron) into a single workspace with notes, whiteboards, tasks, polls, Q&A, breakout rooms, shared files, and team management.

Every AI feature works on **real meeting data** — transcripts are generated from actual meeting audio, and summaries are derived from actual transcripts. Nothing is simulated.

---

## ✨ Features

### 🎥 Meetings
- HD audio/video powered by **LiveKit Cloud**
- Screen sharing with presenting indicators
- Live participant list with speaking detection, connection quality, and track states
- Reactions, raise hand, and real-time chat
- Waiting room with host admission control
- Meeting lock, meeting expiry, and rejoin support

### 👑 Host & Moderation
- Host, co-host, and host transfer
- Mute / kick individual participants, mute-all
- Waiting-room admit / admit-all / reject
- Recording controls restricted to host & co-hosts
- Meeting settings (chat toggles and more)

### ⏺️ Recording (Real, Not Simulated)
- **LiveKit RoomComposite Egress** recording — MP4 with grid layout capturing video, audio, and screen share
- Server-side start/stop with authorization checks (host/co-host only)
- Recording indicator broadcast reactively to all participants
- Recordings finalized on LiveKit's servers, persisted with playback URLs
- Auto-finalization safety net via LiveKit webhooks (HMAC-verified)
- Redundant local MediaRecorder fallback when LiveKit isn't configured

### 🤖 AI Meeting Intelligence
- **Real transcription** — meeting recordings processed through **Deepgram** with per-utterance speaker, text, timestamp, and confidence
- **NVIDIA Nemotron analysis** generating:
  - Executive summary
  - Key discussion points
  - Decisions made
  - Action items
  - Unresolved questions
  - Risks & concerns
  - Next steps
  - Important topics
- **AI Assistant** grounded in the actual meeting transcript — answers "What did we discuss?", "What are my action items?", "Who owns the presentation?" — and honestly says *"I couldn't find that information in this meeting"* when the answer isn't there. Never invents information.
- **Live captions** during meetings
- **Searchable transcript** with timestamp navigation

### 🧩 Collaboration Workspace
- **Notes** — shared meeting notes
- **Whiteboard** — collaborative drawing canvas
- **Files** — meeting file sharing via **Supabase Storage** (25 MB limit, private bucket, short-lived signed URLs, uploader-or-host delete)
- **Tasks** — assign and track action items
- **Polls & Q&A** — structured engagement during meetings
- **Breakout rooms** — split participants into groups

### 🔔 Notifications
- Realtime in-app notification center (Convex reactive subscriptions — no polling)
- Meeting invitations, reminders (15 & 5 minutes before), cancellations, reschedules
- Recording-ready and AI-summary-ready notifications
- Task assignments and updates, Q&A answers, host transfers, team changes
- Server-side scheduling via Convex cron — works even with the browser closed

### 🏢 Teams & Organizations
- Workspaces with team management
- Calendar with scheduled meetings
- Contacts, direct messages, channels
- Admin panel with workspace policies
- Full meeting history with post-meeting analysis pages

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React + Vite SPA                  │
│  Tailwind v4 · shadcn/ui · Framer Motion            │
└──────────────────────┬──────────────────────────────┘
                       │  Convex reactive queries
┌──────────────────────▼──────────────────────────────┐
│                   Convex Backend                    │
│  Auth (OTP + anonymous) · Queries/Mutations/Actions │
│  Server-side scheduling (cron) · HTTP webhooks      │
└───┬──────────────┬──────────────┬──────────────┬────┘
    │              │              │              │
┌───▼────┐   ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼────┐
│LiveKit │   │ Deepgram  │  │  NVIDIA   │  │Supabase │
│ Cloud  │   │   (STT)   │  │ Nemotron  │  │ Storage │
│+Egress │   └───────────┘  └───────────┘  └─────────┘
└────────┘
```

**Key design principles:**
- **Real data only** — no fake transcripts, mock recordings, or simulated AI output
- **Failure isolation** — if AI or transcription fails, meetings, recordings, and chat keep working
- **Graceful degradation** — missing API keys disable features with honest notices; nothing breaks
- **Server-side secrets** — all API keys live in the Convex environment, read via `process.env`, never shipped to the browser

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Lucide Icons |
| Animations | Framer Motion |
| Routing | React Router v7 |
| Backend | Convex — database, reactive queries, mutations, actions, cron |
| Authentication | Convex Auth (email OTP + anonymous) |
| Realtime media | LiveKit Cloud + LiveKit Server SDK (Egress) |
| Speech-to-text | Deepgram |
| AI analysis | NVIDIA Nemotron |
| File storage | Supabase Storage (private buckets, signed URLs) |
| Package manager | Bun |

---

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── ui/              # shadcn/ui primitives
│   ├── MeetingChat.tsx  # In-meeting chat
│   ├── PostMeetingPage.tsx  # Transcript/Summary/Recordings tabs
│   └── ...
├── pages/               # Route-level pages
│   ├── Call.tsx         # The meeting room (LiveKit integration)
│   ├── Collab.tsx       # Collaboration workspace
│   ├── Dashboard.tsx    # Authenticated home
│   ├── History.tsx      # Meeting history + post-meeting views
│   └── Settings.tsx     # Profile + integrations (GitHub, etc.)
├── hooks/               # Custom hooks (use-auth, use-call-room, ...)
├── convex/              # Backend — all server logic
│   ├── schema.ts        # Database schema (meetings, recordings, ...)
│   ├── livekit.ts       # Egress start/stop/check, participant tokens
│   ├── recording.ts     # Recording state machine
│   ├── ai.ts            # Transcription + Nemotron analysis pipeline
│   ├── notifications.ts # Realtime notification center
│   ├── supabase.ts      # Signed upload/download URLs for file sharing
│   ├── github.ts        # GitHub API (profile, repos, issues)
│   └── http.ts          # HTTP routes (LiveKit webhook, etc.)
└── test/                # Vitest test suites (137 tests)
```

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh) installed
- A [Convex](https://convex.dev) account
- A [LiveKit Cloud](https://cloud.livekit.io) project (for meetings + recording)

### Install & Run

```bash
bun install
bun run dev          # frontend dev server
bun convex dev       # Convex dev (separate terminal)
```

### Run Tests

```bash
bun run test         # 137 tests across 27 files
bun tsc -b --noEmit  # typecheck
```

---

## 🔑 Environment Variables

### Client (Vite)
| Variable | Purpose |
|---|---|
| `CONVEX_DEPLOYMENT` | Convex deployment identifier |
| `VITE_CONVEX_URL` | Convex WebSocket/HTTP endpoint |

### Server (Convex environment)
Set via the project Keys tab or `bun convex env set <KEY> <value>`:

| Key | Purpose |
|---|---|
| `LIVEKIT_URL` | LiveKit Cloud WebSocket URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret (recording + tokens) |
| `DEEPGRAM_API_KEY` | Speech-to-text transcription |
| `NVIDIA_API_KEY` | Nemotron AI meeting analysis |
| `SUPABASE_URL` | Supabase project URL (file storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GITHUB_TOKEN` | GitHub integration (issues, repos) |
| `JWKS` / `JWT_PRIVATE_KEY` / `SITE_URL` | Convex Auth |

> ⚠️ **Secrets never reach the client.** All provider keys are read server-side inside `"use node"` Convex actions. Nothing is hardcoded, nothing uses a `VITE_` prefix, and nothing lands in git.

**Optional keys** — every integration degrades gracefully. Missing a key disables just that feature with an honest notice ("AI analysis is not configured") while meetings keep working.

---

## 🔄 The Recording + AI Pipeline

```
Host clicks Record
   → Convex action verifies auth + moderation rights
   → LiveKit startRoomCompositeEgress (MP4, grid layout)
   → Recording state broadcast to all participants
   → Host clicks Stop
   → stopEgress → LiveKit finalizes & uploads MP4
   → Client polling OR webhook (HMAC-verified) finalizes the record
   → Auto-transcription via Deepgram (idempotent, failure-isolated)
   → NVIDIA Nemotron generates structured analysis
   → Transcript, summary, action items land in the meeting's tabs
```

---

## 🧪 Testing

```bash
bun run test
```

Covers the critical server paths: recording authorization gates (host-only start, starter-only stop), meeting code normalization, and the transcribe/analyze pipeline behavior — using Vitest with jsdom.

---

## 📄 License

MIT
