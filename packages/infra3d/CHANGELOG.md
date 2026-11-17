# infra3d

## 0.8.0

### Minor Changes

- ecbc5fa: 3D layout: a profile can set `anchorGroups: 'columns'` to place the groups of its anchor layer side by side instead of one behind the other (also as `layout.anchorGroups`). The CI profile uses it, so the workflows of a pipeline line up from left to right above their steps instead of hiding behind each other, and its column labels sit in front. Workflows no longer drift towards the workflows they need.

## 0.7.0

### Minor Changes

- 5da73e0: Topologies can carry their domain profile (`topology.profile`, a built-in name or a whole profile) and nodes the status their source reports (`node.status`). Profiles can bring colours. All functions and components use the carried profile and status by themselves, and `validateTopology` and the JSON schema check them. CI topologies from `infra3d-import-ci` carry the CI profile and step states.

## 0.6.0

### Minor Changes

- 886c97c: Domain profiles: everything specific to infrastructure (node shapes, edge wording and line styles, which edges pass a failure on, structural kinds for the health analysis, the anchor layer) now lives in `INFRA_PROFILE`, a plain data object. Every function and component takes a `profile` option or prop and defaults to it, so the output for infrastructure stays the same. This opens the layered views to other domains such as CI pipelines.

## 0.5.0

### Minor Changes

- 1082af4: Two 2D views of the topology and a draw.io export.
  
  - `<InfraDiagram view="layers" | "hosts">` draws the topology as an SVG diagram with the same selection, highlighting and status as the 3D scene. `infra3d/diagram` provides it without three.js.
  - `toDrawio(topology)` writes both views as an editable draw.io file, e.g. for the draw.io macro in XWiki or Confluence. `computeDiagramLayout` is the pure layout behind them.
  - The app switches between 3D, Layers and Hosts and downloads the diagrams as draw.io or SVG.
- c3d3823: Live diagrams for wikis.
  
  - `toSvg(topology, { view })` in `infra3d/core` renders a 2D view as a standalone SVG without a browser.
  - The app serves the current diagram with live status at `/api/diagram.svg` and `/api/diagram.drawio`. `INFRA3D_EMBED_TOKEN` opens only these two endpoints to `?token=…`, so a wiki page can embed the picture while the rest stays behind `INFRA3D_AUTH`.

## 0.4.1

### Patch Changes

- b636344: Fix a missing layer label with `@react-three/fiber` 9.8 and later. The HTML labels are now attached to the scene's own container instead of the canvas event source, which fiber connects only after the labels have mounted. This also removes the "synchronously unmount a root" warning in development.

## 0.4.0

### Minor Changes

- 61ab561: New default colours: soft pastel nodes and edges on a dark violet background, with periwinkle as the accent; the status colours for down and suspect stay clearly distinct. Pass `theme` to keep the previous colours.

## 0.3.1

### Patch Changes

- 5a2eee4: App: the web bundle ships THIRD_PARTY_LICENSES.md with the licenses of everything it includes (three.js, React, React Three Fiber, drei …), linked at the bottom of the UI.

## 0.3.0

### Minor Changes

- e0e6f71: 0.3.0 of the self-hosted app: single-host stack folders, Caddy and nginx-proxy routes, configured checks (see infra3d-import-compose), `INFRA3D_HOST` / `INFRA3D_HOST_ADDRESS`, and import warnings in the UI.

### Patch Changes

- af327bd: App: optional HTTP Basic Auth with `INFRA3D_AUTH=user:password`; security notes in the docs.

## 0.2.1

### Patch Changes

- 31c249c: The self-hosted infra3d app is available as a Docker image (`ghcr.io/surfacescratcher/infra3d`), built from this version of the library.

## 0.2.0

### Minor Changes

- cd0fd83: The overview camera now fits the whole scene to the viewport, keeping its viewing angle. Narrow portrait screens no longer cut off wide topologies; resizes and topology updates refit the view until the user moves the camera. New: `cameraAngle` prop, `ref.fitAll()` via `InfraSceneHandle`, and `fitCamera()` / `sceneBox()` in `infra3d/core`. Fog, zoom limit and far plane scale with the fitted distance.

## 0.1.1

### Patch Changes

- dd4e205: Require Node 22 or newer (Node 20 is end of life), add a screenshot and demo link to the README, update development dependencies.
