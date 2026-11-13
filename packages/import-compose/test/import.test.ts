import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateTopology } from 'infra3d/core';
import { ansibleSource, buildTopology, directorySource, isAnsibleRepo, isLoopbackPort, isUdpPort, publishedPort, routedHostnames, type ImportConfig } from '../src/index.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const edge = (t: ReturnType<typeof buildTopology>, from: string, to: string) => t.edges.find((e) => e.from === from && e.to === to)?.kind;

describe('publishedPort', () => {
  it('handles the compose port syntaxes', () => {
    expect(publishedPort('8080:80')).toBe('8080');
    expect(publishedPort('127.0.0.1:8080:80')).toBe('8080');
    expect(publishedPort('53:53/udp')).toBe('53');
    expect(publishedPort('3000')).toBeNull();
    expect(publishedPort(3000)).toBeNull();
    expect(publishedPort({ target: 80, published: 8081 } as { published: number })).toBe('8081');
  });
});

describe('directory source', () => {
  const config: ImportConfig = {
    domain: 'example.com',
    hosts: { 'web-01': { label: 'Web 01', uplink: 'site:dc', meta: { LAN: '10.0.0.5' } } },
    nodes: [{ id: 'site:dc', label: 'Data center', type: 'site', layer: 'physical' }],
    authMiddlewares: [{ match: 'keycloak', endpoint: 'auth', label: 'login' }],
  };
  const topo = buildTopology(directorySource(path.join(fixtures, 'directory'), config), config);
  const node = (id: string) => topo.nodes.find((n) => n.id === id);

  it('produces a valid topology', () => {
    expect(validateTopology(topo)).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('limits hosts to the configured ones', () => {
    expect(topo.columns).toEqual(['web-01']);
    expect(node('h:web-01')).toMatchObject({ label: 'Web 01', meta: { LAN: '10.0.0.5', Stacks: 3 } });
    expect(edge(topo, 'h:web-01', 'site:dc')).toBe('uplink');
  });

  it('derives containers, networks and dependencies', () => {
    expect(node('c:web-01:shop:db')).toMatchObject({ role: 'database', group: 'shop' });
    expect(node('n:web-01:shop_internal')).toBeDefined();
    expect(node('n:web-01:proxy')).toMatchObject({ label: 'proxy (web-01)' });
    expect(edge(topo, 'c:web-01:shop:web', 'c:web-01:shop:db')).toBe('depends');
    expect(edge(topo, 'n:web-01:proxy', 'h:web-01')).toBe('runs-on');
  });

  it('turns Traefik rules into endpoints behind the proxy', () => {
    expect(node('e:shop.example.com')).toMatchObject({ check: 'https://shop.example.com', meta: { URL: 'https://shop.example.com' } });
    expect(edge(topo, 'e:shop.example.com', 'c:web-01:shop:web')).toBe('routes');
    expect(edge(topo, 'e:shop.example.com', 'c:web-01:traefik:traefik')).toBe('via');
  });

  it('adds endpoints for published ports, except the proxy ports', () => {
    // the host's LAN address wins over the service's domain
    expect(node('e:git.example.com:2222')).toMatchObject({ check: 'tcp://10.0.0.5:2222' });
    expect(node('e:git.example.com:9000')).toBeDefined();
    expect(topo.nodes.filter((n) => n.id.endsWith(':80') || n.id.endsWith(':443') || n.id.endsWith(':3000'))).toEqual([]);
  });

  it('links services that reference each other', () => {
    expect(edge(topo, 'c:web-01:shop:web', 'e:git.example.com')).toBe('uses');
    // the auth endpoint does not exist in the fixture, so the edge is dropped
    expect(topo.edges.some((e) => e.kind === 'auth')).toBe(false);
  });

  it('discovers all hosts without a host list', () => {
    const all = buildTopology(directorySource(path.join(fixtures, 'directory'), {}), {});
    expect(all.columns).toEqual(['web-01', 'web-02']);
    // without a domain, ${DOMAIN} stays unresolved but still yields an endpoint
    expect(all.nodes.find((n) => n.id === 'e:web-02:8080')).toMatchObject({ check: 'tcp://web-02:8080' });
  });

  it('uses custom layer labels', () => {
    const t = buildTopology({ hosts: [] }, { layerLabels: { container: 'Container' } });
    expect(t.layers.map((l) => l.label)).toEqual(['Hardware & sites', 'Networks', 'Container', 'Endpoints']);
  });
});

describe('ansible source', () => {
  const root = path.join(fixtures, 'ansible');
  const config: ImportConfig = { backupTarget: 'dev:nas', nasTarget: 'dev:nas', nodes: [{ id: 'dev:nas', label: 'NAS', type: 'device', layer: 'physical' }] };
  const topo = buildTopology(ansibleSource(root, config), config);

  it('is detected by its inventory', () => {
    expect(isAnsibleRepo(root)).toBe(true);
    expect(isAnsibleRepo(path.join(fixtures, 'directory'))).toBe(false);
  });

  it('imports only deployed stacks and reads the domain from group vars', () => {
    expect(topo.nodes.some((n) => n.group === 'unused')).toBe(false);
    expect(topo.nodes.find((n) => n.id === 'e:media.example.com')).toBeDefined();
  });

  it('adds backup and network share edges from host vars', () => {
    expect(edge(topo, 'h:box', 'dev:nas')).toBe('backup');
    expect(topo.edges.find((e) => e.from === 'c:box:media:jellyfin' && e.to === 'dev:nas')).toMatchObject({ kind: 'uses', label: 'mount /mnt/media' });
  });
});

describe('routedHostnames', () => {
  it('reads Traefik, Caddy and nginx-proxy routes', () => {
    expect(routedHostnames({ labels: ['traefik.http.routers.a.rule=Host(`a.example.com`) || Host(`b.example.com`, `c.example.com`)'] }).map((r) => r.host)).toEqual([
      'a.example.com', 'b.example.com', 'c.example.com',
    ]);
    expect(routedHostnames({ labels: { caddy_0: 'https://x.example.com, *.wild.example.com', 'caddy_0.reverse_proxy': '{{upstreams 80}}' } })).toEqual([{ host: 'x.example.com', proxy: 'Caddy' }]);
    expect(routedHostnames({ environment: ['VIRTUAL_HOST=n.example.com,m.example.com'] }).map((r) => r.proxy)).toEqual(['nginx-proxy', 'nginx-proxy']);
    expect(routedHostnames({ environment: { VIRTUAL_HOST: '${HOSTNAME}' } })).toEqual([]);
  });
});

describe('isLoopbackPort', () => {
  it('detects ports bound to localhost', () => {
    expect(isLoopbackPort('127.0.0.1:8080:80')).toBe(true);
    expect(isLoopbackPort('[::1]:8080:80')).toBe(true);
    expect(isLoopbackPort({ published: 8080, host_ip: '127.0.0.1' })).toBe(true);
    expect(isLoopbackPort('0.0.0.0:8080:80')).toBe(false);
    expect(isLoopbackPort('8080:80')).toBe(false);
  });

  it('detects UDP ports', () => {
    expect(isUdpPort('53:53/udp')).toBe(true);
    expect(isUdpPort({ published: 53, protocol: 'udp' } as never)).toBe(true);
    expect(isUdpPort('53:53/tcp')).toBe(false);
  });
});

describe('single-host layouts', () => {
  it('reads one folder per stack as a single host', () => {
    const topo = buildTopology(directorySource(path.join(fixtures, 'single-host'), {}), {});
    const node = (id: string) => topo.nodes.find((n) => n.id === id);
    expect(topo.columns).toEqual(['host']);
    expect(validateTopology(topo).valid).toBe(true);
    expect(node('e:media.home.example.com')).toMatchObject({ check: 'https://media.home.example.com', meta: { Access: 'Caddy (HTTPS)' } });
    expect(edge(topo, 'e:jellyfin.home.example.com', 'c:host:caddy:caddy')).toBe('via');
    expect(edge(topo, 'e:notes.home.example.com', 'c:host:notes:nginx-proxy')).toBe('via');
    // published port labelled after the service, loopback-only ports skipped
    expect(node('e:media.home.example.com:8096')).toMatchObject({ label: 'media.home.example.com:8096' });
    expect(node('e:host:53')).toMatchObject({ label: 'pihole:53', check: 'tcp://host:53' });
    expect(topo.nodes.some((n) => n.id.endsWith(':8920') || n.id.endsWith(':8081'))).toBe(false);
    // only the TCP variant of 53 is checked
    expect(topo.nodes.filter((n) => n.id === 'e:host:53')).toHaveLength(1);
  });

  it('uses the configured host name and default address', () => {
    const config: ImportConfig = { host: 'nas', defaultAddress: 'host.docker.internal' };
    const topo = buildTopology(directorySource(path.join(fixtures, 'single-host'), config), config);
    expect(topo.columns).toEqual(['nas']);
    expect(topo.nodes.find((n) => n.id === 'e:nas:53')?.check).toBe('tcp://host.docker.internal:53');
    // the host address also wins over the service's domain
    expect(topo.nodes.find((n) => n.id === 'e:media.home.example.com:8096')?.check).toBe('tcp://host.docker.internal:8096');
  });

  it('reads a single compose file', () => {
    const topo = buildTopology(directorySource(path.join(fixtures, 'single-file'), {}), {});
    expect(topo.nodes.filter((n) => n.type === 'container').map((n) => n.group)).toEqual(['homeserver', 'homeserver']);
    expect(edge(topo, 'e:pw.example.com', 'c:host:homeserver:traefik')).toBe('via');
  });
});

describe('configured checks', () => {
  it('adds endpoints for services without a visible route', () => {
    const config: ImportConfig = {
      checks: {
        homeassistant: 'https://ha.example.com',
        'notes/db': 'tcp://192.168.1.10:5432',
        'media.home.example.com': 'https://nope.example.com',
        jellyfin: 'https://media.home.example.com/health',
      },
    };
    const warnings: string[] = [];
    const topo = buildTopology(directorySource(path.join(fixtures, 'single-host'), config), config, warnings);
    expect(edge(topo, 'e:ha.example.com', 'c:host:tools:homeassistant')).toBe('routes');
    expect(topo.nodes.find((n) => n.id === 'e:192.168.1.10:5432')).toMatchObject({ label: 'db:5432', check: 'tcp://192.168.1.10:5432' });
    // an existing endpoint gets the configured target instead of a duplicate
    expect(topo.nodes.find((n) => n.id === 'e:media.home.example.com')?.check).toBe('https://media.home.example.com/health');
    expect(warnings).toEqual(['checks: "media.home.example.com" matches no service']);
  });

  it('warns about ambiguous keys', () => {
    const warnings: string[] = [];
    const config: ImportConfig = { checks: { app: 'https://x.example.com' } };
    buildTopology({ hosts: [{ id: 'a', stacks: [{ name: 's1', compose: { services: { app: {} } } }, { name: 's2', compose: { services: { app: {} } } }] }] }, config, warnings);
    expect(warnings[0]).toMatch(/matches 2 services/);
  });
});
