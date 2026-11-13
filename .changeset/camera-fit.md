---
'infra3d': minor
---

The overview camera now fits the whole scene to the viewport, keeping its viewing angle. Narrow portrait screens no longer cut off wide topologies; resizes and topology updates refit the view until the user moves the camera. New: `cameraAngle` prop, `ref.fitAll()` via `InfraSceneHandle`, and `fitCamera()` / `sceneBox()` in `infra3d/core`. Fog, zoom limit and far plane scale with the fitted distance.
