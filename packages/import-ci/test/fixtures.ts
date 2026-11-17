import { fromWoodpecker, type CiSnapshot, type WoodpeckerPipeline, type WoodpeckerRepo } from '../src/index.js';
import raw from './fixtures/woodpecker.json' with { type: 'json' };

/** The Woodpecker API fixture, translated into the neutral model. */
export const woodpeckerSnapshot: CiSnapshot = {
  source: 'woodpecker',
  server: raw.server,
  repos: raw.repos.map((r) => ({
    repo: { slug: r.repo.full_name },
    pipelines: (r.pipelines as WoodpeckerPipeline[]).map((p) => fromWoodpecker(raw.server, r.repo as WoodpeckerRepo, p)),
  })),
};
