import { describe, expect, it } from 'vitest';
import { computeHighlight, neighbors, traverse } from '../src/graph.js';
import { topo } from './fixture.js';

describe('traverse', () => {
  it('follows dependencies downwards', () => {
    const { nodes } = traverse(topo, 'e:shop', 'down');
    expect([...nodes].sort()).toEqual(
      ['e:shop', 'c:a:shop', 'c:a:shop-db', 'c:a:traefik', 'n:a:proxy', 'n:a:shop', 'h:a', 'site', 'nas'].sort(),
    );
  });

  it('collects everything affected by a failure upwards', () => {
    const { nodes } = traverse(topo, 'n:a:shop', 'up');
    expect([...nodes].sort()).toEqual(['n:a:shop', 'c:a:shop', 'c:a:shop-db', 'e:shop'].sort());
  });

  it('does not propagate past backup edges', () => {
    // A NAS outage only breaks h:a's backup; it must not spread to what runs on h:a.
    const { nodes } = traverse(topo, 'nas', 'up');
    expect([...nodes].sort()).toEqual(['h:a', 'nas'].sort());
  });

  it('records the traversed edges', () => {
    const { edges } = traverse(topo, 'e:git', 'down');
    expect([...edges].map((i) => topo.edges[i].kind).sort()).toEqual(['member', 'routes', 'runs-on', 'uplink']);
  });
});

describe('computeHighlight', () => {
  it('returns null without a selection', () => {
    expect(computeHighlight(topo, null, 'both')).toBeNull();
  });

  it('limits the result to the chosen direction', () => {
    const deps = computeHighlight(topo, 'c:a:shop', 'deps')!;
    expect(deps.up.nodes.size).toBe(1);
    expect(deps.down.nodes.has('h:a')).toBe(true);
    const impact = computeHighlight(topo, 'c:a:shop', 'impact')!;
    expect(impact.down.nodes.size).toBe(1);
    expect(impact.up.nodes.has('e:shop')).toBe(true);
  });
});

describe('neighbors', () => {
  it('splits edges by direction', () => {
    const { outgoing, incoming } = neighbors(topo, 'c:a:traefik');
    expect(outgoing.map((e) => e.to)).toEqual(['n:a:proxy']);
    expect(incoming.map((e) => e.from).sort()).toEqual(['e:shop', 'e:wiki']);
  });
});
