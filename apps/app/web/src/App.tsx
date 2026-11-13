import { useEffect, useMemo, useRef, useState } from 'react';
import {
  InfraScene, DEFAULT_THEME, NODE_COLORS, DOWN_COLOR, UP_COLOR, STATUS_COLORS,
  analyzeHealth, checkTarget, computeHighlight, dependencyClosure, neighbors, validateTopology,
} from 'infra3d';
import type { BuiltinEdgeKind, BuiltinNodeType, CheckResult, HighlightMode, InfraEdge, InfraNode, InfraSceneHandle, NodeType, Topology } from 'infra3d';
import { clock, since, useLiveState, type LiveState } from './live';

// Two modes: the static demo (GitHub Pages, `--mode demo`) and the live app served by the infra3d server.
const DEMO = import.meta.env.VITE_DEMO === 'true';

/** Demo data, loaded only in demo builds so that neither file ends up in the app bundle. */
async function loadDemoTopology(): Promise<Topology> {
  if (import.meta.env.VITE_DEMO !== 'true') throw new Error('not a demo build');
  // Local data (written by the importer, gitignored) takes precedence over the example
  const local = Object.values(import.meta.glob<Topology>('./data/local.json', { import: 'default' }))[0];
  return local ? local() : ((await import('./data/example.json')).default as Topology);
}

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

/** What outside-in health checks would report if the given nodes were broken. */
function simulateChecks(topology: Topology, endpoints: InfraNode[], broken: string[]): Record<string, CheckResult> {
  const failed = new Set(broken);
  const hit = (id: string) => [...dependencyClosure(topology, id)].some((x) => failed.has(x));
  const results: Record<string, CheckResult> = {};
  for (const n of endpoints) {
    const proxies = topology.edges.filter((e) => e.from === n.id && e.kind === 'via').map((e) => e.to);
    results[n.id] = { ok: !hit(n.id), answered: proxies.length > 0 && !proxies.some(hit) };
  }
  return results;
}

export function App() {
  return DEMO ? <Demo /> : <Live />;
}

/** The demo opens in the middle of an outage, so the point is clear before anyone clicks. */
const DEMO_OUTAGE = ['h:homelab'];

function Demo() {
  const [topology, setTopology] = useState<Topology | null>(null);
  useEffect(() => void loadDemoTopology().then(setTopology), []);
  if (!topology) return null;
  const outage = DEMO_OUTAGE.filter((id) => topology.nodes.some((n) => n.id === id));
  return <Explorer topology={topology} initialBroken={outage} intro />;
}

function Live() {
  const { state, error, busy, checkNow } = useLiveState();
  if (state?.topology) return <Explorer topology={state.topology} live={state} busy={busy} onCheckNow={checkNow} />;
  return (
    <div className="setup">
      <h1>infra3d</h1>
      {!state && !error && <p className="muted">Connecting …</p>}
      {error && <p className="error">Cannot reach the infra3d server: {error}</p>}
      {state && (
        <>
          <p className="error">No topology yet{state.source.error ? `: ${state.source.error}` : '.'}</p>
          <p className="muted">
            Mount your compose stacks at <code>/stacks</code> (one folder per host, one per stack) or set <code>INFRA3D_TOPOLOGY</code> to a
            topology file. Hosts, sites and special cases go into <code>/config/infra3d.config.json</code>.
          </p>
          <button className="action" onClick={checkNow} disabled={busy}>Try again</button>
        </>
      )}
    </div>
  );
}

