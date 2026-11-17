import type { DomainProfile } from 'infra3d/core';

/**
 * CI pipelines (Woodpecker, Drone, …): a pipeline (Drone: build) consists of workflows (Drone:
 * stages, one per pipeline definition), a workflow of steps.
 * Edges point from the dependent to what it needs, so "what fails with this step" is the impact
 * view and "why did this pipeline fail" the dependency view. `buildTopology` writes it into the
 * topology, so infra3d picks it up by itself.
 */
export const CI_PROFILE: DomainProfile = {
  id: 'ci',
  label: 'CI pipelines',
  // Steps are the most numerous; grouped by workflow they form the grid the rest follows
  anchorLayer: 'step',
  nodeTypes: {
    pipeline: { label: 'Pipeline', shape: 'wide', emphasis: true, color: '#f7bc94' },
    workflow: { label: 'Workflow', shape: 'hexagon', color: '#cbb6f3' },
    step: { label: 'Step', shape: 'diamond', labelOnHover: true, color: '#97d7df' },
  },
  roles: {
    // Services (databases, caches) run next to the steps; clones fetch the code first
    service: { shape: 'cylinder' },
    clone: { shape: 'slab' },
  },
  edgeKinds: {
    contains: { label: ['consists of', 'part of'], structural: true, pull: 1, color: '#a7a4bb' },
    // The workflow's box around its steps already shows this
    runs: { label: ['runs', 'step of'], structural: true, pull: 1, impliedByColumn: true, color: '#a7a4bb' },
    needs: { label: ['needs', 'needed by'], structural: true, pull: 0.5, color: '#cbb6f3' },
    // Steps without `depends_on` run one after another
    after: { label: ['runs after', 'runs before'], line: 'dashed', structural: true, pull: 0.5, color: '#97d7df' },
    uses: { label: ['uses service', 'serves'], line: 'dashed', faint: true, pull: 0.3, color: '#f2b3d9' },
  },
  defaultShape: 'box',
};

