import { describe, expect, it } from 'vitest';
import { validateTopology } from '../src/validate.js';
import example from '../../../apps/app/web/src/data/example.json';
import { topo } from './fixture.js';

describe('validateTopology', () => {
  it('accepts the example and the test fixture', () => {
    expect(validateTopology(example)).toEqual({ valid: true, errors: [], warnings: [] });
    expect(validateTopology(topo).valid).toBe(true);
  });

  it('rejects non-objects and missing arrays', () => {
    expect(validateTopology(null).errors).toEqual(['topology must be an object']);
    expect(validateTopology({ layers: [] }).errors).toEqual(['"nodes" must be an array', '"edges" must be an array']);
  });

  it('reports broken references and duplicates', () => {
    const r = validateTopology({
      layers: [{ id: 'l', label: 'L' }],
      nodes: [
        { id: 'a', label: 'A', type: 'host', layer: 'l' },
        { id: 'a', label: 'A2', type: 'host', layer: 'nope' },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'uses' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['nodes[1] "a": duplicate node id', 'nodes[1] "a": unknown layer "nope"', 'edges[0]: unknown node "b" in "to"']);
  });

  it('rejects other schema versions', () => {
    expect(validateTopology({ schemaVersion: 2, layers: [], nodes: [], edges: [] }).errors[0]).toMatch(/unsupported schemaVersion 2/);
  });

  it('warns about unlisted columns', () => {
    const r = validateTopology({ layers: [{ id: 'l', label: 'L' }], columns: ['x'], nodes: [{ id: 'a', label: 'A', type: 'host', layer: 'l', column: 'y' }], edges: [] });
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual(['nodes[0] "a": column "y" is not listed in "columns"']);
  });
});
