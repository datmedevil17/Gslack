# App Routes — Implementation Status

> **Auth model:** All protected routes require a Supabase JWT in `Authorization: Bearer <token>`.  
> **Base URL:** configured via `API_BASE_URL` in `src/lib/api.ts`  
> **Legend:** ✅ Implemented · ⚠️ Stub (returns 501) · 🔲 Not started (frontend screen missing)

---

## 1. Auth `(public — no token required)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `POST` | `/api/v1/auth/register` | ⚠️ Stub | 🔲 | Email/password signup |
| `POST` | `/api/v1/auth/login` | ⚠️ Stub | 🔲 | Email/password login |
| `POST` | `/api/v1/auth/logout` | ⚠️ Stub | ✅ (supabase.signOut) | |
| `POST` | `/api/v1/auth/refresh-token` | ⚠️ Stub | ✅ (handled by supabase sdk) | |
| `POST` | `/api/v1/auth/forgot-password` | ⚠️ Stub | 🔲 | |
| `POST` | `/api/v1/auth/reset-password` | ⚠️ Stub | 🔲 | |
| `POST` | `/api/v1/auth/verify-email` | ⚠️ Stub | 🔲 | |
| `POST` | `/api/v1/auth/resend-verification` | ⚠️ Stub | 🔲 | |
| `POST` | `/api/v1/auth/oauth/google` | ⚠️ Stub | ✅ `LoginScreen` | OAuth via Supabase SDK — backend stub unused |
| `POST` | `/api/v1/auth/oauth/github` | ⚠️ Stub | ✅ `LoginScreen` | OAuth via Supabase SDK — backend stub unused |

> **Note:** OAuth is handled entirely by the Supabase JS SDK (`signInWithOAuth`). The backend `/auth/oauth/*` stubs are only needed if you add a custom token exchange flow later.

---

## 2. Users `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `GET` | `/api/v1/users/me` | ✅ | ✅ `ProfileScreen` | Auto-creates user record on first call |
| `PUT` | `/api/v1/users/me` | ⚠️ Stub | 🔲 | Update display name, bio |
| `DELETE` | `/api/v1/users/me` | ⚠️ Stub | 🔲 | Account deletion |
| `PUT` | `/api/v1/users/me/password` | ⚠️ Stub | 🔲 | Email/password accounts only |
| `PUT` | `/api/v1/users/me/avatar` | ⚠️ Stub | 🔲 | Needs file upload first |
| `PUT` | `/api/v1/users/me/status` | ⚠️ Stub | 🔲 | Online / away / DND + status text |
| `PUT` | `/api/v1/users/me/preferences` | ⚠️ Stub | 🔲 | Theme, notification prefs |
| `GET` | `/api/v1/users/me/notifications` | ⚠️ Stub | 🔲 | Delegated to `/notifications` |
| `PUT` | `/api/v1/users/me/notifications` | ⚠️ Stub | 🔲 | |
| `GET` | `/api/v1/users/search?q=` | ⚠️ Stub | 🔲 | Used in invite / DM flows |
| `GET` | `/api/v1/users/:userID` | ⚠️ Stub | 🔲 | Public profile view |

---

## 3. Workspaces `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `POST` | `/api/v1/workspaces` | ✅ | ✅ `WorkspaceListScreen` | |
| `GET` | `/api/v1/workspaces` | ✅ | ✅ `WorkspaceListScreen` | |
| `GET` | `/api/v1/workspaces/:workspaceID` | ✅ | 🔲 | |
| `PUT` | `/api/v1/workspaces/:workspaceID` | ✅ | 🔲 | Settings screen |
| `DELETE` | `/api/v1/workspaces/:workspaceID` | ✅ | 🔲 | |
| `PUT` | `/api/v1/workspaces/:workspaceID/avatar` | ⚠️ Stub | 🔲 | Needs storage |
| `GET` | `/api/v1/workspaces/:workspaceID/members` | ✅ | 🔲 | |
| `POST` | `/api/v1/workspaces/:workspaceID/members/invite` | ⚠️ Stub | 🔲 | Email invite |
| `DELETE` | `/api/v1/workspaces/:workspaceID/members/:userID` | ✅ | 🔲 | |
| `PUT` | `/api/v1/workspaces/:workspaceID/members/:userID/role` | ✅ | 🔲 | Admin panel |
| `POST` | `/api/v1/workspaces/join/:inviteCode` | ✅ | ✅ `WorkspaceListScreen` | Join modal |
| `GET` | `/api/v1/workspaces/:workspaceID/invite-link` | ✅ | 🔲 | |
| `POST` | `/api/v1/workspaces/:workspaceID/invite-link/reset` | ✅ | 🔲 | |
| `GET` | `/api/v1/workspaces/:workspaceID/settings` | ✅ | 🔲 | |
| `PUT` | `/api/v1/workspaces/:workspaceID/settings` | ✅ | 🔲 | |
| `GET` | `/api/v1/workspaces/:workspaceID/presence` | ✅ | 🔲 | Sidebar member list |
| `GET` | `/api/v1/workspaces/:workspaceID/files` | ✅ | 🔲 | Files tab |

