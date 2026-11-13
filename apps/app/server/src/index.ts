import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { runChecks, state } from './checks.js';
import { config } from './config.js';
import { notify, notifyTargets } from './notify.js';
import { reload, source, topology } from './topology.js';

// infra3d app: imports the compose stacks, probes every endpoint and serves the 3D view.

async function cycle() {
  reload();
  const topo = topology();
  if (!topo) return;
  const changes = await runChecks(topo);
  if (changes.length) await notify(changes, topo, state(topo));
}

function apiState() {
  const topo = topology();
  return {
    topology: topo,
    source,
    intervalSec: config.intervalSec,
    notify: notifyTargets(),
    ...(topo ? state(topo) : { checkedAt: null, checks: {}, status: {}, down: [], suspects: {}, causes: [] }),
  };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(urlPath: string, res: http.ServerResponse) {
  const root = path.resolve(config.webDir);
  let file = path.resolve(root, '.' + decodeURIComponent(urlPath));
  if (file !== root && !file.startsWith(root + path.sep)) return void res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  if (!fs.existsSync(file)) return void res.writeHead(404).end('web UI not built');
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const json = (res: http.ServerResponse, body: unknown, status = 200) =>
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/api/state' && req.method === 'GET') return json(res, apiState());
    if (url.pathname === '/api/check' && req.method === 'POST') return (await cycle(), json(res, apiState()));
    if (url.pathname === '/healthz') return json(res, { ok: true });
    if (url.pathname.startsWith('/api/')) return json(res, { error: 'not found' }, 404);
    if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end();
    serveStatic(url.pathname, res);
  } catch (e) {
    console.error(e);
    json(res, { error: (e as Error).message }, 500);
  }
});

server.listen(config.port, () => {
  console.log(`infra3d listening on :${config.port}, ${source.kind === 'file' ? 'topology' : 'stacks'} from ${source.path}`);
  void cycle().then(() => {
    const topo = topology();
    if (source.error) console.warn(`topology: ${source.error}`);
    else if (topo) console.log(`${topo.nodes.length} nodes, ${Object.keys(state(topo).checks).length} endpoints checked every ${config.intervalSec}s`);
  });
  setInterval(() => void cycle(), config.intervalSec * 1000).unref();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
