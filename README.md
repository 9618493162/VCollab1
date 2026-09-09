<div align="center">

# VCollab

Real-time video collaboration for teams — meetings, recording, AI analysis, and a full collaboration workspace in one place.

</div>

## Features

- **Live meetings** — HD audio/video via [LiveKit](https://livekit.io), screen share, reactions, raise hand, waiting room
- **Host controls** — co-hosts, host transfer, mute/kick, meeting lock, waiting-room admission
- **Cloud recording** — real RoomComposite Egress recording to MP4, permanently stored and playable in-app
- **AI meeting analysis** — real transcription (Deepgram) feeding NVIDIA Nemotron for executive summary, decisions, action items, risks, and minutes
- **AI assistant** — ask questions about the actual meeting transcript ("What did we decide?", "What are my action items?")
- **Live captions** — real-time transcription during calls
- **Collaboration workspace** — notes, chat, whiteboard, polls, Q&A, tasks, breakout rooms, shared files (Supabase Storage)
- **Notifications** — realtime in-app notification center with meeting reminders
- **Organizations & teams** — workspaces, calendar, invitations, admin

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion |
| Backend | [Convex](https://convex.dev) (database, auth, realtime, functions) |
| Realtime | LiveKit Cloud |
| Transcription | Deepgram |
| AI analysis | NVIDIA Nemotron |
| File storage | Supabase Storage |

## Getting Started

```bash
bun install
bun run dev
```

Convex functions deploy via `bun convex dev` (requires a configured Convex project).

## Environment Variables

**Client (Vite):** `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`

**Server (Convex environment — Keys tab / `bun convex env set`):**

| Key | Purpose |
|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Meetings + cloud recording |
| `DEEPGRAM_API_KEY` | Transcription |
| `NVIDIA_API_KEY` | AI analysis |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Shared file storage |
| `GITHUB_TOKEN` | GitHub issue integration |

All secrets are read server-side via `process.env` and never shipped to the browser.

## License

MIT