---

## 4. Channels `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `POST` | `/api/v1/workspaces/:workspaceID/channels` | ✅ | ✅ `ChannelListScreen` | Create channel |
| `GET` | `/api/v1/workspaces/:workspaceID/channels` | ✅ | ✅ `ChannelListScreen` | |
| `GET` | `/api/v1/workspaces/:workspaceID/channels/:channelID` | ✅ | 🔲 | Channel detail / header |
| `PUT` | `/api/v1/workspaces/:workspaceID/channels/:channelID` | ✅ | 🔲 | Edit channel |
| `DELETE` | `/api/v1/workspaces/:workspaceID/channels/:channelID` | ✅ | 🔲 | |
| `POST` | `/api/v1/workspaces/:workspaceID/channels/:channelID/join` | ✅ | ✅ `ChannelListScreen` | |
| `POST` | `/api/v1/workspaces/:workspaceID/channels/:channelID/leave` | ✅ | 🔲 | |
| `GET` | `/api/v1/workspaces/:workspaceID/channels/:channelID/members` | ✅ | 🔲 | |
| `POST` | `/api/v1/workspaces/:workspaceID/channels/:channelID/members` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/workspaces/:workspaceID/channels/:channelID/members/:userID` | ✅ | 🔲 | |
| `PUT` | `/api/v1/workspaces/:workspaceID/channels/:channelID/members/:userID/role` | ✅ | 🔲 | |
| `GET` | `/api/v1/workspaces/:workspaceID/channels/:channelID/pins` | ✅ | 🔲 | Pinned messages panel |
| `POST` | `/api/v1/workspaces/:workspaceID/channels/:channelID/archive` | ✅ | 🔲 | |
| `POST` | `/api/v1/workspaces/:workspaceID/channels/:channelID/unarchive` | ✅ | 🔲 | |

---

## 5. Messages `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `GET` | `/api/v1/channels/:channelID/messages` | ✅ | ✅ `ChatScreen` | |
| `POST` | `/api/v1/channels/:channelID/messages` | ✅ | ✅ `ChatScreen` | |
| `GET` | `/api/v1/channels/:channelID/messages/search?q=` | ✅ | 🔲 | |
| `GET` | `/api/v1/channels/:channelID/messages/:messageID` | ✅ | 🔲 | |
| `PUT` | `/api/v1/channels/:channelID/messages/:messageID` | ✅ | 🔲 | Edit message (long-press) |
| `DELETE` | `/api/v1/channels/:channelID/messages/:messageID` | ✅ | 🔲 | Delete message (long-press) |
| `POST` | `/api/v1/channels/:channelID/messages/:messageID/pin` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/channels/:channelID/messages/:messageID/pin` | ✅ | 🔲 | |
| `GET` | `/api/v1/channels/:channelID/messages/:messageID/thread` | ✅ | 🔲 | Thread view screen |
| `POST` | `/api/v1/channels/:channelID/messages/:messageID/thread` | ✅ | 🔲 | Reply in thread |
| `POST` | `/api/v1/channels/:channelID/messages/:messageID/reactions` | ✅ | 🔲 | Emoji picker |
| `DELETE` | `/api/v1/channels/:channelID/messages/:messageID/reactions/:emoji` | ✅ | 🔲 | |
| `POST` | `/api/v1/channels/:channelID/messages/:messageID/forward` | ✅ | 🔲 | |

---

## 6. Direct Messages `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `GET` | `/api/v1/dm` | ✅ | 🔲 | DM list screen |
| `POST` | `/api/v1/dm` | ✅ | 🔲 | Start DM |
| `GET` | `/api/v1/dm/:dmID` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/dm/:dmID` | ✅ | 🔲 | |
| `GET` | `/api/v1/dm/:dmID/messages` | ✅ | 🔲 | DM chat screen |
| `POST` | `/api/v1/dm/:dmID/messages` | ✅ | 🔲 | |
| `PUT` | `/api/v1/dm/:dmID/messages/:messageID` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/dm/:dmID/messages/:messageID` | ✅ | 🔲 | |
| `POST` | `/api/v1/dm/:dmID/messages/:messageID/reactions` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/dm/:dmID/messages/:messageID/reactions/:emoji` | ✅ | 🔲 | |

---

## 7. Group DMs `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `POST` | `/api/v1/group-dm` | ✅ | 🔲 | |
| `GET` | `/api/v1/group-dm/:groupID` | ✅ | 🔲 | |
| `PUT` | `/api/v1/group-dm/:groupID` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/group-dm/:groupID` | ✅ | 🔲 | |
| `POST` | `/api/v1/group-dm/:groupID/members` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/group-dm/:groupID/members/:userID` | ✅ | 🔲 | |
| `GET` | `/api/v1/group-dm/:groupID/messages` | ✅ | 🔲 | |
| `POST` | `/api/v1/group-dm/:groupID/messages` | ✅ | 🔲 | |

