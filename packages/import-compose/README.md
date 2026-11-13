# infra3d-import-compose

Builds an [infra3d](../infra3d) topology from Docker Compose files.

```bash
npx infra3d-import-compose <root> [-c infra3d.config.json] [-o topology.json] [-s directory|ansible]
```

Without `-o` the topology goes to stdout. Without `-c`, `./infra3d.config.json` is used if present.

## Import reports for bug reports

If the importer misreads your setup, `-r report.json` writes an anonymized copy of what it read,
which you can attach to an issue:

```bash
npx infra3d-import-compose ~/stacks -r report.json
```

Domains, IP addresses, host names, e-mail addresses and file paths are replaced consistently
(`domain1.example`, `192.0.2.x`, `host1`, `/mnt/share1`), so routes and links still match.
Environment variables, labels that are not routing rules and commands keep only the host names
and addresses in them; every other value becomes `<redacted>`. Stack, service, network and volume
names, images and ports stay, because most importer bugs depend on them. **Read the report before
you share it** and rename anything private.

Passing a report instead of a directory replays the import, e.g. to reproduce a bug:

```bash
npx infra3d-import-compose report.json -o topology.json
```

## Sources

| Source | Layout |
| --- | --- |
| `directory` | detected: `<root>/compose.yaml` (one file), `<root>/<stack>/compose.yaml` (one host, e.g. Dockge or Komodo), or `<root>/<host>/<stack>/compose.yaml` |
| `ansible` | `inventory/host_vars/<host>/main.yml` (`stacks`, `nas_backup_enabled`, `nas_mounts`), `inventory/group_vars/all/main.yml` (`domain`), `stacks/<host>/<stack>/docker-compose.yml` |

`auto` (default) picks `ansible` when `<root>/inventory/host_vars` exists.

A source is a function `(root, config) => ImportInput` that lists hosts with their parsed
compose files. Adding one for another layout (Kubernetes manifests, Portainer, Proxmox …)
does not touch the graph logic in `buildTopology()`.

## What is derived

- one container node per service, grouped by stack; databases get `role: "database"`
- networks (stack-internal or external/shared) and `member` / `runs-on` edges
- `depends_on` → `depends`
- reverse proxy routes → endpoints with `check: https://…`, routed `via` the host's proxy container:
  Traefik `Host()` rules, [caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy) `caddy` labels,
  [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy) `VIRTUAL_HOST`
- published TCP ports (except 80/443 and ports bound to 127.0.0.1) → endpoints with `check: tcp://…`
- anything else (Nginx Proxy Manager, Cloudflare tunnels …) → `checks` in the config
- hostnames below `domain` in environment, command or entrypoint → `uses` edges;
  images from a registry below `domain` → `image` edges

Environment values and secrets are never copied into the topology.

## Config

What compose files do not contain: hardware, sites, uplinks and special cases.
Start from [infra3d.config.example.json](infra3d.config.example.json).

| Key | |
| --- | --- |
| `hosts` | `{ "<host>": { label, meta, uplink, address } }`, in layout order. Without it every host found is used |
| `host` | name of the host in single-host layouts, default `host` |
| `defaultAddress` | address for TCP checks of hosts without `address` / `meta.LAN` |
| `checks` | `{ "jellyfin": "https://media.example.com", "notes/db": "tcp://10.0.0.5:5432" }`: endpoints for services whose route is not in the compose files. Keys are `service`, `stack/service` or `host/stack/service` |
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

// the same import, anonymized; buildTopology(report.input, report.config) replays it
const report = createImportReport(directorySource('./stacks', config), config);
```
