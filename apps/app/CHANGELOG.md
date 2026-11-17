# @infra3d/app

## 0.6.2

### Patch Changes

- Updated dependencies [5da73e0]
  - infra3d@0.7.0
  - infra3d-import-compose@0.3.4

## 0.6.1

### Patch Changes

- 886c97c: Domain profiles: everything specific to infrastructure (node shapes, edge wording and line styles, which edges pass a failure on, structural kinds for the health analysis, the anchor layer) now lives in `INFRA_PROFILE`, a plain data object. Every function and component takes a `profile` option or prop and defaults to it, so the output for infrastructure stays the same. This opens the layered views to other domains such as CI pipelines.
- Updated dependencies [886c97c]
  - infra3d@0.6.0
  - infra3d-import-compose@0.3.3

## 0.6.0

### Minor Changes

- 1082af4: Two 2D views of the topology and a draw.io export.
  
  - `<InfraDiagram view="layers" | "hosts">` draws the topology as an SVG diagram with the same selection, highlighting and status as the 3D scene. `infra3d/diagram` provides it without three.js.
  - `toDrawio(topology)` writes both views as an editable draw.io file, e.g. for the draw.io macro in XWiki or Confluence. `computeDiagramLayout` is the pure layout behind them.
  - The app switches between 3D, Layers and Hosts and downloads the diagrams as draw.io or SVG.
- c3d3823: Live diagrams for wikis.
  
  - `toSvg(topology, { view })` in `infra3d/core` renders a 2D view as a standalone SVG without a browser.
  - The app serves the current diagram with live status at `/api/diagram.svg` and `/api/diagram.drawio`. `INFRA3D_EMBED_TOKEN` opens only these two endpoints to `?token=…`, so a wiki page can embed the picture while the rest stays behind `INFRA3D_AUTH`.

### Patch Changes

- Updated dependencies [1082af4]
- Updated dependencies [c3d3823]
  - infra3d@0.5.0
  - infra3d-import-compose@0.3.2

## 0.5.1

### Patch Changes

- Updated dependencies [b636344]
  - infra3d@0.4.1

## 0.5.0

### Minor Changes

- 61ab561: New default colours: soft pastel nodes and edges on a dark violet background, with periwinkle as the accent; the status colours for down and suspect stay clearly distinct. The app also gets an icon.

### Patch Changes

- Updated dependencies [61ab561]
  - infra3d@0.4.0
  - infra3d-import-compose@0.3.1

## 0.4.0

### Minor Changes

- 3982ecb: Anonymized import reports for bug reports: `-r report.json` writes what the importer read with domains, IPs, host names, e-mail addresses, paths and secret values replaced, and passing a report instead of a directory replays the import. Also available as `createImportReport()`.

### Patch Changes

- Updated dependencies [3982ecb]
  - infra3d-import-compose@0.3.0
