import type { DomainProfile, InfraTheme } from 'infra3d/core';

/**
 * CI pipelines (Woodpecker, Drone, …): a pipeline (Drone: build) consists of workflows (Drone:
 * stages, one per pipeline definition), a workflow of steps.
 * Edges point from the dependent to what it needs, so "what fails with this step" is the impact
 * view and "why did this pipeline fail" the dependency view.
 */
export const CI_PROFILE: DomainProfile = {
  id: 'ci',
  label: 'CI pipelines',
  // Steps are the most numerous; grouped by workflow they form the grid the rest follows
  anchorLayer: 'step',
  nodeTypes: {
    pipeline: { label: 'Pipeline', shape: 'wide', emphasis: true },
    workflow: { label: 'Workflow', shape: 'hexagon' },
    step: { label: 'Step', shape: 'diamond', labelOnHover: true },
  },
  roles: {
    // Services (databases, caches) run next to the steps; clones fetch the code first
    service: { shape: 'cylinder' },
    clone: { shape: 'slab' },
  },
  edgeKinds: {
    contains: { label: ['consists of', 'part of'], structural: true, pull: 1 },
    // The workflow's box around its steps already shows this
    runs: { label: ['runs', 'step of'], structural: true, pull: 1, impliedByColumn: true },
    needs: { label: ['needs', 'needed by'], structural: true, pull: 0.5 },
    // Steps without `depends_on` run one after another
    after: { label: ['runs after', 'runs before'], line: 'dashed', structural: true, pull: 0.5 },
    uses: { label: ['uses service', 'serves'], line: 'dashed', faint: true, pull: 0.3 },
  },
  defaultShape: 'box',
};

/** Colours for the node types and edge kinds of the profile, to merge into any theme. */
export const CI_COLORS: Pick<InfraTheme, 'nodeColors' | 'edgeColors'> = {
  nodeColors: { pipeline: '#f7bc94', workflow: '#cbb6f3', step: '#97d7df' },
  edgeColors: { contains: '#a7a4bb', runs: '#a7a4bb', needs: '#cbb6f3', after: '#97d7df', uses: '#f2b3d9' },
};
