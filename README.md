# infra3d

[![CI](https://github.com/SurfaceScratcher/infra3d/actions/workflows/ci.yml/badge.svg)](https://github.com/SurfaceScratcher/infra3d/actions/workflows/ci.yml)

See how your infrastructure hangs together. infra3d reads your Docker Compose stacks, checks
every endpoint and shows hosts, networks, containers and endpoints as stacked 3D layers you can
rotate, zoom and click through.

- **No drawing, no scanning:** the topology comes straight from your compose files (plain stack
  folders or an Ansible repository), including reverse proxy routes, published ports and `depends_on`.
- **Root-cause hints:** when endpoints fail, the dependency graph narrows the failure down to the
  containers, networks or hosts that can explain it, and tells you when the fault must be in the
  service itself.
- **Dependencies and impact:** select a node to highlight what it **needs** (blue) and what
  **fails with it** (red).
- **Notifications** via ntfy or a webhook when something goes down or recovers.
- Runs as a **Docker container** (amd64 and arm64), or embed the **React component** in your own app.

![infra3d demo: a host goes offline, four endpoints turn red and the dependency graph narrows 52 nodes down to four likely causes; selecting the host highlights everything that fails with it](docs/demo.gif)

**[Live demo](https://surfacescratcher.github.io/infra3d/)** · [Library docs](packages/infra3d) · [Importer](packages/import-compose) · [Contributing](CONTRIBUTING.md)

## Self-hosted app

```yaml
# docker-compose.yml
services:
  infra3d:
    image: ghcr.io/surfacescratcher/infra3d:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    extra_hosts:
      - "host.docker.internal:host-gateway"   # to check ports on this host
    volumes:
      - /opt/stacks:/stacks:ro     # one folder per stack, or per host and stack
      - ./config:/config:ro        # optional: config/infra3d.config.json
    environment:
      NTFY_URL: https://ntfy.sh/my-homelab   # optional
```

`docker compose up -d`, then open http://localhost:8080. The layout is detected: a single
`compose.yaml`, one folder per stack (Dockge, Komodo), one folder per host and stack, or the root of
an Ansible repository. Routes come from Traefik, Caddy (caddy-docker-proxy) and nginx-proxy; for
anything else, add [`checks`](packages/import-compose#config) to the config.
All options are in [apps/app](apps/app#configuration). The UI shows your whole infrastructure, so
keep it on your LAN or protect it with `INFRA3D_AUTH` or your reverse proxy's login, see
[Security](apps/app#security). Read-only, no telemetry, no Docker socket needed.

## React component

```bash
npm install infra3d three @react-three/fiber @react-three/drei
```

```tsx
import { useState } from 'react';
import { InfraScene } from 'infra3d';
import topology from './topology.json';

export function Infra() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ height: 600 }}>
      <InfraScene topology={topology} selectedId={selected} onSelect={setSelected} />
    </div>
  );
}
```

Generate `topology.json` from your compose stacks:

```bash
npx infra3d-import-compose ./stacks -o topology.json
```

## Packages

| Package | |
| --- | --- |
| [`infra3d`](packages/infra3d) | The scene component, plus `infra3d/core` with the data model, validation, layout and health analysis (no React needed) |
| [`infra3d-import-compose`](packages/import-compose) | CLI and API that build a topology from Docker Compose files, plain directories or an Ansible inventory |
| [`apps/app`](apps/app) | The self-hosted app (Docker image) and the live demo |

## Development

```bash
npm install
npm run dev     # demo with the example topology
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture and how to add an importer.

## How this was built

infra3d was written with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding
agent. I came up with the idea, made the design decisions, reviewed the changes and run it
against my own homelab every day. The test suite, CI and the [security notes](apps/app#security)
are there so you don't have to take that on trust. Questions about how something works are
welcome in the issues.

## License

[MIT](LICENSE)
