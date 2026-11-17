import type { CiSource } from '../types.js';
import { drone } from './drone.js';
import { woodpecker } from './woodpecker.js';

export const SOURCES: Record<string, CiSource> = { woodpecker, drone };

/**
 * Picks the source from the environment the CI's own CLI uses: `WOODPECKER_SERVER` and
 * `WOODPECKER_TOKEN`, or `DRONE_SERVER` and `DRONE_TOKEN`.
 */
export function detectSource(env: Record<string, string | undefined>): { source: CiSource; server: string; token: string } | null {
  for (const [prefix, source] of [['WOODPECKER', woodpecker], ['DRONE', drone]] as const) {
    const server = env[`${prefix}_SERVER`], token = env[`${prefix}_TOKEN`];
    if (server && token) return { source, server, token };
  }
  return null;
}
