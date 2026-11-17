# infra3d-import-ci

## 0.1.1

### Patch Changes

- ecbc5fa: 3D layout: a profile can set `anchorGroups: 'columns'` to place the groups of its anchor layer side by side instead of one behind the other (also as `layout.anchorGroups`). The CI profile uses it, so the workflows of a pipeline line up from left to right above their steps instead of hiding behind each other, and its column labels sit in front. Workflows no longer drift towards the workflows they need.
- Updated dependencies [ecbc5fa]
  - infra3d@0.8.0

## 0.1.0

### Minor Changes

- 5da73e0: Topologies can carry their domain profile (`topology.profile`, a built-in name or a whole profile) and nodes the status their source reports (`node.status`). Profiles can bring colours. All functions and components use the carried profile and status by themselves, and `validateTopology` and the JSON schema check them. CI topologies from `infra3d-import-ci` carry the CI profile and step states.
- 57ec9d6: New, experimental importer for CI pipelines from Woodpecker and Drone: pipelines, workflows (Drone: stages) and steps with their `depends_on` links and states, as a topology, SVG or draw.io file, with its own domain profile.

### Patch Changes

- Updated dependencies [5da73e0]
  - infra3d@0.7.0
