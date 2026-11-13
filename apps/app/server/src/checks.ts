import { analyzeHealth, checkTarget, type HealthAnalysis, type Topology } from 'infra3d/core';
import { config } from './config.js';
import { probe } from './probe.js';

export interface Check {
  target: string | null;
  /** true = reachable, false = down (confirmed), null = not checked yet or not confirmed */
  ok: boolean | null;
  error: string | null;
  ms: number | null;
  answered: boolean;
  /** Since when the current state holds. */
  since: string | null;
  checkedAt: string | null;
}

export interface Change {
  id: string;
  ok: boolean;
}

const results = new Map<string, Check & { fails: number }>();
let checkedAt: string | null = null;
let running = false;

/** Probes every endpoint once. Failures count after `confirmFails` attempts, recoveries at once. */
export async function runChecks(topology: Topology): Promise<Change[]> {
  if (running) return [];
  running = true;
  const changes: Change[] = [];
  try {
    const targets = topology.nodes.map((n) => [n.id, checkTarget(n)] as const).filter(([, t]) => t);
    const ids = new Set(targets.map(([id]) => id));
    for (const id of results.keys()) if (!ids.has(id)) results.delete(id);

    await Promise.all(
      targets.map(async ([id, target]) => {
        const t0 = Date.now();
        const p = await probe(target!, config.timeoutMs);
        const now = new Date().toISOString();
        const prev = results.get(id);
        const fails = p.ok ? 0 : (prev?.fails ?? 0) + 1;
        const ok = p.ok ? true : fails >= config.confirmFails ? false : prev?.ok ?? null;
        const flipped = ok !== (prev?.ok ?? null);
        if (flipped && ok !== null && prev?.ok != null) changes.push({ id, ok });
        results.set(id, {
          target: target!,
          ok,
          error: p.error,
          ms: p.ok ? Date.now() - t0 : null,
          answered: p.answered,
          fails,
          since: flipped ? now : prev?.since ?? now,
          checkedAt: now,
        });
      }),
    );
    checkedAt = new Date().toISOString();
  } finally {
    running = false;
  }
  return changes;
}

export interface State extends HealthAnalysis {
  checkedAt: string | null;
  checks: Record<string, Check>;
}

export function state(topology: Topology): State {
  const checks: Record<string, Check> = {};
  for (const n of topology.nodes) {
    const target = checkTarget(n);
    if (!target) continue;
    const r = results.get(n.id);
    checks[n.id] = r
      ? { target, ok: r.ok, error: r.error, ms: r.ms, answered: r.answered, since: r.since, checkedAt: r.checkedAt }
      : { target, ok: null, error: null, ms: null, answered: false, since: null, checkedAt: null };
  }
  return { checkedAt, checks, ...analyzeHealth(topology, checks) };
}
