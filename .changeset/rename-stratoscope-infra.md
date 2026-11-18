---
'stratoscope-infra': minor
'stratoscope-compose': minor
'stratoscope-infra-app': minor
---

Renamed to fit the stratoscope family and to avoid a clash with an existing product called infra3D: `infra3d` is now `stratoscope-infra`, `infra3d-import-compose` is now `stratoscope-compose`, and the app image is `ghcr.io/surfacescratcher/stratoscope-infra`. The API is unchanged; only package names and imports change (`from 'stratoscope-infra'`, `'stratoscope-infra/core'`, `'stratoscope-infra/diagram'`).

Old names keep working for now:

- The app reads `STRATOSCOPE_*` environment variables and falls back to the old `INFRA3D_*` ones.
- The importer and the app use `stratoscope.config.json` and fall back to `infra3d.config.json`.
- Import reports are written as `stratoscope-import-report`; reports from before the rename still replay.
- The app remembers the selected view under a new key and still reads the old one.
