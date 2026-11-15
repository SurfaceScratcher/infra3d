---
"infra3d": patch
---

Fix a missing layer label with `@react-three/fiber` 9.8 and later. The HTML labels are now attached to the scene's own container instead of the canvas event source, which fiber connects only after the labels have mounted. This also removes the "synchronously unmount a root" warning in development.
