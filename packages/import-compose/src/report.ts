import type { InfraEdge, InfraNode } from 'infra3d/core';
import { labelPairs, routedHostnames } from './build.js';
import type { ComposeFile, ComposeService, HostInput, ImportConfig, ImportInput } from './types.js';

// An import report carries what buildTopology() needs to reproduce an import, without what identifies
// the setup: domains, IPs, host names, e-mail addresses, file paths and every value that is not a reference.
// Stack, service and network names, images and ports stay, since they explain most importer bugs.

export interface ImportReport {
  format: 'infra3d-import-report';
  version: 1;
  input: ImportInput;
  config: ImportConfig;
  warnings: string[];
}

export const isImportReport = (v: unknown): v is ImportReport => (v as ImportReport | null)?.format === 'infra3d-import-report';

const REDACTED = '<redacted>';
// Registries and names everyone uses; keeping them makes reports easier to read
const PUBLIC_HOSTS = /^(docker\.io|ghcr\.io|lscr\.io|quay\.io|gcr\.io|mcr\.microsoft\.com|public\.ecr\.aws|registry\.gitlab\.com|codeberg\.org|registry\.k8s\.io|host\.docker\.internal)$/;
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PLACEHOLDER = /[a-z0-9.-]*\.(?:\$\{DOMAIN\}|\{\{\s*domain\s*\}\})/gi;
const URL_HOST = /[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s"']*@)?([a-z0-9.-]+)/gi;
/** Labels whose values buildTopology() reads; all others keep only their references. */
const ROUTING_LABEL = /^traefik\.http\.routers\..+\.rule$|\.middlewares$|^caddy(_\d+)?$/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const list = (v: string[] | Record<string, unknown> | undefined) => (Array.isArray(v) ? v : Object.keys(v ?? {}));
const fakeIp = (n: number) => (n < 254 ? `192.0.2.${n + 1}` : `10.99.${Math.floor(n / 254)}.${(n % 254) + 1}`);

/** `app.example.co.uk` → `example.co.uk`: three labels when the second-level label is short and the TLD has two letters. */
function registeredDomain(host: string) {
  const parts = host.split('.');
  const n = parts.length >= 3 && parts.at(-1)!.length === 2 && parts.at(-2)!.length <= 3 ? 3 : 2;
  return parts.slice(-n).join('.');
}

/**
 * Anonymizes what a source found and the config, so users can attach it to a bug report.
 * `buildTopology(report.input, report.config)` reproduces the import with replaced names.
 */
export function createImportReport(input: ImportInput, config: ImportConfig = {}, warnings: string[] = []): ImportReport {
  const domain = input.domain ?? config.domain;
  const expand = (s: string) => (domain ? s.replace(/\$\{DOMAIN\}|\{\{\s*domain\s*\}\}/g, domain) : s);
  const services = input.hosts.flatMap((h) => h.stacks.flatMap((s) => Object.values(s.compose.services ?? {}) as ComposeService[]));

  // Domains that identify the setup, collected where they are known to be host names
  const domains = new Set<string>();
  const addHost = (h: unknown) => {
    const host = typeof h === 'string' ? h.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/:\d+$/, '').replace(/\.+$/, '') : '';
    if (!host.includes('.') || /[${}*]/.test(host) || /^[\d.]+$/.test(host) || PUBLIC_HOSTS.test(host)) return;
    domains.add(registeredDomain(host));
  };
  const addTarget = (t: string) => {
    try {
      addHost(new URL(t).hostname);
    } catch {
      addHost(t);
    }
  };
  const addUrlHosts = (text: string) => {
    for (const m of text.matchAll(URL_HOST)) {
      // `https://app.${DOMAIN}` names a host below the base domain, which is collected already
      if (!/[$\{]/.test(text[m.index + m[0].length] ?? '')) addHost(m[1]);
    }
  };
  addHost(domain);
  addHost(config.defaultAddress);
  for (const h of Object.values(config.hosts ?? {})) [h.address, h.meta?.LAN].forEach(addHost);
  for (const v of Object.values(config.checks ?? {})) [v].flat().forEach(addTarget);
  for (const n of config.nodes ?? []) if (n.check) addTarget(n.check);
  for (const def of services) {
    for (const r of routedHostnames(def, expand)) addHost(r.host);
    const image = String(def.image ?? '');
    if (image.includes('/')) addHost(image.split('/')[0]);
    addUrlHosts(JSON.stringify([def.environment ?? {}, def.labels ?? {}, def.command ?? '', def.entrypoint ?? '']));
  }

  const domainMap = new Map([...domains].sort((a, b) => b.length - a.length).map((d, i) => [d, `domain${i + 1}.example`]));
  const hostIds = new Map(input.hosts.map((h, i) => [h.id, `host${i + 1}`]));
  for (const id of Object.keys(config.hosts ?? {})) if (!hostIds.has(id)) hostIds.set(id, `host${hostIds.size + 1}`);
  const mounts = new Map([...new Set(input.hosts.flatMap((h) => h.mounts ?? []))].map((m, i) => [m, `/mnt/share${i + 1}`]));
  const nodeIds = new Map((config.nodes ?? []).map((n, i) => [n.id, `${n.id.includes(':') ? n.id.split(':')[0] : 'x'}:node${i + 1}`]));
  const ips = new Map<string, string>();
  const ip = (a: string) => {
    if (/^(127\.|0\.0\.0\.0$)/.test(a)) return a;
    if (!ips.has(a)) ips.set(a, fakeIp(ips.size));
    return ips.get(a)!;
  };

  const alternation = (keys: Iterable<string>) => [...keys].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const domainRe = domainMap.size ? new RegExp(`(?<![\\w-])(${alternation(domainMap.keys())})(?![\\w-])`, 'gi') : null;
  const fqdnRe = domainMap.size ? new RegExp(`(?<![\\w.-])(?:[a-z0-9-]+\\.)*(?:${alternation(domainMap.keys())})(?![\\w-])`, 'gi') : null;
  const hostRe = hostIds.size ? new RegExp(`(?<![\\w-])(${alternation(hostIds.keys())})(?![\\w-])`, 'g') : null;

  /** Replaces identifying parts of a string that is kept. */
  const scrub = (s: string) => {
    let out = s.replace(EMAIL, 'user@example.com');
    if (domainRe) out = out.replace(domainRe, (d) => domainMap.get(d.toLowerCase())!);
    out = out.replace(IPV4, ip);
    if (hostRe) out = out.replace(hostRe, (h) => hostIds.get(h)!);
    return out;
  };
  /** Keeps only the references in a value (host names, IPs, `addressLinks` matches) and drops the rest. */
  const reduce = (raw: unknown) => {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
    const refs = new Set<string>();
    for (const re of [fqdnRe, IPV4, PLACEHOLDER]) if (re) for (const m of s.matchAll(re)) refs.add(m[0]);
    for (const l of config.addressLinks ?? []) for (const x of l.match) if (s.includes(x)) refs.add(x);
    return refs.size ? scrub([...refs].join(' ')) : REDACTED;
  };
  const ref = (id: string) => nodeIds.get(id) ?? scrub(id);
  const meta = (m: Record<string, string | number> | undefined) =>
    m && Object.fromEntries(Object.entries(m).map(([k, v]) => [scrub(k), typeof v === 'number' ? v : reduce(v)]));

  const volume = (v: string | { source?: string }) => {
    const src = typeof v === 'object' ? v.source ?? '' : v.split(':')[0];
    const share = [...mounts].find(([m]) => src.startsWith(m));
    const anon = share ? share[1] + (src.length > share[0].length ? '/<path>' : '') : /^[./~$]/.test(src) ? '<path>' : scrub(src);
    return typeof v === 'object' ? { source: anon } : anon + scrub(v.slice(src.length));
  };

  const service = (def: ComposeService): ComposeService => {
    const out: ComposeService = {};
    if (def.image != null) out.image = scrub(String(def.image));
    if (def.networks) out.networks = list(def.networks).map(scrub);
    if (def.depends_on) out.depends_on = list(def.depends_on).map(scrub);
    if (def.labels) out.labels = Object.fromEntries(labelPairs(def.labels).map(([k, v]) => [scrub(k), ROUTING_LABEL.test(k) ? scrub(v) : reduce(v)]));
    if (def.ports) {
      out.ports = def.ports.map((p) =>
        typeof p === 'object' ? { published: p.published, protocol: p.protocol, ...(p.host_ip ? { host_ip: scrub(p.host_ip) } : {}) } : typeof p === 'number' ? p : scrub(p),
      );
    }
    const envValue = (k: string, v: string) => (k === 'VIRTUAL_HOST' ? scrub(v) : reduce(v));
    if (Array.isArray(def.environment)) {
      out.environment = def.environment.map((e) => {
        const i = e.indexOf('=');
        return i < 0 ? scrub(e) : `${scrub(e.slice(0, i))}=${envValue(e.slice(0, i), e.slice(i + 1))}`;
      });
    } else if (def.environment) {
      out.environment = Object.fromEntries(Object.entries(def.environment).map(([k, v]) => [scrub(k), v == null ? null : envValue(k, String(v))]));
    }
    if (def.command != null) out.command = reduce(def.command);
    if (def.entrypoint != null) out.entrypoint = reduce(def.entrypoint);
    if (def.volumes) out.volumes = def.volumes.map(volume);
    return out;
  };

  const compose = (c: ComposeFile): ComposeFile => ({
    ...(c.name ? { name: scrub(c.name) } : {}),
    services: Object.fromEntries(Object.entries(c.services ?? {}).map(([k, def]) => [scrub(k), service(def)])),
    ...(c.networks
      ? {
          networks: Object.fromEntries(
            Object.entries(c.networks).map(([k, d]) => [scrub(k), d && { ...(d.external != null ? { external: d.external } : {}), ...(d.name ? { name: scrub(d.name) } : {}) }]),
          ),
        }
      : {}),
  });

  const host = (h: HostInput): HostInput => ({
    id: hostIds.get(h.id)!,
    stacks: h.stacks.map((s) => ({ name: scrub(s.name), compose: compose(s.compose) })),
    ...(h.backup != null ? { backup: h.backup } : {}),
    ...(h.mounts ? { mounts: h.mounts.map((m) => mounts.get(m)!) } : {}),
  });

  // Free-text labels are dropped; ids and references are mapped so every edge still finds its node
  const node = (n: InfraNode): InfraNode => {
    const id = nodeIds.get(n.id)!;
    return {
      id, label: id.split(':').pop()!, type: n.type, layer: n.layer,
      ...(n.column ? { column: scrub(n.column) } : {}),
      ...(n.group ? { group: scrub(n.group) } : {}),
      ...(n.role ? { role: n.role } : {}),
      ...(n.check ? { check: scrub(n.check) } : {}),
      ...(n.offset ? { offset: n.offset } : {}),
      ...(n.meta ? { meta: meta(n.meta) } : {}),
    };
  };
  const edge = (e: InfraEdge): InfraEdge => ({ from: ref(e.from), to: ref(e.to), kind: e.kind });

  const c = config;
  const anonConfig: ImportConfig = {
    ...(c.name ? { name: 'anonymized' } : {}),
    ...(c.domain ? { domain: scrub(c.domain) } : {}),
    ...(c.host ? { host: scrub(c.host) } : {}),
    ...(c.defaultAddress ? { defaultAddress: scrub(c.defaultAddress) } : {}),
    ...(c.checks ? { checks: Object.fromEntries(Object.entries(c.checks).map(([k, v]) => [scrub(k), Array.isArray(v) ? v.map(scrub) : scrub(v)])) } : {}),
    ...(c.hosts
      ? {
          hosts: Object.fromEntries(
            Object.entries(c.hosts).map(([id, h]) => [
              hostIds.get(id)!,
              { ...(h.meta ? { meta: meta(h.meta) } : {}), ...(h.uplink ? { uplink: ref(h.uplink) } : {}), ...(h.address ? { address: scrub(h.address) } : {}) },
            ]),
          ),
        }
      : {}),
    ...(c.nodes ? { nodes: c.nodes.map(node) } : {}),
    ...(c.edges ? { edges: c.edges.map(edge) } : {}),
    ...(c.backupTarget ? { backupTarget: ref(c.backupTarget) } : {}),
    ...(c.nasTarget ? { nasTarget: ref(c.nasTarget) } : {}),
    ...(c.networkOverrides
      ? {
          networkOverrides: Object.fromEntries(
            Object.entries(c.networkOverrides).map(([k, o]) => [scrub(k), { ...(o.meta ? { meta: meta(o.meta) } : {}), ...(o.memberOf ? { memberOf: ref(o.memberOf) } : {}) }]),
          ),
        }
      : {}),
    ...(c.addressLinks ? { addressLinks: c.addressLinks.map((l) => ({ match: l.match.map(scrub), to: ref(l.to) })) } : {}),
    ...(c.authMiddlewares ? { authMiddlewares: c.authMiddlewares.map((a) => ({ match: scrub(a.match), endpoint: scrub(a.endpoint) })) } : {}),
    ...(c.layerLabels ? { layerLabels: c.layerLabels } : {}),
  };

  return {
    format: 'infra3d-import-report',
    version: 1,
    input: { hosts: input.hosts.map(host), ...(input.domain ? { domain: scrub(input.domain) } : {}) },
    config: anonConfig,
    warnings: warnings.map(scrub),
  };
}
