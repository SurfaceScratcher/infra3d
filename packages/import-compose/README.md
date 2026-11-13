# infra3d-import-compose

Builds an [infra3d](../infra3d) topology from Docker Compose files.

```bash
npx infra3d-import-compose <root> [-c infra3d.config.json] [-o topology.json] [-s directory|ansible]
```

Without `-o` the topology goes to stdout. Without `-c`, `./infra3d.config.json` is used if present.

## Sources

| Source | Layout |
| --- | --- |
| `directory` | `<root>/<host>/<stack>/compose.yaml` (or `docker-compose.yml`) |
| `ansible` | `inventory/host_vars/<host>/main.yml` (`stacks`, `nas_backup_enabled`, `nas_mounts`), `inventory/group_vars/all/main.yml` (`domain`), `stacks/<host>/<stack>/docker-compose.yml` |

`auto` (default) picks `ansible` when `<root>/inventory/host_vars` exists.

A source is a function `(root, config) => ImportInput` that lists hosts with their parsed
compose files. Adding one for another layout (Kubernetes manifests, Portainer, Proxmox …)
does not touch the graph logic in `buildTopology()`.

## What is derived

- one container node per service, grouped by stack; databases get `role: "database"`
- networks (stack-internal or external/shared) and `member` / `runs-on` edges
- `depends_on` → `depends`
- Traefik `Host()` rules → endpoints with `check: https://…`, routed `via` the host's Traefik container
- published ports (except 80/443) → endpoints with `check: tcp://…`
- hostnames below `domain` in environment, command or entrypoint → `uses` edges;
  images from a registry below `domain` → `image` edges

Environment values and secrets are never copied into the topology.

## Config

What compose files do not contain: hardware, sites, uplinks and special cases.
Start from [infra3d.config.example.json](infra3d.config.example.json).

| Key | |
| --- | --- |
| `hosts` | `{ "<host>": { label, meta, uplink, address } }`, in layout order. Without it every host found is used |
| `nodes`, `edges` | extra nodes and edges, e.g. sites, routers, NAS |
| `domain` | base domain for `${DOMAIN}` / `{{ domain }}`; the ansible source reads it from group vars |
| `backupTarget`, `nasTarget` | node ids for backup and network share edges |
| `networkOverrides` | per network name: `label`, `meta`, `memberOf` (e.g. macvlan into the LAN) |
| `addressLinks` | env values containing `match` get a `uses` edge to `to` |
| `authMiddlewares` | Traefik middlewares that put a login in front of a route |
| `layerLabels` | labels of the four layers, e.g. for a translated UI |

## API

```ts
import { buildTopology, directorySource } from 'infra3d-import-compose';

const topology = buildTopology(directorySource('./stacks', config), config);
```
