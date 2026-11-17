# infra3d-import-ci

## 0.1.0

### Minor Changes

- 5da73e0: Topologies can carry their domain profile (`topology.profile`, a built-in name or a whole profile) and nodes the status their source reports (`node.status`). Profiles can bring colours. All functions and components use the carried profile and status by themselves, and `validateTopology` and the JSON schema check them. CI topologies from `infra3d-import-ci` carry the CI profile and step states.
- 57ec9d6: New, experimental importer for CI pipelines from Woodpecker and Drone: pipelines, workflows (Drone: stages) and steps with their `depends_on` links and states, as a topology, SVG or draw.io file, with its own domain profile.

### Patch Changes

- Updated dependencies [5da73e0]
  - infra3d@0.7.0
