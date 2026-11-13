# infra3d

## 0.2.0

### Minor Changes

- cd0fd83: The overview camera now fits the whole scene to the viewport, keeping its viewing angle. Narrow portrait screens no longer cut off wide topologies; resizes and topology updates refit the view until the user moves the camera. New: `cameraAngle` prop, `ref.fitAll()` via `InfraSceneHandle`, and `fitCamera()` / `sceneBox()` in `infra3d/core`. Fog, zoom limit and far plane scale with the fitted distance.

## 0.1.1

### Patch Changes

- dd4e205: Require Node 22 or newer (Node 20 is end of life), add a screenshot and demo link to the README, update development dependencies.
