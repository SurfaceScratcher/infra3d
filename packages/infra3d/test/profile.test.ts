import { describe, expect, it } from 'vitest';
import { analyzeHealth, computeDiagramLayout, computeHighlight, computeLayout, edgeLabel, INFRA_PROFILE, shapeOf, STRUCTURAL_KINDS, toDrawio, toSvg, traverse, typeLabel, type DomainProfile, type Topology } from '../src/core.js';

// A second domain: CI pipelines. A failing step blocks its workflow, which blocks the pipeline;
// a notification step that fails does not.
const CI: DomainProfile = {
  id: 'ci',
  label: 'CI',
  anchorLayer: 'workflow',
  nodeTypes: {
    pipeline: { label: 'Pipeline', shape: 'wide', emphasis: true },
    workflow: { label: 'Workflow', shape: 'hexagon' },
    step: { label: 'Step', shape: 'diamond' },
  },
  roles: { service: { shape: 'cylinder' } },
  edgeKinds: {
    contains: { label: ['contains', 'part of'], structural: true, pull: 1, impliedByColumn: true },
    needs: { label: ['needs', 'needed by'], structural: true },
    notifies: { line: 'dashed', faint: true, propagates: false },
  },
};

const ci: Topology = {
  layers: [
    { id: 'step', label: 'Steps' },
    { id: 'workflow', label: 'Workflows' },
    { id: 'pipeline', label: 'Pipelines' },
  ],
  nodes: [
    { id: 'p', label: 'main #42', type: 'pipeline', layer: 'pipeline', column: 'app' },
    { id: 'w:build', label: 'build', type: 'workflow', layer: 'workflow', column: 'app', group: 'build' },
    { id: 'w:test', label: 'test', type: 'workflow', layer: 'workflow', column: 'app', group: 'test' },
    { id: 'w:deploy', label: 'deploy', type: 'workflow', layer: 'workflow', column: 'app', group: 'deploy' },
    { id: 's:compile', label: 'compile', type: 'step', layer: 'step', column: 'app' },
    { id: 's:db', label: 'postgres', type: 'step', layer: 'step', column: 'app', role: 'service' },
    { id: 's:chat', label: 'chat', type: 'step', layer: 'step', column: 'app' },
  ],
  edges: [
    { from: 'p', to: 'w:build', kind: 'contains' },
    { from: 'p', to: 'w:test', kind: 'contains' },
    { from: 'p', to: 'w:deploy', kind: 'contains' },
    { from: 'w:test', to: 'w:build', kind: 'needs' },
    { from: 'w:deploy', to: 'w:test', kind: 'needs' },
    { from: 'w:build', to: 's:compile', kind: 'contains' },
    { from: 'w:test', to: 's:db', kind: 'contains' },
    { from: 'w:deploy', to: 's:chat', kind: 'notifies' },
    { from: 's:chat', to: 'w:build', kind: 'needs' },
  ],
};

describe('INFRA_PROFILE', () => {
  it('keeps the structural kinds of the health analysis', () => {
    expect(STRUCTURAL_KINDS).toEqual(['routes', 'via', 'member', 'runs-on', 'depends', 'uplink']);
  });

  it('names node types and edge directions, falling back to the raw value', () => {
    expect(typeLabel(INFRA_PROFILE, 'container')).toBe('Container');
    expect(typeLabel(INFRA_PROFILE, 'printer')).toBe('printer');
    expect(edgeLabel(INFRA_PROFILE, 'runs-on', 'out')).toBe('runs on');
    expect(edgeLabel(INFRA_PROFILE, 'runs-on', 'in')).toBe('hosts network');
    expect(edgeLabel(INFRA_PROFILE, 'custom', 'in')).toBe('custom');
  });

  it('lets a role override the shape of a type', () => {
    expect(shapeOf(INFRA_PROFILE, { id: 'x', label: 'x', type: 'container', layer: 'container' })).toBe('box');
    expect(shapeOf(INFRA_PROFILE, { id: 'x', label: 'x', type: 'container', layer: 'container', role: 'database' })).toBe('cylinder');
    expect(shapeOf(INFRA_PROFILE, { id: 'x', label: 'x', type: 'printer', layer: 'physical' })).toBe('box');
  });
});

describe('a custom profile', () => {
  it('decides which edges propagate a failure', () => {
    // The chat step is reached but not followed, so the build is not blamed through it
    expect([...traverse(ci, 'w:deploy', 'down', CI).nodes].sort()).toEqual(['s:chat', 's:compile', 's:db', 'w:build', 'w:deploy', 'w:test']);
    expect(traverse(ci, 's:chat', 'down', CI).nodes.has('w:build')).toBe(true);
    expect(traverse(ci, 'w:build', 'up', CI).nodes.has('w:deploy')).toBe(true);
    expect(traverse(ci, 's:chat', 'up', CI).nodes.has('p')).toBe(false);
    // The infra profile does not know `notifies`, so there it propagates
    expect(traverse(ci, 's:chat', 'up').nodes.has('p')).toBe(true);
    expect(computeHighlight(ci, 'w:test', 'deps', CI)!.down.nodes.has('s:compile')).toBe(true);
  });

  it('feeds the health analysis with its structural kinds', () => {
    // A working deploy proves build and test work; with the infra kinds it would prove nothing
    const { status } = analyzeHealth(ci, { 'w:deploy': { ok: true } }, { profile: CI });
    expect(status['w:build']).toBe('ok');
    expect(status['s:db']).toBe('ok');
    expect(status['s:chat']).toBe('unknown');
    expect(analyzeHealth(ci, { 'w:deploy': { ok: true } }).status['w:build']).toBe('unknown');
  });

  it('sets the anchor layer of both layouts', () => {
    const three = computeLayout(ci, { profile: CI });
    const z = ['w:build', 'w:test', 'w:deploy'].map((id) => three.positions.get(id)![2]);
    expect(new Set(z).size).toBe(3); // one row per group on the grid
    const hosts = computeDiagramLayout(ci, { view: 'hosts', layout: { profile: CI } });
    expect(hosts.groups.map((g) => g.label).sort()).toEqual(['build', 'deploy', 'test']);
    // anchorLayer still overrides the profile
    expect(computeDiagramLayout(ci, { view: 'hosts', layout: { profile: CI, anchorLayer: 'step' } }).groups).toHaveLength(0);
  });

  it('draws its shapes and line styles in SVG and draw.io', () => {
    const svg = toSvg(ci, { view: 'layers', profile: CI });
    expect(svg).toContain('<polygon points="0,-10 10,0 0,10 -10,0"'); // step: diamond
    expect(svg).toContain('<ellipse cy="-6"'); // service role: cylinder
    expect(svg).toContain('stroke-dasharray="5 4"'); // notifies
    expect(svg).toMatch(/font-weight="600"[^>]*>main #42</);

    const xml = toDrawio(ci, { profile: CI });
    expect(xml).toMatch(/id="layers:node:w:build"[^>]*>\s*<mxCell style="shape=hexagon/);
    // `contains` within one card is implied on the hosts page
    const hosts = xml.slice(xml.indexOf('name="Hosts"'));
    expect((hosts.match(/edge="1"/g) ?? []).length).toBe(ci.edges.filter((e) => e.kind !== 'contains').length);
  });
});
