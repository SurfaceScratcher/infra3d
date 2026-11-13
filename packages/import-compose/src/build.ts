import type { EdgeKind, InfraEdge, InfraNode, Topology } from 'infra3d/core';
import type { ComposeService, ImportConfig, ImportInput } from './types.js';

// Only structure is taken over: no env values, no secrets, no public IPs.

const DATABASE_IMAGE = /postgres|redis|valkey|mariadb|mysql|mongo|meili|-db\b/;
const PROXY_IMAGE = /(^|\/)traefik(:|$)/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const list = (v: string[] | Record<string, unknown> | undefined) => (Array.isArray(v) ? v : Object.keys(v ?? {}));

/** Published host port of a compose `ports` entry, or null for container-only ports. */
export function publishedPort(p: string | number | { published?: string | number }): string | null {
  if (typeof p === 'object') return p.published != null ? String(p.published) : null;
  const parts = String(p).replace(/\/(tcp|udp)$/, '').split(':');
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

export function buildTopology(input: ImportInput, config: ImportConfig = {}): Topology {
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
    const address = info.address ?? String(info.meta?.LAN ?? host.id);

    let proxy: string | null = null;
    const proxied: string[] = [];

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
        if (!proxy && PROXY_IMAGE.test(image)) proxy = cid;

        const nets = def.networks ? list(def.networks) : ['default'];
        for (const n of nets) addEdge(cid, netId(n), 'member');
        for (const d of list(def.depends_on)) addEdge(cid, `c:${host.id}:${stack}:${d}`, 'depends');

        // Traefik routes
        const labels = Array.isArray(def.labels) ? def.labels : Object.entries(def.labels ?? {}).map(([k, v]) => `${k}=${v}`);
        const fqdns: string[] = [];
        for (const l of labels) for (const m of l.matchAll(/Host\(`([^`]+)`\)/g)) fqdns.push(expand(m[1]));
        const middlewares = labels.filter((l) => l.includes('.middlewares=')).join(',');
        for (const fqdn of fqdns) {
          const eid = `e:${fqdn}`;
          addNode({ id: eid, label: fqdn, type: 'endpoint', layer: 'endpoint', column: host.id, check: `https://${fqdn}`, meta: { URL: `https://${fqdn}`, Access: 'Traefik (HTTPS)' } });
          addEdge(eid, cid, 'routes');
          proxied.push(eid);
          for (const a of config.authMiddlewares ?? []) {
            if (domain && middlewares.includes(a.match)) pending.push(() => addEdge(eid, `e:${a.endpoint}.${domain}`, 'auth', a.label));
          }
          if (!routedTo.has(cid)) routedTo.set(cid, new Set());
          routedTo.get(cid)!.add(eid);
        }

        // Directly published ports (80/443 belong to the proxy itself)
        for (const p of def.ports ?? []) {
          const pub = publishedPort(p);
          if (!pub || pub === '80' || pub === '443') continue;
          const base = fqdns[0] ?? host.id;
          const eid = `e:${base}:${pub}`;
          addNode({
            id: eid, label: `${base}:${pub}`, type: 'endpoint', layer: 'endpoint', column: host.id,
            check: `tcp://${fqdns[0] ?? address}:${pub}`, meta: { Access: 'direct port', Port: pub },
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

    if (proxy) for (const eid of proxied) addEdge(eid, proxy, 'via', 'reverse proxy');
  }

  for (const fn of pending) fn();

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
