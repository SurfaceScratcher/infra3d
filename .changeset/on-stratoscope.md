---
'infra3d': minor
'@infra3d/app': patch
---

infra3d now builds on [stratoscope](https://github.com/SurfaceScratcher/stratoscope), the domain-neutral core that was extracted from it, and adds infrastructure as the default domain. The API stays the same: `InfraScene`, `InfraDiagram`, the view `hosts`, `INFRA_PROFILE`, `NODE_COLORS` and the other names keep working, and topologies without a profile are drawn as infrastructure.

What changes:

- `INFRA_PROFILE` carries the infrastructure colours and `looseColumn: 'External'`, so stratoscope functions draw an infra topology the same way. `infraTopology(topology)` resolves the profile of a topology for them.
- draw.io files name their host and page ids after stratoscope (`host="stratoscope"`, cell ids `columns:…` instead of `hosts:…`), and the SVG title says `columns` instead of `hosts`. Everything else in the exports is unchanged.
- A profile in the schema may leave out `anchorLayer` (default: the bottom layer) and set `looseColumn`.
- `infra3d-import-ci` is no longer developed here; its successor is `stratoscope-ci`.