---

## 8. Notifications `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `GET` | `/api/v1/notifications` | ✅ | 🔲 | Notification centre |
| `PUT` | `/api/v1/notifications/:notificationID/read` | ✅ | 🔲 | |
| `PUT` | `/api/v1/notifications/read-all` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/notifications/:notificationID` | ✅ | 🔲 | |
| `GET` | `/api/v1/notifications/unread-count` | ✅ | 🔲 | Badge on tab bar |
| `PUT` | `/api/v1/notifications/settings` | ✅ | 🔲 | Settings screen |

---

## 9. Files `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `POST` | `/api/v1/files/upload` | ✅ | 🔲 | Attach in composer |
| `GET` | `/api/v1/files/:fileID` | ✅ | 🔲 | |
| `DELETE` | `/api/v1/files/:fileID` | ✅ | 🔲 | |
| `GET` | `/api/v1/files/:fileID/download` | ✅ | 🔲 | |

---

## 10. Search `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `GET` | `/api/v1/search?q=` | ✅ | 🔲 | Global search screen |
| `GET` | `/api/v1/search/messages?q=` | ✅ | 🔲 | |
| `GET` | `/api/v1/search/files?q=` | ✅ | 🔲 | |
| `GET` | `/api/v1/search/channels?q=` | ✅ | 🔲 | |
| `GET` | `/api/v1/search/users?q=` | ✅ | 🔲 | |

---

## 11. Presence `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `GET` | `/api/v1/presence/:userID` | ✅ | 🔲 | User profile popover |
| `PUT` | `/api/v1/presence/me` | ✅ | 🔲 | Set on app foreground/background |

---

## 12. AI `(protected)`

| Method | Route | Backend | Frontend Screen | Notes |
|--------|-------|---------|-----------------|-------|
| `POST` | `/api/v1/ai/chat` | ✅ | ✅ `ChatScreen` (`/ai` slash cmd) | Groq fast inference |
| `POST` | `/api/v1/ai/summarize/:channelID` | ✅ | ✅ `ChatScreen` (`/summarize` cmd) | Gemini long-context |
| `POST` | `/api/v1/ai/reply-suggest/:messageID` | ✅ | 🔲 | Smart reply chips on long-press |

---

## 13. Webhooks & Apps `(protected)`

| Method | Route | Backend | Notes |
|--------|-------|---------|-------|
| `POST` | `/api/v1/webhooks` | ⚠️ Stub | Low priority — admin-only |
| `GET` | `/api/v1/webhooks` | ⚠️ Stub | |
| `GET/PUT/DELETE` | `/api/v1/webhooks/:webhookID` | ⚠️ Stub | |
| `POST` | `/api/v1/webhooks/:webhookID/test` | ⚠️ Stub | |
| `GET/POST` | `/api/v1/apps` / `/api/v1/apps/install` | ⚠️ Stub | Future app marketplace |
| `DELETE` | `/api/v1/apps/:appID/uninstall` | ⚠️ Stub | |

---

## 14. WebSocket

| Endpoint | Backend | Frontend | Notes |
|----------|---------|----------|-------|
| `GET /api/v1/ws?token=<jwt>` | ✅ | 🔲 | Real-time messages, presence, reactions |

---

## Priority Roadmap

### 🔴 P0 — Core MVP (build these first)
1. `GET /api/v1/users/me` → wire to `ProfileScreen` to show real name
2. `GET/POST /api/v1/workspaces` → `WorkspaceListScreen`
3. `GET/POST /api/v1/workspaces/:id/channels` → `ChannelListScreen`
4. `GET/POST /api/v1/channels/:id/messages` → `ChatScreen`
5. `GET /api/v1/ws` → WebSocket for real-time updates

### 🟡 P1 — Core social
6. `GET/POST /api/v1/dm` + DM chat screen
7. `POST /api/v1/channels/:id/messages/:id/reactions`
8. `GET /api/v1/notifications/unread-count` → tab badge
9. `PUT /api/v1/presence/me` → online/away on app state change

### 🟢 P2 — Polish
10. Thread view (`GET/POST .../thread`)
11. `POST /api/v1/files/upload` → composer attachment
12. `GET /api/v1/search` → global search screen
13. `POST /api/v1/ai/reply-suggest/:messageID` → smart reply chips
