import type { CiPipeline, CiSnapshot, CiSource, CiStep, FetchOptions } from '../types.js';
import { apiGetter, pipelineCount, slugPath } from './http.js';

/** The parts of the Woodpecker API (v3) this source reads. */
export interface WoodpeckerRepo {
  id: number;
  full_name: string;
  default_branch?: string;
  active?: boolean;
}

export interface WoodpeckerStep {
  id: number;
  pid: number;
  name: string;
  state: string;
  /** clone, service, plugin, commands, cache */
  type?: string;
  exit_code?: number;
  error?: string;
  started?: number;
  finished?: number;
  depends_on?: string[] | null;
}

export interface WoodpeckerWorkflow {
  id: number;
  pid: number;
  name: string;
  state: string;
  error?: string;
  started?: number;
  finished?: number;
  depends_on?: string[] | null;
  children?: WoodpeckerStep[] | null;
}

export interface WoodpeckerPipeline {
  number: number;
  status: string;
  event?: string;
  branch?: string;
  commit?: string;
  message?: string;
  author?: string;
  started?: number;
  finished?: number;
  workflows?: WoodpeckerWorkflow[] | null;
}

/** Woodpecker's API → the neutral model. `server` is the base URL for links into the web UI. */
export function fromWoodpecker(server: string | undefined, repo: WoodpeckerRepo, p: WoodpeckerPipeline): CiPipeline {
  const base = server ? `${server.replace(/\/+$/, '')}/repos/${repo.id}/pipeline/${p.number}` : undefined;
  return {
    number: p.number,
    state: p.status,
    event: p.event,
    branch: p.branch,
    commit: p.commit,
    message: p.message,
    author: p.author,
    started: p.started,
    finished: p.finished,
    link: base,
    workflows: (p.workflows ?? []).map((w) => ({
      name: w.name,
      state: w.state,
      dependsOn: w.depends_on ?? undefined,
      error: w.error || undefined,
      started: w.started,
      finished: w.finished,
      link: base && `${base}/${w.pid}`,
      steps: [...(w.children ?? [])].sort((a, b) => a.pid - b.pid).map((s): CiStep => ({
        name: s.name,
        state: s.state,
        kind: s.type === 'clone' ? 'clone' : s.type === 'service' ? 'service' : 'step',
        dependsOn: s.depends_on ?? undefined,
        exitCode: s.exit_code || undefined,
        error: s.error || undefined,
        started: s.started,
        finished: s.finished,
        link: base && `${base}/${s.pid}`,
      })),
    })),
  };
}

export const woodpecker: CiSource = {
  name: 'woodpecker',
  async fetchSnapshot(opts: FetchOptions): Promise<CiSnapshot> {
    const { server, get } = apiGetter(opts);
    const repos = opts.repos?.length
      ? await Promise.all(opts.repos.map((slug) => get<WoodpeckerRepo>(`/repos/lookup/${slugPath(slug)}`)))
      : (await get<WoodpeckerRepo[]>('/user/repos')).filter((r) => r.active !== false);

    const count = pipelineCount(opts);
    const snapshot: CiSnapshot = { source: 'woodpecker', server, repos: [] };
    for (const repo of repos) {
      const query = new URLSearchParams({ page: '1', perPage: String(count) });
      const branch = opts.branch === undefined ? repo.default_branch : opts.branch;
      if (branch) query.set('branch', branch);
      const list = await get<WoodpeckerPipeline[]>(`/repos/${repo.id}/pipelines?${query}`);
      // The list leaves out workflows and steps; the single pipeline has them
      const pipelines = await Promise.all(list.slice(0, count).map((p) => get<WoodpeckerPipeline>(`/repos/${repo.id}/pipelines/${p.number}`)));
      snapshot.repos.push({ repo: { slug: repo.full_name, link: `${server}/repos/${repo.id}` }, pipelines: pipelines.map((p) => fromWoodpecker(server, repo, p)) });
    }
    return snapshot;
  },
};
