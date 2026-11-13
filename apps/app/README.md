# infra3d app

Self-hosted infra3d: imports your Docker Compose stacks, checks every endpoint and serves the
3D view with root-cause hints. Image: `ghcr.io/surfacescratcher/infra3d` (amd64, arm64).

```bash
docker run -d -p 8080:8080 -v ./stacks:/stacks:ro ghcr.io/surfacescratcher/infra3d:latest
```

A complete compose file is in [examples/docker-compose.yml](../../examples/docker-compose.yml).

## How it works

1. Every interval the server reads the topology: it imports the compose files below `/stacks`
   with [infra3d-import-compose](../../packages/import-compose), or loads a ready-made topology
   file. A broken import keeps the last good topology and shows the error in the UI.
2. It probes every endpoint: HTTP(S) URLs with a request (redirects, 401 and 403 count as up,
   5xx and Traefik's "404 page not found" as down), `tcp://host:port` with a connect.
   An endpoint counts as down after two failures in a row and as up again right away.
3. `analyzeHealth()` from [infra3d](../../packages/infra3d) derives suspects and likely causes
   from the dependency graph.
4. Changes go to ntfy and/or a webhook.

Probes run from inside the container. Endpoints that are only reachable from your LAN need a
network the container can reach them from (the default bridge network usually works).

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `INFRA3D_STACKS` | `/stacks` | compose stacks: `<host>/<stack>/compose.yaml`, or an Ansible repository |
| `INFRA3D_SOURCE` | `auto` | `directory`, `ansible` or `auto` (Ansible if `inventory/host_vars` exists) |
| `INFRA3D_CONFIG` | `/config/infra3d.config.json` | optional hosts, sites, uplinks and special cases, see [the importer](../../packages/import-compose#config) |
| `INFRA3D_TOPOLOGY` | | path to a ready-made topology JSON; skips the import |
| `INFRA3D_INTERVAL` | `60` | seconds between checks (and topology reloads) |
| `INFRA3D_CONFIRM_FAILS` | `2` | failures in a row before an endpoint counts as down |
| `INFRA3D_TIMEOUT` | `10` | seconds per probe |
| `NTFY_URL` | | e.g. `https://ntfy.sh/my-homelab` |
| `NTFY_TOKEN` | | access token for a protected ntfy topic |
| `WEBHOOK_URL` | | receives `{ event: "down" \| "up", title, message, endpoints, causes, url }` as JSON |
| `INFRA3D_BASE_URL` | | public URL of the app, used as the click target in notifications |
| `INFRA3D_AUTH` | | `user:password` for HTTP Basic Auth on UI and API (`/healthz` stays open) |
| `PORT` | `8080` | |

Self-signed certificates: set `NODE_TLS_REJECT_UNAUTHORIZED=0` to accept them.

## Security

The UI shows your whole infrastructure: hosts, containers, internal networks, domains and which
of them are down. Do not expose it to the internet without protection. Either set `INFRA3D_AUTH`
or put it behind the authentication of your reverse proxy (Authelia, Authentik, Cloudflare Access …).

- The stacks are mounted read-only and the importer never copies environment values, secrets
  or volumes into the topology. Only structure is kept: services, images, networks, routes, ports.
- infra3d makes no outgoing requests besides your own health checks and notifications.
  No telemetry, no update checks.
- The container runs as an unprivileged user and needs no Docker socket.

## API

- `GET /api/state`: topology, check results, status per node, failed endpoints, suspects and causes
- `POST /api/check`: re-read the topology and check now
- `GET /healthz`: liveness

## Development

```bash
npm run build -w infra3d -w infra3d-import-compose
INFRA3D_STACKS=../../packages/import-compose/test/fixtures/directory npm run dev -w @infra3d/app
```

This starts the server on :8080 and Vite with a proxy to it. `npm run dev:demo -w @infra3d/app`
runs the static demo without a server instead.
