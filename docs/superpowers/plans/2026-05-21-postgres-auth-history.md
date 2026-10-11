# PostgreSQL Auth History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a first usable PostgreSQL-backed account system, project history, and workspace save/restore flow for the Gaotie design system.

**Architecture:** The backend owns users, opaque HTTP-only sessions, projects, project snapshots, conversations, and messages. The frontend gates the app behind login, adds a compact project bar, and serializes existing React context state into one project snapshot JSON document.

**Tech Stack:** NestJS, PostgreSQL via `pg`, React 19, Vite, Vitest, Jest.

---

### Task 1: Backend Auth And Persistence

**Files:**
- Create: `gaotie-server/src/database/migrations.ts`
- Create: `gaotie-server/src/database/database.service.ts`
- Create: `gaotie-server/src/database/database.module.ts`
- Create: `gaotie-server/src/auth/password.service.ts`
- Create: `gaotie-server/src/auth/auth.service.ts`
- Create: `gaotie-server/src/auth/auth.controller.ts`
- Create: `gaotie-server/src/auth/auth.module.ts`
- Create: `gaotie-server/src/auth/password.service.spec.ts`
- Create: `gaotie-server/src/auth/auth.service.spec.ts`
- Modify: `gaotie-server/src/app.module.ts`
- Modify: `gaotie-server/src/main.ts`
- Modify: `gaotie-server/package.json`

- [x] **Step 1: Write failing password and auth service tests**

```bash
cd gaotie-server
npm test -- password.service.spec.ts auth.service.spec.ts
```

Expected: tests fail because `PasswordService` and `AuthService` do not exist.

- [x] **Step 2: Implement minimal backend modules**

Create database migrations for `users`, `user_sessions`, `projects`, `project_snapshots`, `conversations`, and `messages`. Implement password hashing with Node `crypto.scrypt`, opaque session tokens, and cookie-aware auth endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.

- [x] **Step 3: Run backend auth tests**

```bash
cd gaotie-server
npm test -- password.service.spec.ts auth.service.spec.ts
```

Expected: both suites pass.

### Task 2: Backend Project Snapshots And Messages

**Files:**
- Create: `gaotie-server/src/projects/projects.service.ts`
- Create: `gaotie-server/src/projects/projects.controller.ts`
- Create: `gaotie-server/src/projects/projects.module.ts`
- Create: `gaotie-server/src/projects/projects.service.spec.ts`
- Modify: `gaotie-server/src/app.module.ts`

- [x] **Step 1: Write failing project service tests**

```bash
cd gaotie-server
npm test -- projects.service.spec.ts
```

Expected: tests fail because the project service does not exist.

- [x] **Step 2: Implement project APIs**

Add `GET /projects`, `POST /projects`, `GET /projects/:id/snapshot`, `PUT /projects/:id/snapshot`, `GET /projects/:id/conversations`, `POST /projects/:id/conversations`, `GET /projects/:id/conversations/:conversationId/messages`, and `POST /projects/:id/conversations/:conversationId/messages`.

- [x] **Step 3: Run project tests**

```bash
cd gaotie-server
npm test -- projects.service.spec.ts
```

Expected: project creation, ownership checks, snapshot save/restore, and message append tests pass.

### Task 3: Frontend Login And Workspace Persistence

**Files:**
- Create: `gaotie-web/src/auth/authApi.ts`
- Create: `gaotie-web/src/auth/AuthContext.tsx`
- Create: `gaotie-web/src/components/auth/LoginPage.tsx`
- Create: `gaotie-web/src/projects/projectApi.ts`
- Create: `gaotie-web/src/projects/ProjectContext.tsx`
- Create: `gaotie-web/src/projects/workspaceSnapshot.ts`
- Create: `gaotie-web/src/components/projects/ProjectBar.tsx`
- Create: `gaotie-web/src/components/projects/ProjectPersistence.tsx`
- Create: `gaotie-web/src/projects/workspaceSnapshot.test.ts`
- Modify: `gaotie-web/src/context/ChatContext.tsx`
- Modify: `gaotie-web/src/context/ImageSearchContext.tsx`
- Modify: `gaotie-web/src/context/CaseSearchContext.tsx`
- Modify: `gaotie-web/src/context/FinalProposalContext.tsx`
- Modify: `gaotie-web/src/App.tsx`
- Modify: `gaotie-web/src/App.css`

- [x] **Step 1: Write failing snapshot tests**

```bash
cd gaotie-web
npm run test -- workspaceSnapshot.test.ts
```

Expected: tests fail because snapshot normalization helpers do not exist.

- [x] **Step 2: Implement frontend state capture and restore**

Add API clients using `credentials: 'include'`, auth provider, login page, project provider, project bar, and snapshot capture/restore helpers. Extend contexts with controlled setters needed for restore.

- [x] **Step 3: Run frontend tests**

```bash
cd gaotie-web
npm run test -- workspaceSnapshot.test.ts
```

Expected: snapshot defaults, capture shape, and restore normalization tests pass.

### Task 4: Build, Deploy, And Verify

**Files:**
- Modify server `.env` outside git with `DATABASE_URL`.
- Modify deployed Nginx config to proxy `/auth` and `/projects`.
- Start PostgreSQL container on ECS.

- [x] **Step 1: Run full verification**

```bash
cd gaotie-server && npm run build && npm test
cd ../gaotie-web && npm run build && npm run test
```

Expected: backend build/tests and frontend build/tests pass.

- [x] **Step 2: Deploy**

Sync backend and frontend to `/opt/gaotie-system`, install backend production dependencies, start PostgreSQL, restart `gaotie-server.service`, and reload Nginx.

- [x] **Step 3: Verify public API**

```bash
curl -i http://8.210.235.216/auth/me
```

Expected: unauthenticated response returns `{"user":null}` and the public frontend loads the login page.
