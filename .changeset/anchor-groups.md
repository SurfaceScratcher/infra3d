---
"infra3d": minor
"infra3d-import-ci": patch
---

3D layout: a profile can set `anchorGroups: 'columns'` to place the groups of its anchor layer side by side instead of one behind the other (also as `layout.anchorGroups`). The CI profile uses it, so the workflows of a pipeline line up from left to right above their steps instead of hiding behind each other, and its column labels sit in front. Workflows no longer drift towards the workflows they need.
