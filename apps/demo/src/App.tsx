import { useMemo, useState } from 'react';
import {
  InfraScene, DEFAULT_THEME, NODE_COLORS, DOWN_COLOR, UP_COLOR, STATUS_COLORS,
  analyzeHealth, checkTarget, computeHighlight, dependencyClosure, neighbors, validateTopology,
} from 'infra3d';
import type { BuiltinEdgeKind, BuiltinNodeType, CheckResult, HighlightMode, InfraEdge, NodeType, Topology } from 'infra3d';
import example from './data/example.json';

// Local data (written by the importer, gitignored) takes precedence over the example.
const local = Object.values(import.meta.glob<Topology>('./data/local.json', { eager: true, import: 'default' }))[0];
const topology = local ?? (example as Topology);
const validation = validateTopology(topology);
if (!validation.valid) console.warn('infra3d: invalid topology', validation.errors);

const TYPE_LABEL: Record<BuiltinNodeType, string> = {
  site: 'Site',
  device: 'Device',
  host: 'Host',
  network: 'Network',
  container: 'Container',
  endpoint: 'Endpoint',
};

const EDGE_LABEL: Record<BuiltinEdgeKind, [string, string]> = {
  // [outgoing, incoming]
  routes: ['routes to', 'reachable via'],
  via: ['goes through', 'forwards'],
  auth: ['login via', 'protects'],
  member: ['in network', 'member'],
  'runs-on': ['runs on', 'hosts network'],
  depends: ['depends on', 'needed by'],
  uses: ['uses', 'used by'],
  image: ['image from', 'provides image to'],
  uplink: ['connected to', 'connects'],
  backup: ['backs up to', 'backup of'],
};

const typeLabel = (t: NodeType) => TYPE_LABEL[t as BuiltinNodeType] ?? t;
const edgeLabel = (e: InfraEdge, dir: 0 | 1) => EDGE_LABEL[e.kind as BuiltinEdgeKind]?.[dir] ?? e.kind;

const nodeById = new Map(topology.nodes.map((n) => [n.id, n]));
const endpoints = topology.nodes.filter((n) => checkTarget(n));
const proxiesOf = (id: string) => topology.edges.filter((e) => e.from === id && e.kind === 'via').map((e) => e.to);

/** What outside-in health checks would report if the given nodes were broken. */
function simulateChecks(broken: string[]): Record<string, CheckResult> {
  const failed = new Set(broken);
  const hit = (id: string) => [...dependencyClosure(topology, id)].some((x) => failed.has(x));
  const results: Record<string, CheckResult> = {};
  for (const n of endpoints) {
    const proxies = proxiesOf(n.id);
    results[n.id] = { ok: !hit(n.id), answered: proxies.length > 0 && !proxies.some(hit) };
  }
  return results;
}

