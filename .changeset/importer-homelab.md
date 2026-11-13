---
'infra3d-import-compose': minor
---

Works with typical single-host homelabs: the directory source detects a single `compose.yaml`, one folder per stack (Dockge, Komodo) and one folder per host. Routes from caddy-docker-proxy labels and nginx-proxy's `VIRTUAL_HOST` besides Traefik (also multiple hosts per Traefik rule). New config: `checks` for services behind proxies the importer cannot see, `host` and `defaultAddress`. Ports bound to localhost and UDP ports are no longer checked; published ports are labelled after their service and checked on the host address (`address`, `meta.LAN` or `defaultAddress`) before the service's domain. `buildTopology()` takes an optional `warnings` array.