function Explorer({ topology, live, busy, onCheckNow, initialBroken = [], intro = false }: {
  topology: Topology;
  live?: LiveState;
  busy?: boolean;
  onCheckNow?: () => void;
  /** Nodes that start out broken (demo scenario). */
  initialBroken?: string[];
  /** Explain the starting scenario in the simulation panel. */
  intro?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<HighlightMode>('both');
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [broken, setBroken] = useState<string[]>(initialBroken);
  const scene = useRef<InfraSceneHandle>(null);

  const validation = useMemo(() => validateTopology(topology), [topology]);
  const nodeById = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n])), [topology]);
  const endpoints = useMemo(() => topology.nodes.filter((n) => checkTarget(n)), [topology]);
  const highlight = useMemo(() => computeHighlight(topology, selected, mode), [topology, selected, mode]);
  const node = selected ? nodeById.get(selected) : undefined;
  const nb = selected ? neighbors(topology, selected) : null;
  const label = (id: string) => nodeById.get(id)?.label ?? id;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return topology.nodes
      .filter((n) => n.label.toLowerCase().includes(q) || n.group?.toLowerCase().includes(q) || n.column?.toLowerCase().includes(q))
      .slice(0, 12);
  }, [topology, query]);

  // A running simulation takes precedence over the live state
  const simulation = useMemo(
    () => (broken.length ? analyzeHealth(topology, simulateChecks(topology, endpoints, broken)) : null),
    [topology, endpoints, broken],
  );
  const status = simulation?.status ?? live?.status;
  const toggleBroken = (id: string) => setBroken((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  const toggleLayer = (id: string) => setHiddenLayers((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  const checks = live ? Object.values(live.checks) : [];
  const reachable = checks.filter((c) => c.ok).length;
  const check = node && live?.checks[node.id];

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>infra3d</h1>
          <p className="muted">{topology.name} · {topology.nodes.length} nodes · {topology.edges.length} connections</p>
        </header>

        {!validation.valid && (
          <section className="invalid">
            <h2>Invalid topology</h2>
            <ul>{validation.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>
          </section>
        )}

        {live && (
          <section className={`live ${live.down.length ? 'bad' : 'good'}`}>
            <div className="live-head">
              <strong>{live.down.length ? `${live.down.length} down` : 'All reachable'}</strong>
              <button className="action" onClick={onCheckNow} disabled={busy}>{busy ? 'Checking …' : 'Check now'}</button>
            </div>
            <p className="muted small">
              {reachable} of {checks.length} endpoints · checked {clock(live.checkedAt)} · every {live.intervalSec}s
            </p>
            {live.source.error && <p className="error small">Topology: {live.source.error} (showing the last good one)</p>}
            {live.source.warnings.length > 0 && (
              <details className="small">
                <summary className="muted">{live.source.warnings.length} import warning{live.source.warnings.length > 1 ? 's' : ''}</summary>
                <ul>{live.source.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </details>
            )}
            {live.down.length > 1 && (live.causes[0]?.count ?? 0) > 1 && (
              <p className="small">
                Most likely shared cause:{' '}
                <button className="link" onClick={() => setSelected(live.causes[0].id)}>{label(live.causes[0].id)}</button>
                <span className="muted"> (explains {live.causes[0].count})</span>
              </p>
            )}
            <ul className="problems">
              {live.down.map((id) => {
                const suspects = live.suspects[id] ?? [];
                return (
                  <li key={id}>
                    <button className="link strong" onClick={() => setSelected(id)}>{label(id)}</button>
                    <span className="small"> {live.checks[id]?.error ?? 'unreachable'} · {since(live.checks[id]?.since ?? null)}</span>
                    <div className="muted small">
                      {suspects.length ? (
                        <>Suspects: {suspects.slice(0, 3).map((s, i) => (
                          <span key={s}>{i > 0 && ', '}<button className="link" onClick={() => setSelected(s)}>{label(s)}</button></span>
                        ))}</>
                      ) : (
                        'Everything below answers – the fault is in the service itself.'
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {simulation && (
          <section className="simulation">
            <h2>Simulated failure</h2>
            {intro && broken.join() === initialBroken.join() && (
              <p className="intro">
                <b>{broken.map(label).join(', ')}</b> just went offline. infra3d only probes the {endpoints.length} endpoints from
                outside; the dependency graph narrows {topology.nodes.length} nodes down to {simulation.causes.filter((c) => c.count === simulation.causes[0]?.count).length} candidates.
              </p>
            )}
            <p>
              <span style={{ color: STATUS_COLORS.down }}>{simulation.down.length} of {endpoints.length} endpoints down</span>
              {' '}· broken: {broken.map(label).join(', ')}
            </p>
            {simulation.causes.length > 0 ? (
              <>
                <h3>Most likely causes</h3>
                <ul className="edges">
                  {simulation.causes.slice(0, 4).map((c) => (
                    <li key={c.id}>
                      <button onClick={() => setSelected(c.id)}><Dot type={nodeById.get(c.id)!.type} /> {label(c.id)}</button>
                      <span className="muted"> explains {c.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Everything below the failed endpoints answers – the fault is in the service itself.</p>
            )}
            <button className="action" onClick={() => setBroken([])}>Repair everything</button>
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
            <p className="muted">{typeLabel(node.type)}{status?.[node.id] ? ` · ${status[node.id]}` : ''}{node.column ? ` · ${node.column}` : ''}</p>
            {check && (
              <p className="small">
                {check.target} · {check.ok ? `${check.ms} ms` : check.error ?? 'not checked yet'}{check.since ? ` · ${since(check.since)}` : ''}
              </p>
            )}
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
            <EdgeList title="Depends on" edges={nb.outgoing} dir={0} nodeById={nodeById} onPick={setSelected} />
            <EdgeList title="Used by" edges={nb.incoming} dir={1} nodeById={nodeById} onPick={setSelected} />
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
        <p className="credits">
          <a href="https://github.com/SurfaceScratcher/infra3d" target="_blank" rel="noreferrer">infra3d</a> · MIT ·{' '}
          <a href="THIRD_PARTY_LICENSES.md" target="_blank" rel="noreferrer">third-party licenses</a>
        </p>
      </aside>

      <main className="stage">
        <button className="fit" onClick={() => { setSelected(null); scene.current?.fitAll(); }}>Show all</button>
        <InfraScene ref={scene} topology={topology} status={status} selectedId={selected} onSelect={setSelected} mode={mode} hiddenLayers={hiddenLayers} showAllLabels={showAll} />
      </main>
    </div>
  );
}

function EdgeList({ title, edges, dir, nodeById, onPick }: { title: string; edges: InfraEdge[]; dir: 0 | 1; nodeById: Map<string, InfraNode>; onPick: (id: string) => void }) {
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
