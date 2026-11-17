import type { CiPipeline, CiSnapshot, CiSource, FetchOptions } from '../types.js';
import { apiGetter, pipelineCount, slugPath } from './http.js';

/** The parts of the Drone API (2.x) this source reads. */
export interface DroneRepo {
  id: number;
  namespace?: string;
  name?: string;
  slug?: string;
  default_branch?: string;
  active?: boolean;
}

export interface DroneStep {
  number: number;
  name: string;
  status: string;
  exit_code?: number;
  error?: string;
  started?: number;
  stopped?: number;
  depends_on?: string[] | null;
  /** Services run detached next to the other steps. */
  detached?: boolean;
}

/** One pipeline of `.drone.yml` (`kind: pipeline`). */
export interface DroneStage {
  number: number;
  name: string;
  status: string;
  error?: string;
  started?: number;
  stopped?: number;
  depends_on?: string[] | null;
  steps?: DroneStep[] | null;
}

export interface DroneBuild {
  number: number;
  status: string;
  event?: string;
  ref?: string;
  source?: string;
  target?: string;
  /** Commit SHA. */
  after?: string;
  message?: string;
  author_login?: string;
  started?: number;
  finished?: number;
  stages?: DroneStage[] | null;
}

const slugOf = (r: DroneRepo) => r.slug ?? `${r.namespace}/${r.name}`;
// Drone reports 0 for times that have not happened yet
const time = (t?: number) => t || undefined;

/** Drone's API → the neutral model. `server` is the base URL for links into the web UI. */
export function fromDrone(server: string | undefined, slug: string, b: DroneBuild): CiPipeline {
  const base = server ? `${server.replace(/\/+$/, '')}/${slug}/${b.number}` : undefined;
  return {
    number: b.number,
    state: b.status,
    event: b.event,
    branch: b.ref?.startsWith('refs/heads/') ? b.ref.slice('refs/heads/'.length) : b.target,
    commit: b.after,
    message: b.message,
    author: b.author_login,
    started: time(b.started),
    finished: time(b.finished),
    link: base,
    workflows: [...(b.stages ?? [])].sort((x, y) => x.number - y.number).map((st) => ({
      name: st.name,
      state: st.status,
      dependsOn: st.depends_on ?? undefined,
      error: st.error || undefined,
      started: time(st.started),
      finished: time(st.stopped),
      link: base && `${base}/${st.number}`,
      steps: [...(st.steps ?? [])].sort((x, y) => x.number - y.number).map((s) => ({
        name: s.name,
        state: s.status,
        kind: s.detached ? 'service' : s.name === 'clone' ? 'clone' : 'step',
        dependsOn: s.depends_on ?? undefined,
        exitCode: s.exit_code || undefined,
        error: s.error || undefined,
        started: time(s.started),
        finished: time(s.stopped),
        link: base && `${base}/${st.number}/${s.number}`,
      })),
    })),
  };
}

/** Pushes and crons on the branch; pull requests into it come from another branch. */
const onBranch = (b: DroneBuild, branch: string) => (b.ref ? b.ref === `refs/heads/${branch}` : b.target === branch);

export const drone: CiSource = {
  name: 'drone',
  async fetchSnapshot(opts: FetchOptions): Promise<CiSnapshot> {
    const { server, get } = apiGetter(opts);
    const repos = opts.repos?.length
      ? await Promise.all(opts.repos.map((slug) => get<DroneRepo>(`/repos/${slugPath(slug)}`)))
      : (await get<DroneRepo[]>('/user/repos')).filter((r) => r.active);

    const count = pipelineCount(opts);
    const snapshot: CiSnapshot = { source: 'drone', server, repos: [] };
    for (const repo of repos) {
      const slug = slugOf(repo);
      const branch = opts.branch === undefined ? repo.default_branch : opts.branch;
      // Ask for more than needed and filter here as well, in case the server ignores `branch`
      const query = new URLSearchParams({ page: '1', per_page: String(branch ? Math.max(count, 25) : count) });
      if (branch) query.set('branch', branch);
      const list = await get<DroneBuild[]>(`/repos/${slugPath(slug)}/builds?${query}`);
      const latest = list.filter((b) => !branch || onBranch(b, branch)).slice(0, count);
      // The list leaves out stages and steps; the single build has them
      const builds = await Promise.all(latest.map((b) => get<DroneBuild>(`/repos/${slugPath(slug)}/builds/${b.number}`)));
      snapshot.repos.push({ repo: { slug, link: `${server}/${slug}` }, pipelines: builds.map((b) => fromDrone(server, slug, b)) });
    }
    return snapshot;
  },
};
