import type { EdgeKind, InfraNode, NodeStatus, Topology } from './types.js';

/**
 * Root-cause analysis from outside-in checks: only endpoints are probed, yet the dependency
 * graph narrows down which container, network or host is to blame.
 *
 * 1. A reachable endpoint proves that everything it structurally depends on is running.
 * 2. Suspects of a failed endpoint are its dependencies that no reachable endpoint cleared.
 * 3. If the reverse proxy answered (even with an error), the proxy and everything below it run.
 * 4. Causes that explain the most failures rank first; on a tie the deeper layer wins
 *    (host before network before container).
 */

/** Result of probing one endpoint. */
export interface CheckResult {
  /** true = reachable, false = failed, null/undefined = not checked yet. */
  ok: boolean | null | undefined;
  /** The reverse proxy in front of the endpoint answered, even if with an error status. */
  answered?: boolean;
}

export interface HealthOptions {
  /**
   * Edge kinds that a running service actually needs at runtime. Loose couplings such as the
   * image registry, the login service or a backup target are left out on purpose: they would
   * clear or blame services that are not involved.
   */
  structuralKinds?: EdgeKind[];
  /** Edge kinds that lead from an endpoint to its reverse proxy. */
  proxyKinds?: EdgeKind[];
}

export interface Cause {
  id: string;
  /** Number of failed endpoints this node could explain. */
  count: number;
}

export interface HealthAnalysis {
  status: Record<string, NodeStatus>;
  /** Failed endpoints. */
  down: string[];
  /** Per failed endpoint: suspected dependencies, nearest first (container before network before host). */
  suspects: Record<string, string[]>;
  /** Most likely causes overall, best first. */
  causes: Cause[];
}

export const STRUCTURAL_KINDS: EdgeKind[] = ['routes', 'via', 'member', 'runs-on', 'depends', 'uplink'];

/** Where to probe a node: `check`, falling back to `meta.Check` or `meta.URL`. */
export function checkTarget(node: InfraNode): string | null {
  return node.check ?? (String(node.meta?.Check ?? node.meta?.URL ?? '') || null);
}

function adjacency(topo: Topology, kinds: EdgeKind[]) {
  const allowed = new Set(kinds);
  const out = new Map<string, string[]>();
  for (const e of topo.edges) {
    if (!allowed.has(e.kind)) continue;
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e.to);
  }
  return out;
}

function closureIn(out: Map<string, string[]>, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const next of out.get(queue.shift()!) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/** Everything `start` needs at runtime, including `start` itself. */
export function dependencyClosure(topo: Topology, start: string, kinds: EdgeKind[] = STRUCTURAL_KINDS): Set<string> {
  return closureIn(adjacency(topo, kinds), start);
}

export function analyzeHealth(topo: Topology, results: Record<string, CheckResult | undefined>, opts: HealthOptions = {}): HealthAnalysis {
  const { structuralKinds = STRUCTURAL_KINDS, proxyKinds = ['via'] } = opts;
  const out = adjacency(topo, structuralKinds);
  const proxies = adjacency(topo, proxyKinds);
  const closures = new Map<string, Set<string>>();
  const closure = (id: string) => closures.get(id) ?? closures.set(id, closureIn(out, id)).get(id)!;

  const cleared = new Set<string>();
  const down: string[] = [];
  for (const n of topo.nodes) {
    const r = results[n.id];
    if (r?.ok) {
      for (const id of closure(n.id)) cleared.add(id);
    } else if (r?.ok === false) {
      down.push(n.id);
      if (r.answered) for (const proxy of proxies.get(n.id) ?? []) for (const id of closure(proxy)) cleared.add(id);
    }
  }

  const layerIdx = new Map(topo.layers.map((l, i) => [l.id, i]));
  const byId = new Map(topo.nodes.map((n) => [n.id, n]));
  // Layer index: 0 is the bottom layer (hardware), higher layers sit closer to the endpoints
  const level = (id: string) => layerIdx.get(byId.get(id)?.layer ?? '') ?? 0;

  const counts = new Map<string, number>();
  const suspects: Record<string, string[]> = {};
  for (const id of down) {
    suspects[id] = [...closure(id)].filter((s) => s !== id && !cleared.has(s)).sort((a, b) => level(b) - level(a));
    for (const s of suspects[id]) counts.set(s, (counts.get(s) ?? 0) + 1);
  }

  const failed = new Set(down);
  const status: Record<string, NodeStatus> = {};
  for (const n of topo.nodes) {
    status[n.id] = failed.has(n.id) ? 'down' : counts.has(n.id) ? 'suspect' : cleared.has(n.id) ? 'ok' : 'unknown';
  }

  const causes = [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || level(a.id) - level(b.id));

  return { status, down, suspects, causes };
}
