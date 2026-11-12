import type { EdgeKind, HighlightMode, Topology } from './types';

/** Kanten, über die sich ein Ausfall nicht weiter fortpflanzt (nur ein Schritt). */
const NON_PROPAGATING: EdgeKind[] = ['backup'];

export interface Reach {
  nodes: Set<string>;
  edges: Set<number>;
}

/**
 * 'down': alles, wovon `start` abhängt (Kanten vorwärts).
 * 'up':   alles, was ausfällt, wenn `start` ausfällt (Kanten rückwärts).
 */
export function traverse(topo: Topology, start: string, dir: 'down' | 'up'): Reach {
  const out = new Map<string, number[]>();
  topo.edges.forEach((e, i) => {
    const key = dir === 'down' ? e.from : e.to;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(i);
  });

  const nodes = new Set([start]);
  const edges = new Set<number>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const i of out.get(id) ?? []) {
      const e = topo.edges[i];
      const next = dir === 'down' ? e.to : e.from;
      edges.add(i);
      if (nodes.has(next)) continue;
      nodes.add(next);
      if (!NON_PROPAGATING.includes(e.kind)) queue.push(next);
    }
  }
  return { nodes, edges };
}

export interface Highlight {
  down: Reach;
  up: Reach;
}

export function computeHighlight(topo: Topology, selected: string | null | undefined, mode: HighlightMode): Highlight | null {
  if (!selected) return null;
  const empty: Reach = { nodes: new Set([selected]), edges: new Set() };
  return {
    down: mode === 'impact' ? empty : traverse(topo, selected, 'down'),
    up: mode === 'deps' ? empty : traverse(topo, selected, 'up'),
  };
}

export function neighbors(topo: Topology, id: string) {
  return {
    outgoing: topo.edges.filter((e) => e.from === id),
    incoming: topo.edges.filter((e) => e.to === id),
  };
}
