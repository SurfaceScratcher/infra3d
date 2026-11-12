import { useMemo, useState } from 'react';
import { InfraScene, NODE_COLORS, DOWN_COLOR, UP_COLOR, computeHighlight, neighbors } from './infra3d';
import type { HighlightMode, InfraEdge, NodeType, Topology } from './infra3d';
import example from './data/example.json';

// Lokale Daten (vom Importer erzeugt, gitignored) haben Vorrang vor dem Beispiel.
const local = Object.values(import.meta.glob<Topology>('./data/local.json', { eager: true, import: 'default' }))[0];
const topology = local ?? (example as Topology);

const TYPE_LABEL: Record<NodeType, string> = {
  site: 'Standort',
  device: 'Gerät',
  host: 'Host',
  network: 'Netzwerk',
  container: 'Container',
  endpoint: 'Endpunkt',
};

const EDGE_LABEL: Record<InfraEdge['kind'], [string, string]> = {
  // [ausgehend, eingehend]
  routes: ['routet auf', 'erreichbar über'],
  via: ['läuft über', 'leitet weiter'],
  auth: ['Login über', 'schützt'],
  member: ['im Netz', 'Mitglied'],
  'runs-on': ['läuft auf', 'trägt Netz'],
  depends: ['braucht', 'gebraucht von'],
  uses: ['nutzt', 'genutzt von'],
  image: ['Image aus', 'liefert Image an'],
  uplink: ['angebunden an', 'bindet an'],
  backup: ['sichert nach', 'Backup von'],
};

const nodeById = new Map(topology.nodes.map((n) => [n.id, n]));

export function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<HighlightMode>('both');
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');

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

  const toggleLayer = (id: string) => setHiddenLayers((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Infra 3D</h1>
          <p className="muted">{topology.name} · {topology.nodes.length} Knoten · {topology.edges.length} Verbindungen</p>
        </header>

        <section>
          <input className="search" placeholder="Suchen: api, proxy, homelab …" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          <h2>Ebenen</h2>
          {[...topology.layers].reverse().map((l) => (
            <label key={l.id} className="check">
              <input type="checkbox" checked={!hiddenLayers.includes(l.id)} onChange={() => toggleLayer(l.id)} /> {l.label}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Alle Beschriftungen
          </label>
        </section>

        <section>
          <h2>Bei Auswahl zeigen</h2>
          <div className="seg">
            {(['deps', 'impact', 'both'] as const).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m === 'deps' ? 'Braucht' : m === 'impact' ? 'Betrifft' : 'Beides'}
              </button>
            ))}
          </div>
          <p className="legend">
            <span style={{ color: DOWN_COLOR }}>━ braucht</span> (Abhängigkeiten) · <span style={{ color: UP_COLOR }}>━ betrifft</span> (fällt mit aus)
          </p>
        </section>

        {node && nb ? (
          <section className="details">
            <h2><Dot type={node.type} /> {node.label}</h2>
            <p className="muted">{TYPE_LABEL[node.type]}{node.column ? ` · ${node.column}` : ''}</p>
            {node.meta && (
              <dl>
                {Object.entries(node.meta).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{String(v).startsWith('https://') ? <a href={String(v)} target="_blank" rel="noreferrer">{v}</a> : v}</dd></div>
                ))}
              </dl>
            )}
            {highlight && (
              <p className="stats">
                <span style={{ color: DOWN_COLOR }}>braucht {highlight.down.nodes.size - 1}</span> ·{' '}
                <span style={{ color: UP_COLOR }}>betrifft {highlight.up.nodes.size - 1}</span>
              </p>
            )}
            <EdgeList title="Hängt ab von" edges={nb.outgoing} dir={0} onPick={setSelected} />
            <EdgeList title="Wird genutzt von" edges={nb.incoming} dir={1} onPick={setSelected} />
            <button className="clear" onClick={() => setSelected(null)}>Auswahl aufheben</button>
          </section>
        ) : (
          <section className="hint muted">
            Klick auf einen Knoten zeigt, was er <b>braucht</b> und was bei seinem Ausfall <b>mit betroffen</b> ist.
            Ziehen = drehen, Rechtsklick-Ziehen = verschieben, Mausrad = zoomen.
          </section>
        )}

        <section className="types">
          {(Object.keys(TYPE_LABEL) as NodeType[]).map((t) => (
            <span key={t}><Dot type={t} /> {TYPE_LABEL[t]}</span>
          ))}
        </section>
      </aside>

      <main className="stage">
        <InfraScene topology={topology} selectedId={selected} onSelect={setSelected} mode={mode} hiddenLayers={hiddenLayers} showAllLabels={showAll} />
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
              <span className="muted">{EDGE_LABEL[e.kind][dir]}</span>{' '}
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
  return <span className="dot" style={{ background: NODE_COLORS[type] }} />;
}
