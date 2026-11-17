import { describe, expect, it } from 'vitest';
import { buildTopology, detectSource, drone, fromDrone, woodpecker, type DroneBuild } from '../src/index.js';
import droneApi from './fixtures/drone.json' with { type: 'json' };
import woodpeckerApi from './fixtures/woodpecker.json' with { type: 'json' };
import { woodpeckerSnapshot } from './fixtures.js';

const SERVER = 'https://ci.example.com';

/** A fake CI server: answers known paths, 404 for the rest, and records every request. */
function fakeServer(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');
    const path = url.slice(`${SERVER}/api`.length);
    calls.push(path);
    const key = Object.keys(routes).find((r) => (r.endsWith('?') ? path.startsWith(r) : path === r));
    return key ? new Response(JSON.stringify(routes[key])) : new Response('not found', { status: 404, statusText: 'Not Found' });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** Structure only: ids, labels, groups, roles and edges, without links and timings. */
const shape = (s: Parameters<typeof buildTopology>[0]) => {
  const t = buildTopology(s);
  return { nodes: t.nodes.map(({ id, label, group, role, meta }) => ({ id, label, group, role, state: meta?.State })), edges: t.edges };
};

describe('drone', () => {
  const build = droneApi.build as DroneBuild;

  it('maps builds, stages and steps to the same graph as Woodpecker', () => {
    const pipeline = fromDrone(SERVER, 'acme/shop', build);
    const fromWp = { ...woodpeckerSnapshot, repos: [woodpeckerSnapshot.repos[0]] };
    expect(shape({ source: 'drone', repos: [{ repo: { slug: 'acme/shop' }, pipelines: [pipeline] }] })).toEqual(shape(fromWp));
  });

  it('marks detached steps as services, names the branch and links into the Drone UI', () => {
    const p = fromDrone(SERVER + '/', 'acme/shop', build);
    expect(p).toMatchObject({ branch: 'main', commit: '9fe0034c1d2e3f4a5b6c', author: 'dev', link: `${SERVER}/acme/shop/42` });
    const test = p.workflows.find((w) => w.name === 'test')!;
    expect(test.steps.map((s) => s.kind)).toEqual(['service', 'clone', 'step', 'step', 'step', 'step']);
    expect(test.steps[4]).toMatchObject({ name: 'integration', exitCode: 1, link: `${SERVER}/acme/shop/42/2/5` });
    // Drone sends 0 for times that have not happened
    expect(test.started).toBeUndefined();
  });

  it('reads active repositories and the latest build on the default branch', async () => {
    const { fetch, calls } = fakeServer({
      '/user/repos': droneApi.repos,
      '/repos/acme/shop/builds?': droneApi.builds,
      '/repos/acme/shop/builds/42': build,
    });
    const snapshot = await drone.fetchSnapshot({ server: SERVER, token: 'secret', fetch });
    expect(snapshot.source).toBe('drone');
    expect(snapshot.repos.map((r) => r.repo.slug)).toEqual(['acme/shop']);
    // #43 is a pull request into main, not a build of main
    expect(snapshot.repos[0].pipelines.map((p) => p.number)).toEqual([42]);
    expect(calls).toContain('/repos/acme/shop/builds?page=1&per_page=25&branch=main');
  });
});

describe('woodpecker', () => {
  it('reads repositories, the latest pipelines and their details', async () => {
    const shop = woodpeckerApi.repos[0];
    const { fetch, calls } = fakeServer({
      '/user/repos': [shop.repo, { ...woodpeckerApi.repos[2].repo, active: false }],
      '/repos/3/pipelines?': [{ number: 42 }],
      '/repos/3/pipelines/42': shop.pipelines[0],
    });
    const snapshot = await woodpecker.fetchSnapshot({ server: SERVER + '/', token: 'secret', fetch });
    expect(snapshot.repos.map((r) => r.repo.slug)).toEqual(['acme/shop']);
    expect(snapshot.repos[0].pipelines[0].workflows).toHaveLength(3);
    expect(calls[1]).toBe('/repos/3/pipelines?page=1&perPage=1&branch=main');

    await expect(woodpecker.fetchSnapshot({ server: SERVER, token: 'secret', repos: ['acme/nope'], fetch })).rejects.toThrow('404 Not Found');
  });
});

describe('detectSource', () => {
  it('takes the server and token from the variables of the CI CLI', () => {
    expect(detectSource({ DRONE_SERVER: SERVER, DRONE_TOKEN: 't' })).toMatchObject({ source: { name: 'drone' }, server: SERVER, token: 't' });
    expect(detectSource({ WOODPECKER_SERVER: SERVER, WOODPECKER_TOKEN: 't' })?.source.name).toBe('woodpecker');
    expect(detectSource({ DRONE_SERVER: SERVER })).toBeNull();
  });
});
