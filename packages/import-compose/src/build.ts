import type { EdgeKind, InfraEdge, InfraNode, Topology } from 'infra3d/core';
import type { ComposeService, ImportConfig, ImportInput } from './types.js';

// Only structure is taken over: no env values, no secrets, no public IPs.

const DATABASE_IMAGE = /postgres|redis|valkey|mariadb|mysql|mongo|meili|-db\b/;

/** Reverse proxies that take their routes from container labels or environment. */
type Proxy = 'Traefik' | 'Caddy' | 'nginx-proxy';
const PROXY_IMAGES: [Proxy, RegExp][] = [
  ['Traefik', /(^|\/)traefik(:|@|$)/],
  ['Caddy', /(^|\/)caddy(-docker-proxy)?(:|@|$)/],
  ['nginx-proxy', /(^|\/)nginx-proxy(:|@|$)/],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const list = (v: string[] | Record<string, unknown> | undefined) => (Array.isArray(v) ? v : Object.keys(v ?? {}));

type PortEntry = string | number | { published?: string | number; host_ip?: string };

/** Published host port of a compose `ports` entry, or null for container-only ports. */
export function publishedPort(p: PortEntry): string | null {
  if (typeof p === 'object') return p.published != null ? String(p.published) : null;
  const parts = String(p).replace(/\/(tcp|udp)$/, '').split(':');
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

/** UDP ports cannot be checked with a TCP connect. */
export const isUdpPort = (p: PortEntry) => (typeof p === 'object' ? (p as { protocol?: string }).protocol === 'udp' : /\/udp$/.test(String(p)));

/** Bound to 127.0.0.1 or ::1, so nothing outside the host can reach it. */
export function isLoopbackPort(p: PortEntry): boolean {
  const ip = typeof p === 'object' ? p.host_ip : String(p).match(/^\[?([0-9a-f:.]+?)\]?:\d+:/i)?.[1];
  return !!ip && /^(127\.|::1$|localhost$)/.test(ip);
}

export const labelPairs = (labels: ComposeService['labels']): [string, string][] =>
  Array.isArray(labels)
    ? labels.map((l) => {
        const i = l.indexOf('=');
        return i < 0 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)];
      })
    : Object.entries(labels ?? {}).map(([k, v]) => [k, String(v)]);

function envValue(env: ComposeService['environment'], key: string): string | undefined {
  if (Array.isArray(env)) return env.find((e) => e.startsWith(`${key}=`))?.slice(key.length + 1);
  const v = env?.[key];
  return v == null ? undefined : String(v);
}

