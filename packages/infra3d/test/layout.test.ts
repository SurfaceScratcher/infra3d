import { describe, expect, it } from 'vitest';
import { computeLayout } from '../src/layout.js';
import { topo } from './fixture.js';

describe('computeLayout', () => {
  const layout = computeLayout(topo);

  it('places every node on its layer height', () => {
    for (const n of topo.nodes) {
      const p = layout.positions.get(n.id);
      expect(p, n.id).toBeDefined();
      expect(p![1]).toBe(layout.layerY.get(n.layer));
    }
  });

  it('orders columns as given', () => {
    expect(layout.columns.map((c) => c.id)).toEqual(['host-a', 'host-b']);
    expect(layout.columns[0].x).toBeLessThan(layout.columns[1].x);
  });

  it('puts each group of the anchor layer on its own row', () => {
    const z = (id: string) => layout.positions.get(id)![2];
    expect(z('c:a:shop')).toBe(z('c:a:shop-db'));
    expect(z('c:a:shop')).not.toBe(z('c:a:wiki'));
  });

  it('keeps nodes on the same layer apart', () => {
    const minDistance = 2.6;
    for (const layer of topo.layers.map((l) => l.id)) {
      const nodes = topo.nodes.filter((n) => n.layer === layer);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = layout.positions.get(nodes[i].id)!;
          const b = layout.positions.get(nodes[j].id)!;
          expect(Math.hypot(a[0] - b[0], a[2] - b[2]), `${layer}: ${nodes[i].id} / ${nodes[j].id}`).toBeGreaterThan(minDistance - 0.05);
        }
      }
    }
  });

  it('applies node offsets', () => {
    const shifted = computeLayout({ ...topo, nodes: topo.nodes.map((n) => (n.id === 'site' ? { ...n, offset: [0, -20] as [number, number] } : n)) });
    expect(shifted.positions.get('site')![2]).toBeLessThan(layout.positions.get('site')![2] - 10);
  });
});
