---
"infra3d": minor
"@infra3d/app": minor
---

Live diagrams for wikis.

- `toSvg(topology, { view })` in `infra3d/core` renders a 2D view as a standalone SVG without a browser.
- The app serves the current diagram with live status at `/api/diagram.svg` and `/api/diagram.drawio`. `INFRA3D_EMBED_TOKEN` opens only these two endpoints to `?token=…`, so a wiki page can embed the picture while the rest stays behind `INFRA3D_AUTH`.
