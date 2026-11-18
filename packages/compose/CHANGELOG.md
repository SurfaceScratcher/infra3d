# infra3d-import-compose

## 0.4.0

### Minor Changes

- 63da10b: Renamed to fit the stratoscope family and to avoid a clash with an existing product called infra3D: `infra3d` is now `stratoscope-infra`, `infra3d-import-compose` is now `stratoscope-compose`, and the app image is `ghcr.io/surfacescratcher/stratoscope-infra`. The API is unchanged; only package names and imports change (`from 'stratoscope-infra'`, `'stratoscope-infra/core'`, `'stratoscope-infra/diagram'`).
  
  Old names keep working for now:
  
  - The app reads `STRATOSCOPE_*` environment variables and falls back to the old `INFRA3D_*` ones.
  - The importer and the app use `stratoscope.config.json` and fall back to `infra3d.config.json`.
  - Import reports are written as `stratoscope-import-report`; reports from before the rename still replay.
  - The app remembers the selected view under a new key and still reads the old one.

### Patch Changes

- Updated dependencies [63da10b]
  - stratoscope-infra@0.10.0

## 0.3.6

### Patch Changes

- Updated dependencies [591ff41]
  - infra3d@0.9.0

## 0.3.5

### Patch Changes

- Updated dependencies [ecbc5fa]
  - infra3d@0.8.0

## 0.3.4

### Patch Changes

- Updated dependencies [5da73e0]
  - infra3d@0.7.0

## 0.3.3

### Patch Changes

- Updated dependencies [886c97c]
  - infra3d@0.6.0

## 0.3.2

### Patch Changes

- Updated dependencies [1082af4]
- Updated dependencies [c3d3823]
  - infra3d@0.5.0

## 0.3.1

### Patch Changes

- Updated dependencies [61ab561]
  - infra3d@0.4.0

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
