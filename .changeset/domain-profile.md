---
"infra3d": minor
"@infra3d/app": patch
---

Domain profiles: everything specific to infrastructure (node shapes, edge wording and line styles, which edges pass a failure on, structural kinds for the health analysis, the anchor layer) now lives in `INFRA_PROFILE`, a plain data object. Every function and component takes a `profile` option or prop and defaults to it, so the output for infrastructure stays the same. This opens the layered views to other domains such as CI pipelines.
