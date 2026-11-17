---
"infra3d": minor
"@infra3d/app": minor
"infra3d-import-ci": minor
---

Topologies can carry their domain profile (`topology.profile`, a built-in name or a whole profile) and nodes the status their source reports (`node.status`). Profiles can bring colours. All functions and components use the carried profile and status by themselves, and `validateTopology` and the JSON schema check them. The app opens topology files of any domain with *Open…* or drag and drop; the file stays in the browser. CI topologies from `infra3d-import-ci` carry the CI profile and step states.
