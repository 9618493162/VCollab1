<div align="center">

# VCollab

### Real-Time Video Collaboration Platform for Modern Teams

**Meet. Collaborate. Record. Analyze. Decide.**

A modern real-time collaboration platform combining HD video meetings, cloud recording, AI meeting intelligence, live transcription, live captions, collaborative workspaces, teams, scheduling, notifications, and post-meeting productivity in one unified application.

</div>

---

# 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Authentication](#-authentication)
- [Dashboard](#-dashboard)
- [Meetings](#-meetings)
- [LiveKit](#-livekit)
- [Host Controls](#-host-controls)
- [Waiting Room](#-waiting-room)
- [Meeting Chat](#-meeting-chat)
- [Reactions](#-reactions)
- [Raise Hand](#-raise-hand)
- [Screen Sharing](#-screen-sharing)
- [Cloud Recording](#-cloud-recording)
- [Recording Storage](#-recording-storage)
- [Meeting History](#-meeting-history)
- [Transcription](#-transcription)
- [Live Captions](#-live-captions)
- [AI Meeting Analysis](#-ai-meeting-analysis)
- [NVIDIA Nemotron](#-nvidia-nemotron)
- [AI Meeting Assistant](#-ai-meeting-assistant)
- [Meeting Minutes](#-meeting-minutes)
- [Action Items](#-action-items)
- [Notes](#-notes)
- [Whiteboard](#-whiteboard)
- [Tasks](#-tasks--kanban)
- [Polls](#-polls)
- [Q&A](#-qa)
- [Breakout Rooms](#-breakout-rooms)
- [Shared Resources](#-shared-resources)
- [Notifications](#-notifications)
- [Calendar](#-calendar)
- [Teams](#-teams)
- [Organizations](#-organizations)
- [Search](#-global-search)
- [Architecture](#-architecture)
- [Technology Stack](#-technology-stack)
- [Environment Variables](#-environment-variables)
- [Installation](#-installation)
- [Development](#-development)
- [Recording Architecture](#-recording-architecture)
- [Security](#-security)
- [Failure Isolation](#-failure-isolation)
- [Meeting Lifecycle](#-meeting-lifecycle)
- [Mobile Experience](#-mobile-experience)
- [Testing](#-testing)
- [Production Checklist](#-production-checklist)
- [Development Rules](#-development-rules)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

# 🚀 Overview

VCollab is a real-time video collaboration platform designed for teams, organizations, students, businesses, and remote groups.

VCollab combines video meetings, collaboration tools, cloud recording, transcription, AI meeting analysis, team management, scheduling, and post-meeting productivity into a single platform.

The platform is designed around:

- Real-time communication
- Secure meetings
- Persistent meeting history
- Cloud recording
- AI-powered meeting intelligence
- Collaborative workspaces
- Team productivity
- Responsive desktop and mobile experiences

The primary goal is to provide a professional collaboration experience comparable to modern platforms such as Zoom, Microsoft Teams, and Google Meet while adding deeper AI-powered meeting intelligence.

---

# ✨ Features

VCollab includes the following major capabilities:

- 🔐 Authentication
- 🏠 Dashboard
- 🎥 HD video meetings
- 🎙️ HD audio
- 🖥️ Screen sharing
- 👥 Participant management
- 👑 Host controls
- 🤝 Co-hosts
- 🔄 Host transfer
- 🔒 Meeting lock
- ⏳ Waiting room
- 💬 Meeting chat
- ❤️ Reactions
- ✋ Raise hand
- 🎬 Cloud recording
- ☁️ Persistent recording storage
- 📜 Meeting transcription
- 📝 Live captions
- 🤖 AI meeting analysis
- 🧠 NVIDIA Nemotron integration
- 💬 AI meeting assistant
- 📋 Meeting minutes
- ✅ Action items
- 📓 Notes
- 🖊️ Whiteboard
- 📋 Tasks / Kanban
- 📊 Polls
- ❓ Q&A
- 🚪 Breakout rooms
- 📁 Shared resources
- 🔔 Notifications
- ⏰ Meeting reminders
- 📅 Calendar
- 👥 Teams
- 🏢 Organizations
- 🔎 Global search
- 🕘 Meeting history
- 📱 Responsive mobile experience
- 🛡️ Authorization and security

---

# 🔐 Authentication

VCollab provides authenticated access to the application.

Authentication includes:

- User registration
- Login
- Logout
- Session handling
- Protected routes
- User identity
- Backend authorization
- Meeting permissions
- Workspace permissions
- Team permissions

Sensitive operations must always be verified on the backend.

---

# 🏠 Dashboard

The dashboard acts as the main entry point to VCollab.

Dashboard functionality includes:

- Upcoming meetings
- Recent meetings
- Meeting history
- Quick meeting creation
- Join meeting
- Calendar
- Notifications
- Workspaces
- Teams
- Search
- Recent activity

The dashboard should remain fast and responsive.

---

# 🆕 Meeting Creation

Every newly created meeting must receive a unique identity.

A meeting contains information such as:

```text
meetingId
meetingCode
roomName
hostId
title
description
status
createdAt
scheduledAt
