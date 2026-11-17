---
"infra3d": minor
"@infra3d/app": minor
---

Two 2D views of the topology and a draw.io export.

- `<InfraDiagram view="layers" | "hosts">` draws the topology as an SVG diagram with the same selection, highlighting and status as the 3D scene. `infra3d/diagram` provides it without three.js.
- `toDrawio(topology)` writes both views as an editable draw.io file, e.g. for the draw.io macro in XWiki or Confluence. `computeDiagramLayout` is the pure layout behind them.
- The app switches between 3D, Layers and Hosts and downloads the diagrams as draw.io or SVG.
