# Public IP Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the current Gaotie system to the new Alibaba Cloud ECS server for public-IP testing.

**Architecture:** Run the frontend behind Nginx and the NestJS backend as a Node service on the same server. Use Docker for PostgreSQL, Redis, and Neo4j when the app persistence work begins; for this first public-IP deployment, establish the server baseline and make the existing app deployable without a domain.

**Tech Stack:** Ubuntu 24.04, Docker Engine, Docker Compose, Nginx, Node.js runtime, Vite static build, NestJS production build.

---

### Task 1: Server Baseline

**Files:**
- Remote only: `/opt/gaotie-system`
- Remote only: `/opt/gaotie-system/.env`

- [ ] **Step 1: Verify SSH and OS**

Run:

```bash
ssh -i ./default.pem root@8.210.235.216 'whoami; lsb_release -a; free -h; df -h /'
```

Expected: user is `root`, OS is Ubuntu 24.04, disk has about 100GB.

- [ ] **Step 2: Secure private key locally**

Run:

```bash
chmod 600 default.pem
```

Expected: `ls -l default.pem` shows `-rw-------`.

- [ ] **Step 3: Ensure private key is ignored**

Modify `.gitignore` to include:

```gitignore
*.pem
*.key
id_rsa
id_ed25519
```

Expected: `git status --short -- default.pem` does not show the key as tracked.

### Task 2: Install Runtime Packages

**Files:**
- Remote only: system packages and services

- [ ] **Step 1: Update package index**

Run:

```bash
ssh -i ./default.pem root@8.210.235.216 'apt-get update'
```

Expected: command exits 0.

- [ ] **Step 2: Install base packages**

Run:

```bash
ssh -i ./default.pem root@8.210.235.216 'apt-get install -y ca-certificates curl gnupg git nginx ufw rsync'
```

Expected: command exits 0.

- [ ] **Step 3: Install Docker Engine**

Run the Docker official repository installation for Ubuntu 24.04, then install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, and `docker-compose-plugin`.

Expected:

```bash
docker --version
docker compose version
```

both return versions.

### Task 3: Prepare Deployment Directory

**Files:**
- Remote create: `/opt/gaotie-system`
- Remote create: `/opt/gaotie-system/gaotie-server`
- Remote create: `/opt/gaotie-system/gaotie-web`
- Remote create: `/opt/gaotie-system/images`
- Remote create: `/opt/gaotie-system/样本图片`
- Remote create: `/opt/gaotie-system/布局元素`

- [ ] **Step 1: Create remote directories**

Run:

```bash
ssh -i ./default.pem root@8.210.235.216 'mkdir -p /opt/gaotie-system'
```

Expected: directory exists.

- [ ] **Step 2: Build local app**

Run:

```bash
(cd gaotie-server && npm run build)
(cd gaotie-web && npm run build)
```

Expected: both builds exit 0.

- [ ] **Step 3: Sync required files**

Use `rsync` to upload source, package manifests, built assets, and static image directories while excluding `node_modules`, `.git`, logs, and local env files.

Expected: remote `/opt/gaotie-system` contains the app and image directories.

### Task 4: Runtime Configuration

**Files:**
- Remote create: `/opt/gaotie-system/gaotie-server/.env`

- [ ] **Step 1: Create server `.env`**

Create a remote `.env` with:

```env
PORT=3000
PUBLIC_ASSET_BASE_URL=http://8.210.235.216
SUPER_CANVAS_PUBLIC_BASE_URL=http://8.210.235.216
DEEPSEEK_API_KEY=<provided-secret>
JIMENG_ACCESS_KEY_ID=<provided-secret>
JIMENG_SECRET_ACCESS_KEY=<provided-secret>
```

Expected: file exists on server with mode `600`. Do not commit this file.

### Task 5: Start Existing App

**Files:**
- Remote create: `/etc/systemd/system/gaotie-server.service`
- Remote create: `/etc/nginx/sites-available/gaotie-system`
- Remote link: `/etc/nginx/sites-enabled/gaotie-system`

- [ ] **Step 1: Install backend production dependencies**

Run:

```bash
ssh -i ./default.pem root@8.210.235.216 'cd /opt/gaotie-system/gaotie-server && npm ci --omit=dev'
```

Expected: command exits 0.

- [ ] **Step 2: Configure backend systemd service**

Create `gaotie-server.service` to run:

```bash
node dist/main.js
```

from `/opt/gaotie-system/gaotie-server`.

Expected: `systemctl status gaotie-server` shows active.

- [ ] **Step 3: Configure Nginx**

Serve `/opt/gaotie-system/gaotie-web/dist` as the frontend, proxy `/api/` to `http://127.0.0.1:3000/`, and expose backend static image paths `/images/`, `/sample-images/`, `/layout-elements/`, `/generated/` through the backend or direct aliases.

Expected: `nginx -t` exits 0 and `systemctl reload nginx` exits 0.

### Task 6: Verification

**Files:**
- No file changes

- [ ] **Step 1: Verify local backend on server**

Run:

```bash
ssh -i ./default.pem root@8.210.235.216 'curl -sS http://127.0.0.1:3000/'
```

Expected: response contains `Hello World!`.

- [ ] **Step 2: Verify public frontend**

Run:

```bash
curl -I http://8.210.235.216/
```

Expected: HTTP 200 or 304.

- [ ] **Step 3: Verify public static images**

Run:

```bash
curl -I http://8.210.235.216/images/
```

Expected: Nginx or backend returns a reachable HTTP response.

- [ ] **Step 4: Record remaining gaps**

Record whether PostgreSQL/Redis/Neo4j persistence is not yet implemented in the app and whether API calls require code changes from hard-coded localhost URLs.
