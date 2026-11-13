# infra3d-import-compose

## 0.3.0

### Minor Changes

- 3982ecb: Anonymized import reports for bug reports: `-r report.json` writes what the importer read with domains, IPs, host names, e-mail addresses, paths and secret values replaced, and passing a report instead of a directory replays the import. Also available as `createImportReport()`.

## 0.2.0

### Minor Changes

- e0e6f71: Works with typical single-host homelabs: the directory source detects a single `compose.yaml`, one folder per stack (Dockge, Komodo) and one folder per host. Routes from caddy-docker-proxy labels and nginx-proxy's `VIRTUAL_HOST` besides Traefik (also multiple hosts per Traefik rule). New config: `checks` for services behind proxies the importer cannot see, `host` and `defaultAddress`. Ports bound to localhost and UDP ports are no longer checked; published ports are labelled after their service and checked on the host address (`address`, `meta.LAN` or `defaultAddress`) before the service's domain. `buildTopology()` takes an optional `warnings` array.

### Patch Changes

- Updated dependencies [e0e6f71]
- Updated dependencies [af327bd]
  - infra3d@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [cd0fd83]
  - infra3d@0.2.0

## 0.1.1

### Patch Changes

- dd4e205: Require Node 22 or newer (Node 20 is end of life), add a screenshot and demo link to the README, update development dependencies.
- Updated dependencies [dd4e205]
  - infra3d@0.1.1
