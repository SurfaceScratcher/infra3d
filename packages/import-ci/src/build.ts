import { SCHEMA_VERSION, type InfraEdge, type InfraNode, type NodeStatus, type Topology } from 'infra3d/core';
import { CI_PROFILE } from './profile.js';
import type { CiPipeline, CiSnapshot, CiState, CiStep, CiWorkflow } from './types.js';

export interface BuildOptions {
  /** Topology name. Default "CI pipelines". */
  name?: string;
}

/** Bottom to top: steps carry the work, pipelines are what people look at. */
export const LAYERS = [
  { id: 'step', label: 'Steps' },
  { id: 'workflow', label: 'Workflows' },
  { id: 'pipeline', label: 'Pipelines' },
];

/**
 * CI state → node status. Failures are `down`; everything that is not finished yet or did not run
 * (pending, running, skipped, canceled, blocked, declined, waiting_on_dependencies) is `unknown`.
 */
export function statusOfState(state: CiState | undefined): NodeStatus {
  switch (state) {
    case 'success': return 'ok';
    case 'failure': case 'error': case 'killed': return 'down';
    default: return 'unknown';
  }
}

/** Status per node: the `status` it carries, else derived from `meta.State`. */
export function statusOf(topology: Topology): Record<string, NodeStatus> {
  return Object.fromEntries(topology.nodes.map((n) => [n.id, n.status ?? statusOfState(String(n.meta?.State ?? ''))]));
}

/**
 * One column per repository; the steps of a workflow form a group. Edges:
 * - pipeline → workflow: `contains`, workflow → step: `runs`
 * - workflow → workflow, step → step from `dependsOn`: `needs`
 * - steps of a workflow without any `dependsOn` run in order: `after` the previous one
 *   (with `dependsOn` in use, steps without it start right after the clone)
 * - step → service of the same workflow: `uses`
 * The topology carries CI_PROFILE and each node its `status`, so infra3d shows it right away.
 */
export function buildTopology(snapshot: CiSnapshot, opts: BuildOptions = {}): Topology {
  const nodes: InfraNode[] = [];
  const edges: InfraEdge[] = [];

  for (const { repo, pipelines } of snapshot.repos) {
    const column = repo.slug;
    for (const p of pipelines) {
      const pid = `p:${column}#${p.number}`;
      // Several pipelines of one repository need the number to tell their workflows apart
      const groupOf = (w: CiWorkflow) => (pipelines.length > 1 ? `#${p.number} ${w.name}` : w.name);
      nodes.push({
        id: pid,
        label: `#${p.number} ${p.branch ?? p.event ?? ''}`.trim(),
        type: 'pipeline',
        layer: 'pipeline',
        column,
        status: statusOfState(p.state),
        meta: pipelineMeta(p),
      });

      const workflowId = (w: CiWorkflow) => `w:${column}#${p.number}/${w.name}`;
      const byName = new Map(p.workflows.map((w) => [w.name, w]));
      for (const w of p.workflows) {
        const wid = workflowId(w);
        nodes.push({ id: wid, label: w.name, type: 'workflow', layer: 'workflow', column, status: statusOfState(w.state), meta: runMeta(w) });
        edges.push({ from: pid, to: wid, kind: 'contains' });
        for (const dep of w.dependsOn ?? []) {
          const target = byName.get(dep);
          if (target) edges.push({ from: wid, to: workflowId(target), kind: 'needs' });
        }
        addSteps(w, wid, column, groupOf(w), nodes, edges);
      }
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    name: opts.name ?? 'CI pipelines',
    profile: CI_PROFILE,
    layers: LAYERS,
    columns: snapshot.repos.filter((r) => r.pipelines.length).map((r) => r.repo.slug),
    nodes,
    edges,
  };
}

function addSteps(w: CiWorkflow, wid: string, column: string, group: string, nodes: InfraNode[], edges: InfraEdge[]) {
  // Position in the workflow: names are not always unique
  const index = new Map(w.steps.map((s, i) => [s, i + 1]));
  const stepId = (s: CiStep) => `s:${wid.slice(2)}/${index.get(s)}`;
  const services = w.steps.filter((s) => s.kind === 'service');
  const work = w.steps.filter((s) => s.kind !== 'service');
  const clone = work.find((s) => s.kind === 'clone');
  const byName = new Map(work.map((s) => [s.name, s]));
  const dag = work.some((s) => s.dependsOn?.length);

  for (const s of w.steps) {
    const id = stepId(s);
    const role = s.kind === 'step' ? undefined : s.kind;
    nodes.push({ id, label: s.name, type: 'step', layer: 'step', column, group, ...(role && { role }), status: statusOfState(s.state), meta: runMeta(s) });
    edges.push({ from: wid, to: id, kind: 'runs' });
  }

  work.forEach((s, i) => {
    const id = stepId(s);
    if (dag) {
      const deps = (s.dependsOn ?? []).map((d) => byName.get(d)).filter((d): d is CiStep => !!d);
      for (const d of deps) edges.push({ from: id, to: stepId(d), kind: 'needs' });
      if (!deps.length && clone && s !== clone) edges.push({ from: id, to: stepId(clone), kind: 'after' });
    } else if (i > 0) {
      edges.push({ from: id, to: stepId(work[i - 1]), kind: 'after' });
    }
    if (s !== clone) for (const svc of services) edges.push({ from: id, to: stepId(svc), kind: 'uses' });
  });
}

function pipelineMeta(p: CiPipeline): Record<string, string | number> {
  const meta = runMeta(p);
  if (p.event) meta.Event = p.event;
  if (p.branch) meta.Branch = p.branch;
  if (p.commit) meta.Commit = p.commit.slice(0, 8);
  const message = p.message?.split('\n')[0].trim();
  if (message) meta.Message = message.length > 120 ? `${message.slice(0, 119)}…` : message;
  if (p.author) meta.Author = p.author;
  return meta;
}

function runMeta(run: { state: CiState; started?: number; finished?: number; exitCode?: number; error?: string; link?: string }): Record<string, string | number> {
  const meta: Record<string, string | number> = { State: run.state };
  if (run.started && run.finished && run.finished >= run.started) meta.Duration = formatDuration(run.finished - run.started);
  if (run.exitCode) meta['Exit code'] = run.exitCode;
  if (run.error) meta.Error = run.error;
  // Not `URL`: infra3d would take that as a health check target
  if (run.link) meta.Link = run.link;
  return meta;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