const hostnames = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((h) => h.replace(/^https?:\/\//, '').replace(/[:/].*$/, ''))
    .filter((h) => h && !h.includes('*') && !h.includes('$') && !h.includes('{') && h.includes('.'));

/** Hostnames a reverse proxy routes to this service, from Traefik/Caddy labels or nginx-proxy's VIRTUAL_HOST. */
export function routedHostnames(def: ComposeService, expand: (s: string) => string = (s) => s): { host: string; proxy: Proxy }[] {
  const out: { host: string; proxy: Proxy }[] = [];
  const add = (host: string, proxy: Proxy) => {
    if (!out.some((o) => o.host === host)) out.push({ host, proxy });
  };
  for (const [key, value] of labelPairs(def.labels)) {
    if (/^traefik\.http\.routers\..+\.rule$/.test(key)) {
      for (const group of value.matchAll(/Host\(([^)]*)\)/g)) for (const m of group[1].matchAll(/`([^`]+)`/g)) add(expand(m[1]), 'Traefik');
    }
    if (/^caddy(_\d+)?$/.test(key)) for (const h of hostnames(expand(value))) add(h, 'Caddy');
  }
  const virtualHost = envValue(def.environment, 'VIRTUAL_HOST');
  if (virtualHost) for (const h of hostnames(expand(virtualHost))) add(h, 'nginx-proxy');
  return out;
}

/**
 * Turns hosts and their compose files into a topology.
 * Problems that do not stop the import (e.g. a `checks` key matching no service) are added to `warnings`.
 */
export function buildTopology(input: ImportInput, config: ImportConfig = {}, warnings: string[] = []): Topology {
  const domain = input.domain ?? config.domain;
  const found = new Map(input.hosts.map((h) => [h.id, h]));
  const hosts = config.hosts ? Object.keys(config.hosts).filter((id) => found.has(id)).map((id) => found.get(id)!) : input.hosts;

  const nodes = new Map<string, InfraNode>();
  const edges: InfraEdge[] = [];
  const edgeKeys = new Set<string>();
  const addNode = (n: InfraNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return nodes.get(n.id)!;
  };
  const addEdge = (from: string, to: string, kind: EdgeKind, label?: string) => {
    const key = `${from}|${to}|${kind}`;
    if (from === to || edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(label ? { from, to, kind, label } : { from, to, kind });
  };

  for (const n of config.nodes ?? []) addNode(n);
  for (const e of config.edges ?? []) addEdge(e.from, e.to, e.kind, e.label);

  // Placeholders and hostnames below the base domain, e.g. in Traefik rules and env values
  const fqdnRe = domain
    ? new RegExp(`([a-z0-9-]+(?:\\.[a-z0-9-]+)*)\\.(?:\\$\\{DOMAIN\\}|\\{\\{\\s*domain\\s*\\}\\})|([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.${escapeRe(domain)})`, 'gi')
    : null;
  const fqdnsIn = (text: string) => {
    const out = new Set<string>();
    if (fqdnRe) for (const m of text.matchAll(fqdnRe)) out.add(m[1] ? `${m[1]}.${domain}` : m[2]);
    return [...out];
  };
  const expand = (s: string) => (domain ? s.replace(/\$\{DOMAIN\}|\{\{\s*domain\s*\}\}/g, domain) : s);

  // Edges whose target is only known once every stack has been read
  const pending: (() => void)[] = [];
  const routedTo = new Map<string, Set<string>>();

  for (const host of hosts) {
    const info = config.hosts?.[host.id] ?? {};
    const hostId = `h:${host.id}`;
    addNode({ id: hostId, label: info.label ?? host.id, type: 'host', layer: 'physical', column: host.id, meta: { ...info.meta, Stacks: host.stacks.length } });
    if (info.uplink) addEdge(hostId, info.uplink, info.uplink.startsWith('n:') ? 'member' : 'uplink');
    if (host.backup && config.backupTarget) addEdge(hostId, config.backupTarget, 'backup');
    // Published ports live on the host: a known host address beats the service's domain, which may point elsewhere
    const knownAddress = info.address ?? (info.meta?.LAN != null ? String(info.meta.LAN) : undefined) ?? config.defaultAddress;

    const proxies = new Map<Proxy, string>();
    const proxied: { eid: string; proxy: Proxy }[] = [];

    for (const { name: stack, compose } of host.stacks) {
      const netDecl = compose.networks ?? {};
      const netId = (key: string) => {
        const decl = netDecl[key] ?? {};
        const name = decl.external ? decl.name ?? key : `${stack}_${key}`;
        const id = `n:${host.id}:${name}`;
        const n = addNode({
          id, label: decl.external && name === 'proxy' ? `proxy (${host.id})` : name, type: 'network', layer: 'network', column: host.id,
          meta: { Host: host.id, Type: decl.external ? 'external (shared)' : 'stack-internal' },
        });
        const override = config.networkOverrides?.[name];
        if (override) {
          Object.assign(n, { label: override.label ?? n.label, meta: { ...n.meta, ...override.meta } });
          if (override.memberOf) addEdge(id, override.memberOf, 'member', override.edgeLabel);
        }
        addEdge(id, hostId, 'runs-on');
        return id;
      };

      for (const [svc, def] of Object.entries(compose.services ?? {}) as [string, ComposeService][]) {
        const cid = `c:${host.id}:${stack}:${svc}`;
        const image = String(def.image ?? '');
        addNode({
          id: cid, label: svc, type: 'container', layer: 'container', column: host.id, group: stack,
          meta: { Stack: stack, Image: image || 'build' },
          ...(DATABASE_IMAGE.test(image) ? { role: 'database' } : {}),
        });
        for (const [kind, re] of PROXY_IMAGES) if (!proxies.has(kind) && re.test(image)) proxies.set(kind, cid);

        const nets = def.networks ? list(def.networks) : ['default'];
        for (const n of nets) addEdge(cid, netId(n), 'member');
        for (const d of list(def.depends_on)) addEdge(cid, `c:${host.id}:${stack}:${d}`, 'depends');

        // Routes of a reverse proxy (Traefik, Caddy, nginx-proxy)
        const routes = routedHostnames(def, expand);
        const fqdns = routes.map((r) => r.host);
        const middlewares = labelPairs(def.labels).filter(([k]) => k.endsWith('.middlewares')).map(([, v]) => v).join(',');
        for (const { host: fqdn, proxy } of routes) {
          const eid = `e:${fqdn}`;
          addNode({ id: eid, label: fqdn, type: 'endpoint', layer: 'endpoint', column: host.id, check: `https://${fqdn}`, meta: { URL: `https://${fqdn}`, Access: `${proxy} (HTTPS)` } });
          addEdge(eid, cid, 'routes');
          proxied.push({ eid, proxy });
          for (const a of config.authMiddlewares ?? []) {
            if (domain && middlewares.includes(a.match)) pending.push(() => addEdge(eid, `e:${a.endpoint}.${domain}`, 'auth', a.label));
          }
          if (!routedTo.has(cid)) routedTo.set(cid, new Set());
          routedTo.get(cid)!.add(eid);
        }

        // Directly published TCP ports (80/443 belong to the proxy itself; loopback-only ports are unreachable)
        for (const p of def.ports ?? []) {
          const pub = publishedPort(p);
          if (!pub || pub === '80' || pub === '443' || isLoopbackPort(p) || isUdpPort(p)) continue;
          const base = fqdns[0] ?? host.id;
          const eid = `e:${base}:${pub}`;
          addNode({
            id: eid, label: `${fqdns[0] ?? svc}:${pub}`, type: 'endpoint', layer: 'endpoint', column: host.id,
            check: `tcp://${knownAddress ?? fqdns[0] ?? host.id}:${pub}`, meta: { Access: 'direct port', Port: pub },
          });
          addEdge(eid, cid, 'routes');
        }

        // Cross references: images from the own registry, URLs of other services
        const imageHost = image.split('/')[0];
        if (domain && imageHost.endsWith(domain)) pending.push(() => addEdge(cid, `e:${imageHost}`, 'image', 'image source'));
        const envText = JSON.stringify([def.environment ?? {}, def.command ?? '', def.entrypoint ?? '']);
        for (const fqdn of fqdnsIn(envText)) {
          pending.push(() => {
            if (nodes.has(`e:${fqdn}`) && !routedTo.get(cid)?.has(`e:${fqdn}`)) addEdge(cid, `e:${fqdn}`, 'uses');
          });
        }
        for (const l of config.addressLinks ?? []) {
          if (l.match.some((m) => envText.includes(m))) addEdge(cid, l.to, 'uses', l.label);
        }

        // Network shares the container mounts
        for (const m of host.mounts ?? []) {
          const mounted = (def.volumes ?? []).some((v) => String(typeof v === 'object' ? v.source ?? '' : v).startsWith(m));
          if (config.nasTarget && mounted) addEdge(cid, config.nasTarget, 'uses', `mount ${m}`);
        }
      }
    }

    for (const { eid, proxy } of proxied) {
      const cid = proxies.get(proxy);
      if (cid) addEdge(eid, cid, 'via', 'reverse proxy');
    }
  }

  for (const fn of pending) fn();
  addManualChecks(config, nodes, addNode, addEdge, warnings);

  const labels = config.layerLabels ?? {};
  return {
    schemaVersion: 1,
    name: config.name ?? 'compose',
    columns: hosts.map((h) => h.id),
    layers: [
      { id: 'physical', label: labels.physical ?? 'Hardware & sites' },
      { id: 'network', label: labels.network ?? 'Networks' },
      { id: 'container', label: labels.container ?? 'Containers' },
      { id: 'endpoint', label: labels.endpoint ?? 'Endpoints' },
    ],
    nodes: [...nodes.values()],
    // Drop edges to nodes that do not exist, e.g. a login service on another domain
    edges: edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)),
  };
}

