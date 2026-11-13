import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Topology } from 'infra3d/core';
import { ansibleSource, buildTopology, createImportReport, directorySource, isImportReport, type ImportConfig, type ImportInput } from '../src/index.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Node counts per type and edge counts per kind: what must survive anonymization. */
const shape = (t: Topology) => {
  const count = (xs: string[]) => Object.fromEntries([...new Set(xs)].sort().map((x) => [x, xs.filter((y) => y === x).length]));
  return { nodes: count(t.nodes.map((n) => n.type)), edges: count(t.edges.map((e) => e.kind)), checks: t.nodes.filter((n) => n.check).length };
};

const input: ImportInput = {
  hosts: [
    {
      id: 'fox',
      mounts: ['/home/alice/nas'],
      backup: true,
      stacks: [
        {
          name: 'traefik',
          compose: {
            services: {
              traefik: {
                image: 'traefik:v3',
                ports: ['80:80', '443:443', '192.168.1.20:8080:8080'],
                networks: ['proxy'],
                command: ['--certificatesresolvers.le.acme.email=alice@private-mail.net', '--api.dashboard=true'],
                labels: ['traefik.http.middlewares.auth.basicauth.users=alice:$apr1$secret-hash'],
              },
            },
            networks: { proxy: { external: true, name: 'proxy' } },
          },
        },
        {
          name: 'photos',
          compose: {
            services: {
              app: {
                image: 'registry.alice-home.org/photos/app:1.2',
                networks: ['proxy', 'default'],
                depends_on: ['db'],
                environment: {
                  DB_URL: 'postgres://photos:SuperSecret123@db:5432/photos',
                  PUBLIC_URL: 'https://photos.alice-home.org',
                  NAS_ADDRESS: '192.168.1.10',
                  API_TOKEN: 'tok_9f8e7d6c5b4a',
                },
                labels: {
                  'traefik.http.routers.photos.rule': 'Host(`photos.alice-home.org`)',
                  'traefik.http.routers.photos.middlewares': 'sso@file',
                  'com.example.owner': 'Alice Example',
                },
                volumes: ['/home/alice/nas/photos:/photos:ro', '/home/alice/appdata/photos:/data', 'cache:/cache'],
                ports: ['2283:2283'],
              },
              db: { image: 'postgres:17', environment: ['POSTGRES_PASSWORD=SuperSecret123'] },
            },
          },
        },
      ],
    },
  ],
};

const config: ImportConfig = {
  name: "Alice's homelab",
  domain: 'alice-home.org',
  hosts: { fox: { label: 'Fox (Raspberry Pi in the basement)', uplink: 'router:fritz', meta: { LAN: '192.168.1.5', Location: 'Basement, Springfield' } } },
  nodes: [
    { id: 'router:fritz', label: 'FRITZ!Box 7590', type: 'device', layer: 'physical', check: 'tcp://192.168.1.1:80' },
    { id: 'nas:syno', label: 'Synology DS920+', type: 'device', layer: 'physical', meta: { LAN: '192.168.1.10' } },
  ],
  nasTarget: 'nas:syno',
  backupTarget: 'nas:syno',
  addressLinks: [{ match: ['192.168.1.10'], to: 'nas:syno', label: 'NAS' }],
  authMiddlewares: [{ match: 'sso', endpoint: 'auth', label: 'Alice SSO' }],
  checks: { 'fox/photos/db': 'tcp://192.168.1.5:5432' },
};

describe('createImportReport', () => {
  const warnings = ['checks: "fox/nothing" matches no service'];
  const report = createImportReport(input, config, warnings);
  const json = JSON.stringify(report);

  it('removes what identifies the setup', () => {
    for (const secret of [
      'alice', 'Alice', 'fox', 'Springfield', 'basement', 'FRITZ', 'Synology',
      '192.168.1', 'SuperSecret123', 'tok_9f8e7d6c5b4a', 'secret-hash', 'private-mail', 'appdata',
    ]) {
      expect(json, secret).not.toContain(secret);
    }
  });

  it('keeps the structure the importer needs', () => {
    const app = report.input.hosts[0].stacks[1].compose.services!.app;
    expect(report.input.hosts[0].id).toBe('host1');
    expect(app.labels).toMatchObject({
      'traefik.http.routers.photos.rule': 'Host(`photos.domain1.example`)',
      'traefik.http.routers.photos.middlewares': 'sso@file',
      'com.example.owner': '<redacted>',
    });
    expect(app.environment).toMatchObject({ DB_URL: '<redacted>', PUBLIC_URL: 'photos.domain1.example', API_TOKEN: '<redacted>' });
    // the same address gets the same replacement everywhere, so addressLinks still match
    const nasIp = report.config.nodes!.find((n) => n.id === 'nas:node2')!.meta!.LAN;
    expect(nasIp).toMatch(/^192\.0\.2\./);
    expect((app.environment as Record<string, string>).NAS_ADDRESS).toBe(nasIp);
    expect(report.config.addressLinks).toEqual([{ match: [nasIp], to: 'nas:node2' }]);
    expect(app.volumes).toEqual(['/mnt/share1/<path>:/photos:ro', '<path>:/data', 'cache:/cache']);
    expect(app.image).toBe('registry.domain1.example/photos/app:1.2');
    expect(report.warnings).toEqual(['checks: "host1/nothing" matches no service']);
    expect(isImportReport(JSON.parse(json))).toBe(true);
  });

  it('replays to a topology of the same shape', () => {
    const original = buildTopology(input, config);
    const replayed = buildTopology(report.input, report.config);
    expect(shape(replayed)).toEqual(shape(original));
    expect(replayed.nodes.find((n) => n.id === 'c:host1:photos:app')).toBeDefined();
  });

  it.each([
    ['directory', () => directorySource(path.join(fixtures, 'directory'), {}), { domain: 'example.com', authMiddlewares: [{ match: 'keycloak', endpoint: 'auth' }] }],
    ['ansible', () => ansibleSource(path.join(fixtures, 'ansible'), {}), {}],
    ['single host', () => directorySource(path.join(fixtures, 'single-host'), { host: 'nas' }), { host: 'nas', defaultAddress: '10.0.0.9' }],
  ] as const)('replays the %s fixture', (_, source, cfg) => {
    const fixtureInput = source();
    const fixtureConfig = cfg as ImportConfig;
    const r = createImportReport(fixtureInput, fixtureConfig);
    expect(shape(buildTopology(r.input, r.config))).toEqual(shape(buildTopology(fixtureInput, fixtureConfig)));
  });
});
