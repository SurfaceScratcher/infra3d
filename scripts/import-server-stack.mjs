// Liest das server-stack-Repo (Ansible + Docker Compose) und erzeugt daraus eine
// Topologie für <InfraScene>. Es werden nur Strukturdaten übernommen — keine
// Env-Werte, keine Vault-Inhalte, keine öffentlichen IPs.
//
//   node scripts/import-server-stack.mjs ../server-stack src/data/local.json [infra3d.config.json]
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const root = path.resolve(process.argv[2] ?? '../server-stack');
const outFile = process.argv[3] ?? 'src/data/local.json';
const readYaml = (p) => YAML.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const domain = readYaml('inventory/group_vars/all/main.yml').domain;

// Was sich nicht aus den Dateien ableiten lässt (Hardware, Standorte, Uplinks,
// Sonderfälle) steht in einer lokalen Config — siehe infra3d.config.example.json.
const configFile = path.resolve(process.argv[4] ?? 'infra3d.config.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const HOSTS = config.hosts;
const COLUMNS = Object.keys(HOSTS);

const nodes = new Map();
const edges = [];
const edgeKeys = new Set();

function addNode(n) {
  if (!nodes.has(n.id)) nodes.set(n.id, n);
  return nodes.get(n.id);
}
function addEdge(from, to, kind, label) {
  const key = `${from}|${to}|${kind}`;
  if (from === to || edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push(label ? { from, to, kind, label } : { from, to, kind });
}

// --- Physische Ebene & Netze außerhalb von Docker -------------------------
for (const n of config.nodes ?? []) addNode(n);
for (const e of config.edges ?? []) addEdge(e.from, e.to, e.kind, e.label);

// --- Hosts, Stacks, Container ---------------------------------------------
const pending = []; // Kanten, deren Ziel erst nach allen Stacks feststeht
const routedTo = new Map(); // container id -> Set(endpoint ids)

const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fqdnRe = new RegExp(`([a-z0-9-]+(?:\\.[a-z0-9-]+)*)\\.(?:\\$\\{DOMAIN\\}|\\{\\{\\s*domain\\s*\\}\\})|([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.${escapedDomain})`, 'gi');
const fqdnsIn = (text) => {
  const out = new Set();
  for (const m of text.matchAll(fqdnRe)) out.add(m[1] ? `${m[1]}.${domain}` : m[2]);
  return [...out];
};
const isDb = (image = '') => /postgres|redis|valkey|mariadb|mysql|meili|-db\b/.test(image);

for (const host of COLUMNS) {
  const hv = readYaml(`inventory/host_vars/${host}/main.yml`);
  const info = HOSTS[host];
  const hostId = `h:${host}`;
  addNode({ id: hostId, label: info.label, type: 'host', layer: 'physical', column: host, meta: { ...info.meta, Stacks: (hv.stacks ?? []).length } });
  addEdge(hostId, info.uplink, info.uplink.startsWith('n:') ? 'member' : 'uplink');

  if (hv.nas_backup_enabled && config.backupTarget) addEdge(hostId, config.backupTarget, 'backup', 'restic');

  for (const stack of hv.stacks ?? []) {
    const composePath = `stacks/${host}/${stack}/docker-compose.yml`;
    if (!fs.existsSync(path.join(root, composePath))) continue;
    const compose = readYaml(composePath);
    const netDecl = compose.networks ?? {};

    const netId = (key) => {
      const decl = netDecl[key] ?? {};
      const name = decl.external ? decl.name ?? key : `${stack}_${key}`;
      const id = `n:${host}:${name}`;
      const n = addNode({
        id, label: decl.external && name === 'proxy' ? `proxy (${host})` : name, type: 'network', layer: 'network', column: host,
        meta: { Host: host, Typ: decl.external ? 'extern (geteilt)' : 'Stack-intern' },
      });
      const override = config.networkOverrides?.[name];
      if (override) {
        Object.assign(n, { label: override.label ?? n.label, meta: { ...n.meta, ...override.meta } });
        if (override.memberOf) addEdge(id, override.memberOf, 'member', override.edgeLabel);
      }
      addEdge(id, hostId, 'runs-on');
      return id;
    };

    for (const [svc, def] of Object.entries(compose.services ?? {})) {
      const cid = `c:${host}:${stack}:${svc}`;
      addNode({
        id: cid, label: svc, type: 'container', layer: 'container', column: host, group: stack,
        meta: { Stack: stack, Image: String(def.image ?? 'build'), ...(isDb(def.image) ? { Rolle: 'Datenhaltung' } : {}) },
      });

      const nets = def.networks ? (Array.isArray(def.networks) ? def.networks : Object.keys(def.networks)) : ['default'];
      for (const n of nets) addEdge(cid, netId(n), 'member');

      const deps = Array.isArray(def.depends_on) ? def.depends_on : Object.keys(def.depends_on ?? {});
      for (const d of deps) addEdge(cid, `c:${host}:${stack}:${d}`, 'depends');

      // Traefik-Routen
      const labels = Array.isArray(def.labels) ? def.labels : Object.entries(def.labels ?? {}).map(([k, v]) => `${k}=${v}`);
      const fqdns = [];
      for (const l of labels) {
        for (const m of l.matchAll(/Host\(`([^`]+)`\)/g)) fqdns.push(m[1].replace('${DOMAIN}', domain));
      }
      const middlewares = labels.filter((l) => l.includes('.middlewares=')).join(',');
      for (const fqdn of fqdns) {
        const eid = `e:${fqdn}`;
        addNode({ id: eid, label: fqdn, type: 'endpoint', layer: 'endpoint', column: host, meta: { URL: `https://${fqdn}`, Zugang: 'Traefik (HTTPS)' } });
        addEdge(eid, cid, 'routes');
        pending.push(() => addEdge(eid, `c:${host}:traefik:traefik`, 'via', 'Reverse Proxy'));
        for (const a of config.authMiddlewares ?? []) {
          if (middlewares.includes(a.match)) pending.push(() => addEdge(eid, `e:${a.endpoint}.${domain}`, 'auth', a.label));
        }
        if (!routedTo.has(cid)) routedTo.set(cid, new Set());
        routedTo.get(cid).add(eid);
      }

      // Direkt veröffentlichte Ports (80/443 gehören Traefik selbst)
      for (const p of def.ports ?? []) {
        const pub = String(p).split(':').slice(-2)[0];
        if (pub === '80' || pub === '443') continue;
        const base = fqdns[0] ?? host;
        const eid = `e:${base}:${pub}`;
        // Prüfadresse für Health-Checks: Hostname der Route, sonst LAN-Adresse des Hosts aus der Config
        const addr = fqdns[0] ?? info.meta?.LAN ?? host;
        addNode({ id: eid, label: `${base}:${pub}`, type: 'endpoint', layer: 'endpoint', column: host, meta: { Zugang: 'Port direkt', Port: pub, Check: `tcp://${addr}:${pub}` } });
        addEdge(eid, cid, 'routes');
      }

      // Querverweise: Images aus der eigenen Registry, URLs anderer Dienste
      const image = String(def.image ?? '');
      const imageHost = image.split('/')[0];
      if (imageHost.endsWith(domain)) pending.push(() => addEdge(cid, `e:${imageHost}`, 'image', 'Image-Quelle'));
      const envText = JSON.stringify([def.environment ?? {}, def.command ?? '', def.entrypoint ?? '']);
      for (const fqdn of fqdnsIn(envText)) {
        pending.push(() => {
          if (nodes.has(`e:${fqdn}`) && !routedTo.get(cid)?.has(`e:${fqdn}`)) addEdge(cid, `e:${fqdn}`, 'uses');
        });
      }
      for (const l of config.addressLinks ?? []) {
        if (l.match.some((m) => envText.includes(m))) addEdge(cid, l.to, 'uses', l.label);
      }

      // NAS-Mounts aus host_vars, die der Container einbindet
      for (const m of hv.nas_mounts ?? []) {
        if (config.nasTarget && (def.volumes ?? []).some((v) => String(v.source ?? v).startsWith(m.dest))) addEdge(cid, config.nasTarget, 'uses', `SMB ${m.dest}`);
      }
    }
  }
}

for (const fn of pending) fn();

// Kanten auf nicht existierende Knoten verwerfen (z. B. Traefik fehlt auf einem Host)
const finalEdges = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));

const topology = {
  name: 'server-stack',
  columns: COLUMNS,
  layers: [
    { id: 'physical', label: 'Hardware & Standorte' },
    { id: 'network', label: 'Netzwerke' },
    { id: 'container', label: 'Container' },
    { id: 'endpoint', label: 'Endpunkte' },
  ],
  nodes: [...nodes.values()],
  edges: finalEdges,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(topology, null, 2));
const count = (t) => topology.nodes.filter((n) => n.type === t).length;
console.log(`${outFile}: ${topology.nodes.length} Knoten (${count('host')} Hosts, ${count('network')} Netze, ${count('container')} Container, ${count('endpoint')} Endpunkte), ${finalEdges.length} Kanten`);