/** Endpoints from `config.checks`, for services whose route the importer cannot see. */
function addManualChecks(
  config: ImportConfig,
  nodes: Map<string, InfraNode>,
  addNode: (n: InfraNode) => InfraNode,
  addEdge: (from: string, to: string, kind: EdgeKind, label?: string) => void,
  warnings: string[],
) {
  const containers = [...nodes.values()].filter((n) => n.type === 'container');
  for (const [key, value] of Object.entries(config.checks ?? {})) {
    // c:<host>:<stack>:<service> must end with the key's parts
    const parts = key.split('/');
    const matches = containers.filter((c) => c.id.split(':').slice(1).slice(-parts.length).join('/') === key);
    if (matches.length !== 1) {
      warnings.push(`checks: "${key}" matches ${matches.length ? `${matches.length} services, use stack/service or host/stack/service` : 'no service'}`);
      continue;
    }
    const container = matches[0];
    for (const target of Array.isArray(value) ? value : [value]) {
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        warnings.push(`checks: "${target}" is not a URL`);
        continue;
      }
      const tcp = url.protocol === 'tcp:';
      const eid = tcp ? `e:${url.hostname}:${url.port}` : `e:${url.hostname}`;
      const existing = nodes.get(eid);
      if (existing) existing.check = target;
      else {
        addNode({
          id: eid, label: tcp ? `${container.label}:${url.port}` : url.hostname, type: 'endpoint', layer: 'endpoint', column: container.column, check: target,
          meta: tcp ? { Access: 'configured check', Port: url.port } : { URL: target, Access: 'configured check' },
        });
      }
      addEdge(eid, container.id, 'routes');
    }
  }
}
