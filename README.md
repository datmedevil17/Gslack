# Gslack

A full-stack Slack clone — Go backend + React Native frontend.

---

## Backend Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          React Native Client                            │
│                    (iOS / Android — Expo / RN CLI)                      │
└────────────┬────────────────────────────────────────┬───────────────────┘
             │ HTTPS REST                              │ WSS
             ▼                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Cloudflare Tunnel                             │
│                      (dev: trycloudflare.com)                           │
└────────────┬────────────────────────────────────────┬───────────────────┘
             │                                         │
             ▼                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Gin HTTP Server  :8080                          │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        Middleware Stack                          │   │
│  │   gin.Logger → gin.Recovery → CORS → RequireAuth (Supabase JWT) │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                        Router  /api/v1                        │      │
│  │                                                               │      │
│  │  /auth/*          AuthHandler    (register, login, OAuth)     │      │
│  │  /users/*         UserHandler    (profile, avatar, prefs)     │      │
│  │  /workspaces/*    WorkspaceHandler (CRUD, members, invite)    │      │
│  │    └─ /channels/* ChannelHandler  (CRUD, join, pins, archive) │      │
│  │  /channels/:id/   MessageHandler  (send, thread, react, pin,  │      │
│  │    messages/*                      forward, search)           │      │
│  │  /dm/*            DMHandler       (1-on-1 DMs + reactions)    │      │
│  │  /group-dm/*      DMHandler       (group DMs + members)       │      │
│  │  /notifications/* NotifHandler    (list, read, unread count)  │      │
│  │  /files/*         FileHandler     (upload, download, delete)  │      │
│  │  /search/*        SearchHandler   (global, messages, users)   │      │
│  │  /presence/*      PresenceHandler (get, update)               │      │
│  │  /ai/*            AIHandler       (chat, summarize, suggest)  │      │
│  │  /apps/*          AppHandler      (stubbed)                   │      │
│  │  /webhooks/*      WebhookHandler  (stubbed)                   │      │
│  │  GET /api/v1/ws   WebSocket upgrade (auth via ?token=)        │      │
│  └───────────────────────────────────────────────────────────────┘      │
└────────────┬───────────────────────┬──────────────┬─────────────────────┘
             │                       │              │
             ▼                       ▼              ▼
┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐
│   PostgreSQL (DB)  │  │  WebSocket Hub     │  │   External Services  │
│   via GORM ORM     │  │  (gorilla/ws)      │  │                      │
│                    │  │                    │  │  Supabase Auth       │
│  24 auto-migrated  │  │  ┌──────────────┐  │  │  (JWKS / ES256)      │
│  models:           │  │  │  Hub.Run()   │  │  │                      │
│  User              │  │  │  goroutine   │  │  │  Supabase Storage    │
│  Workspace         │  │  └──────┬───────┘  │  │  (S3-compatible)     │
│  WorkspaceMember   │  │         │ broadcast│  │                      │
│  Channel           │  │  ┌──────▼───────┐  │  │  Groq API            │
│  ChannelMember     │  │  │  Room map    │  │  │  (llama-3.3-70b)     │
│  Message           │  │  │  client set  │  │  │                      │
│  MessageReaction   │  │  └──────┬───────┘  │  │  Google Gemini       │
│  MessageAttachment │  │         │           │  │  (gemini-1.5-flash)  │
│  PinnedMessage     │  │  ┌──────▼───────┐  │  │                      │
│  DMConversation    │  │  │  Client      │  │  └──────────────────────┘
│  DMParticipant     │  │  │  readPump()  │  │
│  DMMessage         │  │  │  writePump() │  │
│  DMMessageReaction │  │  └──────────────┘  │
│  File              │  │                    │
│  Notification      │  │  Events broadcast  │
│  UserPresence      │  │  to room members:  │
│  UserPreferences   │  │  message.new       │
│  RefreshToken      │  │  message.update    │
│  PasswordReset     │  │  message.delete    │
│  EmailVerifyToken  │  │  reaction.add      │
│  Webhook           │  │  reaction.remove   │
│  Call              │  │  typing            │
│  AuditLog          │  │  presence          │
└────────────────────┘  └────────────────────┘
```

---

## Request Lifecycle

```
Client Request
     │
     ▼
 gin.Logger / gin.Recovery
     │
     ▼
 CORS Middleware
     │
     ▼
 RequireAuth  ──── fetch JWKS from Supabase ──── validate ES256 JWT
     │                                                 │
     │  401 Unauthorized ◄─────────────────────────────┘ (invalid/expired)
     │
     ▼  (sets UserIDKey + UserEmailKey in context)
 Route Handler
     │
     ├── DB query via GORM (PostgreSQL)
     │
     ├── (if mutation) Hub.Broadcast(room, OutboundMessage)
     │        └──► all WebSocket clients in room receive JSON event
     │
     └── c.JSON(status, payload)
```

---

## WebSocket Event Flow

```
  Channel Screen joins "channel:<uuid>"
  DM Screen joins "dm:<uuid>"

  Client ──► { type: "join_room", room: "channel:abc" } ──► Hub.JoinRoom()
  Client ──► { type: "typing",    room: "channel:abc" } ──► Hub.Broadcast()
  Client ──► { type: "leave_room",room: "channel:abc" } ──► Hub.LeaveRoom()

  Server ──► { type: "message.new",    payload: Message }
  Server ──► { type: "message.update", payload: Message }
  Server ──► { type: "message.delete", payload: { id } }
  Server ──► { type: "reaction.add",   payload: MessageReaction }
  Server ──► { type: "reaction.remove",payload: { message_id, user_id, emoji } }
  Server ──► { type: "typing",         payload: { user_id, username } }
  Server ──► { type: "presence",       payload: UserPresence }
```

---

## AI Handler

```
POST /api/v1/ai/chat
     │
     ├── Groq client available? ──► groqChat()  (llama-3.3-70b, fast)
     │                                   └── buildChannelContext() if channel_id provided
     │
     └── fallback ──► geminiChat()  (gemini-1.5-flash, long context)
                            └── returns { reply, model, provider }

POST /api/v1/ai/summarize/:channelID
     │
     └── fetch last 80 msgs ──► Gemini (preferred) or Groq
                                     └── returns { summary, message_count }

POST /api/v1/ai/reply-suggest/:messageID
     │
     └── fetch thread context ──► Groq (preferred) or Gemini
                                       └── returns { suggestions: string[] }
```

---

## Directory Structure

```
backend/
├── cmd/api/
│   └── main.go              # Server bootstrap, router, graceful shutdown
├── internal/
│   ├── config/
│   │   └── config.go        # Env vars (DATABASE_URL, Supabase, AI keys, S3)
│   ├── database/
│   │   └── database.go      # GORM connect, connection pool, auto-migrate
│   ├── middleware/
│   │   ├── auth.go          # Supabase JWT validation (ES256 + HS256 fallback)
│   │   └── cors.go          # CORS headers
│   ├── models/
│   │   └── models.go        # 24 GORM model structs
│   ├── storage/
│   │   └── storage.go       # S3-compatible client (Supabase Storage)
│   ├── websocket/
│   │   ├── hub.go           # Room-based broadcast hub (goroutine)
│   │   ├── client.go        # Per-connection read/write pumps
│   │   └── message.go       # Event type constants + OutboundMessage struct
│   └── handlers/
│       ├── ai/              # Groq + Gemini integration
│       ├── auth/            # Register, login, OAuth (stubbed)
│       ├── channel/         # Channel CRUD, membership, pins, archive
│       ├── dm/              # DM + Group DM conversations and messages
│       ├── file/            # S3 upload/download
│       ├── message/         # Channel messages, threads, reactions, forward
│       ├── notification/    # Activity feed
│       ├── presence/        # Online status
│       ├── search/          # Full-text search across messages/channels/users
│       ├── user/            # Profile, avatar, preferences
│       ├── webhook/         # Outgoing webhooks (stubbed)
│       ├── workspace/       # Workspace CRUD, members, invite codes
│       └── app/             # Third-party apps (stubbed)
└── go.mod
```

---

## Goroutines — In-Depth

The backend spawns exactly **three categories of goroutines** at runtime. Here's how each one works.

---

### 1. Hub Event Loop — `go hub.Run()`

Spawned once at startup in `main.go`:

```go
hub := ws.NewHub()
go hub.Run()
```

`Hub.Run()` is an **infinite `select` loop** — a single goroutine that owns all mutable hub state. This is the classic Go concurrency pattern: instead of locking a shared map on every access, only one goroutine ever writes to it, and all other goroutines communicate via channels.

```
main goroutine                   hub goroutine
     │                                │
     │  hub.register <- client  ──►   │  h.clients[c] = true
     │  hub.unregister <- client ──►  │  close(c.send), cleanup rooms
     │  hub.broadcast <- envelope ──► │  fan-out: c.send <- msg  (for each client in room)
```

**Why one goroutine owns the maps:**
- `h.clients` and `h.rooms` are mutated by register/unregister/broadcast events
- A `sync.RWMutex` is also present for `JoinRoom` / `LeaveRoom` which are called directly (not via channel) from `readPump` goroutines — these use the lock to safely modify `h.rooms`
- The broadcast channel has a buffer of 512 so HTTP handlers never block waiting for the hub loop

**Back-pressure handling:**
When writing to a client's `send` channel would block (channel full — slow/stuck client), the hub closes that client's channel and evicts it rather than blocking the entire broadcast:

```go
select {
case c.send <- env.Message:   // fast path: deliver
default:                       // slow client: evict it
    close(c.send)
    delete(h.clients, c)
    delete(room, c)
}
```

---

### 2. `writePump` — one goroutine per WebSocket connection

Spawned inside `ServeWS` for every new WebSocket connection:

```go
go c.writePump()
```

**What it does:**

```
                   ┌───────────────────────────────────┐
                   │         writePump goroutine         │
                   │                                     │
  hub.broadcast ──►│  c.send channel (buf 256)           │──► WebSocket conn
                   │                                     │
  ticker (54s)  ──►│  time.NewTicker(pingPeriod)         │──► Ping frame
                   └───────────────────────────────────┘
```

- Blocks on `select { case msg := <-c.send ... case <-ticker.C ... }`
- When a message arrives it grabs a `NextWriter`, writes the first message, then **drains any queued messages in the same TCP frame** (separated by `\n`) — this batches multiple rapid events into one network write, reducing syscall overhead
- Every 54 seconds it sends a WebSocket Ping frame; if the client doesn't Pong within 60s, the write deadline fires and the goroutine exits, closing the connection
- Write deadline of 10s prevents a slow client from holding up the goroutine forever

```go
// Batch flush: write all queued messages in one frame
for n := len(c.send); n > 0; n-- {
    w.Write([]byte{'\n'})
    w.Write(<-c.send)
}
```

---

### 3. `readPump` — one goroutine per WebSocket connection

Also spawned inside `ServeWS`:

```go
go c.readPump()
```

**What it does:**

```
                   ┌───────────────────────────────────┐
                   │         readPump goroutine          │
                   │                                     │
  WebSocket conn ──►│  conn.ReadMessage() (blocking)     │──► handleInbound()
                   │                                     │
  on exit        ──►│  hub.unregister <- c               │
                   └───────────────────────────────────┘
```

- Blocks on `conn.ReadMessage()` — this is why it needs its own goroutine; you can't block a thread shared with writes
- Max message size capped at 8 KB to prevent memory exhaustion from large payloads
- Pong handler resets the read deadline on each heartbeat, keeping the connection alive
- On any read error (disconnect, timeout, abnormal closure) it sends `c` to `hub.unregister` and returns — the `defer` ensures cleanup even on panic
- Calls `handleInbound` which dispatches client commands synchronously:

```
InboundMessage.type == "join_room"  → hub.JoinRoom(c, roomID)
InboundMessage.type == "leave_room" → hub.LeaveRoom(c, roomID)
InboundMessage.type == "typing"     → hub.Broadcast(room, EventTyping)
```

---

### Goroutine Lifecycle Diagram

```
main()
  │
  ├── go hub.Run()                          ← lives for the entire process
  │        │
  │        └── select loop on channels
  │
  └── HTTP server (net/http manages a goroutine pool per request)
            │
            └── GET /api/v1/ws  (on each new WS connection)
                      │
                      ├── go c.writePump()  ← lives until connection closes
                      │        │
                      │        ├── blocks on c.send channel
                      │        └── sends ping every 54s
                      │
                      └── go c.readPump()   ← lives until connection closes
                               │
                               ├── blocks on conn.ReadMessage()
                               └── on exit: hub.unregister <- c
```

### Goroutine Count at Runtime

| Goroutines | Count | Notes |
|---|---|---|
| Hub event loop | 1 | Always running |
| `writePump` | 1 per active WS client | Created on connect, exits on disconnect |
| `readPump` | 1 per active WS client | Created on connect, exits on disconnect |
| HTTP request handlers | Managed by `net/http` | Short-lived, returned to pool after response |

With N connected clients: **2N + 1** goroutines for the real-time layer. Goroutines are cheap (~2 KB initial stack vs ~1 MB OS thread), so thousands of concurrent connections are practical.

---

### Thread Safety Summary

| Data | Protection | Reason |
|---|---|---|
| `h.clients`, `h.rooms` (in `Run` loop) | Owned by hub goroutine, no lock needed | Only touched by the select cases |
| `h.rooms` (in `JoinRoom`/`LeaveRoom`) | `sync.RWMutex` | Called directly from `readPump` goroutines |
| `c.send` channel | Buffered channel (lock-free) | Go channels are goroutine-safe |
| `c.conn` writes | Serialized through `writePump` | gorilla/ws requires single writer |
| `c.conn` reads | Serialized through `readPump` | gorilla/ws requires single reader |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SUPABASE_URL` | ✅ | Supabase project URL (for JWKS) |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_JWT_SECRET` | ✅ | JWT secret (HS256 fallback) |
| `PORT` | — | HTTP port (default `8080`) |
| `ENV` | — | `production` enables Gin release mode |
| `STORAGE_ENDPOINT` | — | S3-compatible endpoint |
| `STORAGE_ACCESS_KEY` | — | S3 access key |
| `STORAGE_SECRET_KEY` | — | S3 secret key |
| `STORAGE_BUCKET` | — | S3 bucket name |
| `GEMINI_API_KEY` | — | Google Gemini key (AI summarise) |
| `GROQ_API_KEY` | — | Groq key (AI chat, fast inference) |