export function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<HighlightMode>('both');
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [broken, setBroken] = useState<string[]>([]);

  const highlight = useMemo(() => computeHighlight(topology, selected, mode), [selected, mode]);
  const node = selected ? nodeById.get(selected) : undefined;
  const nb = selected ? neighbors(topology, selected) : null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return topology.nodes
      .filter((n) => n.label.toLowerCase().includes(q) || n.group?.toLowerCase().includes(q) || n.column?.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query]);

  const health = useMemo(() => (broken.length ? analyzeHealth(topology, simulateChecks(broken)) : null), [broken]);
  const toggleBroken = (id: string) => setBroken((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  const toggleLayer = (id: string) => setHiddenLayers((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Infra 3D</h1>
          <p className="muted">{topology.name} · {topology.nodes.length} nodes · {topology.edges.length} connections</p>
        </header>

        {!validation.valid && (
          <section className="invalid">
            <h2>Invalid topology</h2>
            <ul>{validation.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>
          </section>
        )}

        {health && (
          <section className="simulation">
            <h2>Simulated failure</h2>
            <p>
              <span style={{ color: STATUS_COLORS.down }}>{health.down.length} of {endpoints.length} endpoints down</span>
              {' '}· broken: {broken.map((id) => nodeById.get(id)?.label).join(', ')}
            </p>
            {health.causes.length > 0 ? (
              <>
                <h3>Most likely causes</h3>
                <ul className="edges">
                  {health.causes.slice(0, 4).map((c) => (
                    <li key={c.id}>
                      <button onClick={() => setSelected(c.id)}><Dot type={nodeById.get(c.id)!.type} /> {nodeById.get(c.id)!.label}</button>
                      <span className="muted"> explains {c.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Everything below the failed endpoints answers – the fault is in the service itself.</p>
            )}
            <button className="clear" onClick={() => setBroken([])}>End simulation</button>
          </section>
        )}

        <section>
          <input className="search" placeholder="Search: api, proxy, homelab …" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <ul className="results">
              {results.map((n) => (
                <li key={n.id}>
                  <button onClick={() => { setSelected(n.id); setQuery(''); }}>
                    <Dot type={n.type} /> {n.label} <span className="muted">{n.group ?? n.column ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>Layers</h2>
          {[...topology.layers].reverse().map((l) => (
            <label key={l.id} className="check">
              <input type="checkbox" checked={!hiddenLayers.includes(l.id)} onChange={() => toggleLayer(l.id)} /> {l.label}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> All labels
          </label>
        </section>

        <section>
          <h2>On selection show</h2>
          <div className="seg">
            {(['deps', 'impact', 'both'] as const).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m === 'deps' ? 'Needs' : m === 'impact' ? 'Affects' : 'Both'}
              </button>
            ))}
          </div>
          <p className="legend">
            <span style={{ color: DOWN_COLOR }}>━ needs</span> (dependencies) · <span style={{ color: UP_COLOR }}>━ affects</span> (fails with it)
          </p>
        </section>

        {node && nb ? (
          <section className="details">
            <h2><Dot type={node.type} /> {node.label}</h2>
            <p className="muted">{typeLabel(node.type)}{health ? ` · ${health.status[node.id]}` : ''}{node.column ? ` · ${node.column}` : ''}</p>
            {node.meta && (
              <dl>
                {Object.entries(node.meta).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{String(v).startsWith('https://') ? <a href={String(v)} target="_blank" rel="noreferrer">{v}</a> : v}</dd></div>
                ))}
              </dl>
            )}
            {highlight && (
              <p className="stats">
                <span style={{ color: DOWN_COLOR }}>needs {highlight.down.nodes.size - 1}</span> ·{' '}
                <span style={{ color: UP_COLOR }}>affects {highlight.up.nodes.size - 1}</span>
              </p>
            )}
            <EdgeList title="Depends on" edges={nb.outgoing} dir={0} onPick={setSelected} />
            <EdgeList title="Used by" edges={nb.incoming} dir={1} onPick={setSelected} />
            <div className="actions">
              <button className="action" onClick={() => toggleBroken(node.id)}>
                {broken.includes(node.id) ? 'Repair this node' : 'Simulate failure here'}
              </button>
              <button className="clear" onClick={() => setSelected(null)}>Clear selection</button>
            </div>
          </section>
        ) : (
          <section className="hint muted">
            Click a node to see what it <b>needs</b> and what is <b>affected</b> when it fails,
            or simulate a failure and watch the health analysis narrow down the cause.
            Drag to rotate, right-drag to pan, scroll to zoom.
          </section>
        )}

        <section className="types">
          {(Object.keys(TYPE_LABEL) as BuiltinNodeType[]).map((t) => (
            <span key={t}><Dot type={t} /> {TYPE_LABEL[t]}</span>
          ))}
          <span><span className="dot" style={{ background: STATUS_COLORS.down }} /> down</span>
          <span><span className="dot" style={{ background: STATUS_COLORS.suspect }} /> suspect</span>
        </section>
      </aside>

      <main className="stage">
        <InfraScene topology={topology} status={health?.status} selectedId={selected} onSelect={setSelected} mode={mode} hiddenLayers={hiddenLayers} showAllLabels={showAll} />
      </main>
    </div>
  );
}

function EdgeList({ title, edges, dir, onPick }: { title: string; edges: InfraEdge[]; dir: 0 | 1; onPick: (id: string) => void }) {
  if (!edges.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="edges">
        {edges.map((e, i) => {
          const other = nodeById.get(dir === 0 ? e.to : e.from)!;
          return (
            <li key={i}>
              <span className="muted">{edgeLabel(e, dir)}</span>{' '}
              <button onClick={() => onPick(other.id)}><Dot type={other.type} /> {other.label}</button>
              <span className="muted">{other.group ? ` · ${other.group}@${other.column}` : ''}{e.label ? ` (${e.label})` : ''}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Dot({ type }: { type: NodeType }) {
  return <span className="dot" style={{ background: NODE_COLORS[type] ?? DEFAULT_THEME.defaultNodeColor }} />;
}
