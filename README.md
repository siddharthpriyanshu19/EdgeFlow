# EdgeFlow

**Real-Time Collaborative System Design Platform**

EdgeFlow is a production-grade SaaS platform where software engineers, architects, DevOps engineers, and engineering teams collaboratively design distributed systems, cloud architectures, microservices, databases, APIs, and infrastructure — in real time.

Think: Figma × Excalidraw × Lucidchart × AWS Architecture Designer — with a multiplayer collaboration engine at its core.

---

## Architecture Overview

```
Clients
  ↓
NGINX (Reverse Proxy + Load Balancer)
  ↓                    ↓
REST API           WebSocket Gateway
(Fastify)          (Socket.IO)
  ↓                    ↓
Application Layer  Sync Engine
  ↓                    ↓
Domain Layer       Redis Pub/Sub
  ↓                    ↓
Infrastructure     PostgreSQL (Event Store)
  ↓
Redis Cache + BullMQ Workers
```

### Clean Architecture Layers

```
Presentation  →  controllers, routes, hooks, WebSocket gateway
Application   →  services, use cases, sync engine
Domain        →  entities, errors, value objects
Infrastructure→  repositories, cache, email, workers, observability
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API Framework | Fastify 5 |
| Real-Time | Socket.IO 4 + Redis Adapter |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Cache + Pub/Sub | Redis 7 |
| Background Jobs | BullMQ |
| Validation | Zod |
| Logging | Pino |
| Observability | OpenTelemetry + Prometheus + Grafana + Loki |
| Auth | JWT + bcrypt + OAuth (Google/GitHub) |
| Infrastructure | Docker + NGINX |
| CI/CD | GitHub Actions |
| Monorepo | npm Workspaces + Turborepo |

---

## Quick Start (Docker)

```bash
# Clone the repository
git clone https://github.com/your-org/edgeflow.git
cd edgeflow

# Copy environment file
cp apps/api/.env.example apps/api/.env

# Start all services
docker compose up -d

# Run database migrations
docker compose exec api npx prisma migrate deploy

# Seed test data
docker compose exec api npm run prisma:seed
```

Services will be available at:

| Service | URL |
|---------|-----|
| API (via NGINX) | http://localhost/api/v1 |
| API (direct) | http://localhost:3001 |
| API Docs (Swagger) | http://localhost:3001/docs |
| WebSocket | ws://localhost/ws |
| Grafana | http://localhost:3100 |
| Prometheus | http://localhost:9091 |
| MailDev | http://localhost:1080 |

---

## Local Development

### Prerequisites

- Node.js 20+
- Docker Desktop
- npm 10+

### Setup

```bash
# Install all dependencies
npm install

# Start infrastructure (DB, Redis, etc.)
docker compose up postgres redis maildev -d

# Copy environment file
cp apps/api/.env.example apps/api/.env

# Run migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Seed test data
npm run db:seed

# Start API development server
npm run dev --workspace=apps/api
```

### Test Accounts (after seed)

| Email | Password | Role |
|-------|----------|------|
| alice@edgeflow.io | Password123 | Workspace Owner |
| bob@edgeflow.io | Password123 | Editor |
| carol@edgeflow.io | Password123 | Viewer |

---

## Monorepo Structure

```
edgeflow/
├── apps/
│   ├── api/                     # Fastify API + WebSocket Gateway
│   │   ├── src/
│   │   │   ├── application/     # Services, use cases, Sync Engine
│   │   │   ├── domain/          # Entities, errors
│   │   │   ├── infrastructure/  # DB, Redis, Email, Workers, Observability
│   │   │   └── presentation/    # Routes, Controllers, Hooks, Plugins
│   │   └── prisma/
│   │       ├── schema.prisma    # Database schema
│   │       └── seed.ts          # Test data seed
│   └── web/                     # Next.js frontend (Phase 6)
├── packages/
│   ├── types/                   # Shared TypeScript types
│   ├── validation/              # Shared Zod schemas
│   └── logger/                  # Shared Pino logger
└── infrastructure/
    ├── nginx/                   # NGINX config
    ├── prometheus/              # Prometheus scrape config
    ├── grafana/                 # Grafana dashboards + provisioning
    └── loki/                    # Loki log aggregation config
```

---

## REST API Reference

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Authenticate |
| POST | `/api/v1/auth/logout` | Revoke session |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/verify-email` | Verify email address |
| POST | `/api/v1/auth/forgot-password` | Send reset email |
| POST | `/api/v1/auth/reset-password` | Reset with token |
| GET | `/api/v1/auth/me` | Get current user |
| GET | `/api/v1/auth/sessions` | List active sessions |
| DELETE | `/api/v1/auth/sessions/:id` | Revoke session |

### Workspaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/workspaces` | List my workspaces |
| POST | `/api/v1/workspaces` | Create workspace |
| GET | `/api/v1/workspaces/:id` | Get workspace |
| PATCH | `/api/v1/workspaces/:id` | Update workspace |
| DELETE | `/api/v1/workspaces/:id` | Delete workspace |
| GET | `/api/v1/workspaces/:id/members` | List members |
| POST | `/api/v1/workspaces/:id/invitations` | Invite member |
| POST | `/api/v1/workspaces/invitations/:token/accept` | Accept invite |
| PATCH | `/api/v1/workspaces/:id/members/:userId` | Update role |
| DELETE | `/api/v1/workspaces/:id/members/:userId` | Remove member |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/workspaces/:wId/projects` | List projects |
| POST | `/api/v1/workspaces/:wId/projects` | Create project |
| GET | `/api/v1/workspaces/:wId/projects/:id` | Get project |
| PATCH | `/api/v1/workspaces/:wId/projects/:id` | Update project |
| DELETE | `/api/v1/workspaces/:wId/projects/:id` | Delete project |

---

## WebSocket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ projectId, lastSequenceNumber? }` | Join collaboration room |
| `room:leave` | `{ roomId }` | Leave room |
| `canvas:event` | `CanvasEvent` | Emit canvas change |
| `presence:update` | `Partial<UserPresence>` | Update presence state |
| `presence:cursor` | `{ x, y, roomId }` | Update live cursor |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room:joined` | `{ roomId, snapshot, missedEvents, presence }` | Room join confirmation |
| `room:user_joined` | `UserPresence` | Another user joined |
| `room:user_left` | `{ userId, displayName }` | User left |
| `canvas:event` | `CanvasEvent` | Incoming canvas change |
| `presence:update` | `UserPresence` | Presence change |
| `presence:cursor` | `{ userId, x, y }` | Live cursor position |
| `error` | `{ code, message }` | Error frame |

---

## Canvas Event Types

All events are immutable, sequenced, and replayable.

```
NodeCreated       NodeDeleted       NodeMoved
NodeResized       NodeRotated       NodeRenamed
NodeColorChanged  ConnectionCreated ConnectionDeleted
PropertyUpdated   CommentAdded      CommentResolved
SelectionChanged  ViewportChanged   CursorMoved
UndoRedo          ZoomChanged       PanChanged
SnapshotRestored  LayerCreated      GroupCreated
```

---

## RBAC Roles

| Role | Permissions |
|------|-------------|
| VIEWER | Read-only access to workspace and projects |
| EDITOR | Create/modify nodes, connections, comments |
| ADMIN | Invite members, manage roles, project settings |
| OWNER | All operations including workspace deletion |

---

## Database Schema

Core tables: `users`, `sessions`, `refresh_tokens`, `workspaces`, `workspace_members`, `workspace_invitations`, `projects`, `project_members`, `canvas_layers`, `canvas_nodes`, `canvas_connections`, `canvas_events`, `canvas_snapshots`, `project_versions`, `comments`, `comment_reactions`, `comment_mentions`, `notifications`, `audit_logs`, `api_keys`

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Concurrent users | 1,000+ |
| Active rooms | 1,000+ |
| Sync latency | < 50ms |
| Events/minute | 100,000+ |
| Reconnect time | < 2 seconds |
| API p95 latency | < 200ms |
| Canvas nodes/project | 100,000 |

---

## Development Phases

- [x] **Phase 1** — Architecture & Project Setup
- [x] **Phase 2** — Authentication (JWT, sessions, refresh tokens)
- [x] **Phase 3** — Database Design (Prisma schema, all tables)
- [x] **Phase 4** — WebSocket Gateway (Socket.IO + Redis adapter)
- [x] **Phase 5** — Synchronization Engine (event sourcing, snapshots)
- [ ] **Phase 6** — Infinite Canvas (Next.js + React Flow)
- [ ] **Phase 7** — Component Library (80+ components)
- [ ] **Phase 8** — Presence System (live cursors, viewport)
- [ ] **Phase 9** — Version History (replay, snapshots, named versions)
- [ ] **Phase 10** — Comments (threads, mentions, reactions)
- [ ] **Phase 11** — Export System (PNG, SVG, PDF, JSON, YAML)
- [ ] **Phase 12** — Observability (Prometheus, Grafana dashboard)
- [ ] **Phase 13** — Dockerization (production multi-stage)
- [ ] **Phase 14** — Horizontal Scaling (Redis cluster, K8s)
- [ ] **Phase 15** — Performance Optimization

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

MIT
