import { describe, expect, it } from 'vitest';
import { computeDiagramLayout, shortenLabel, DIAGRAM_LABEL_CHARS } from '../src/layout2d.js';
import { toDrawio } from '../src/drawio.js';
import { topo } from './fixture.js';

const within = (b: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

function expectNoOverlap(layout: ReturnType<typeof computeDiagramLayout>) {
  const pts = [...layout.positions];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const [a, pa] = pts[i];
      const [b, pb] = pts[j];
      const apart = Math.abs(pa.y - pb.y) >= 40 || Math.abs(pa.x - pb.x) >= 30;
      expect(apart, `${a} / ${b}`).toBe(true);
    }
  }
}

describe('computeDiagramLayout: layers', () => {
  const layout = computeDiagramLayout(topo, { view: 'layers' });

  it('stacks one band per layer, top layer first', () => {
    expect(layout.bands.map((b) => b.id)).toEqual(['endpoint', 'container', 'network', 'physical']);
    for (let i = 1; i < layout.bands.length; i++) expect(layout.bands[i].y).toBeGreaterThan(layout.bands[i - 1].y);
  });

  it('places every node inside the band of its layer and inside the diagram', () => {
    for (const n of topo.nodes) {
      const p = layout.positions.get(n.id)!;
      expect(within(layout.bands.find((b) => b.id === n.layer)!, p), n.id).toBe(true);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(layout.width);
    }
  });

  it('lines up each column in its own strip, nodes without a column first', () => {
    expect(layout.columns.map((c) => c.id)).toEqual(['', 'host-a', 'host-b']);
    for (const n of topo.nodes) {
      const strip = layout.columns.find((c) => c.id === (n.column ?? ''))!;
      expect(within(strip, layout.positions.get(n.id)!), n.id).toBe(true);
    }
  });

  it('keeps the members of a group next to each other', () => {
    const p = (id: string) => layout.positions.get(id)!;
    expect(p('c:a:shop').y).toBe(p('c:a:shop-db').y);
    const xs = ['c:a:traefik', 'c:a:shop', 'c:a:shop-db', 'c:a:wiki'].map((id) => p(id).x);
    expect(Math.abs(xs.indexOf(p('c:a:shop').x) - xs.indexOf(p('c:a:shop-db').x))).toBe(1);
  });

  it('keeps nodes and labels apart', () => expectNoOverlap(layout));

  it('drops hidden layers and closes the gap', () => {
    const h = computeDiagramLayout(topo, { view: 'layers', hiddenLayers: ['network'] });
    expect(h.bands.map((b) => b.id)).not.toContain('network');
    expect(h.positions.has('n:a:proxy')).toBe(false);
    expect(h.height).toBeLessThan(layout.height);
  });
});

describe('computeDiagramLayout: hosts', () => {
  const layout = computeDiagramLayout(topo, { view: 'hosts' });

  it('makes one card per column and one for nodes without a column', () => {
    expect(layout.columns.map((c) => c.id)).toEqual(['', 'host-a', 'host-b']);
    for (const n of topo.nodes) {
      const card = layout.columns.find((c) => c.id === (n.column ?? ''))!;
      expect(within(card, layout.positions.get(n.id)!), n.id).toBe(true);
    }
  });

  it('puts the anchor layer into its groups', () => {
    const shop = layout.groups.find((g) => g.label === 'shop')!;
    expect(within(shop, layout.positions.get('c:a:shop')!)).toBe(true);
    expect(within(shop, layout.positions.get('c:a:shop-db')!)).toBe(true);
    expect(within(shop, layout.positions.get('c:a:wiki')!)).toBe(false);
  });

  it('keeps nodes and labels apart', () => expectNoOverlap(layout));

  it('wraps long rows', () => {
    const wide = computeDiagramLayout(topo, { view: 'hosts', perRow: 1 });
    const a = wide.positions.get('c:a:shop')!;
    const b = wide.positions.get('c:a:shop-db')!;
    expect(a.x).toBe(b.x);
    expect(b.y).toBeGreaterThan(a.y);
  });
});

describe('shortenLabel', () => {
  it('shortens long labels to the limit', () => {
    expect(shortenLabel('short')).toBe('short');
    const long = shortenLabel('a-very-long-container-name-indeed');
    expect(long).toHaveLength(DIAGRAM_LABEL_CHARS);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('toDrawio', () => {
  const xml = toDrawio(topo, { status: { 'e:shop': 'down' } });

  it('writes one page per view', () => {
    expect(xml.startsWith('<mxfile')).toBe(true);
    expect(xml.match(/<diagram /g)).toHaveLength(2);
    expect(xml).toContain('name="Layers"');
    expect(xml).toContain('name="Hosts"');
  });

  it('contains every node on every page and attaches edges to existing cells', () => {
    for (const view of ['layers', 'hosts']) {
      for (const n of topo.nodes) expect(xml, `${view} ${n.id}`).toContain(`id="${view}:node:${n.id}"`);
    }
    const ids = new Set([...xml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of xml.matchAll(/(?:source|target)="([^"]+)"/g)) expect(ids.has(m[1]), m[1]).toBe(true);
  });

  it('nests nodes in their card and group on the hosts page', () => {
    const hosts = xml.slice(xml.indexOf('name="Hosts"'));
    expect(hosts).toMatch(/id="hosts:node:c:a:shop"[^>]*>\s*<mxCell[^>]*parent="hosts:group:host-a\/shop"/);
    expect(hosts).toMatch(/id="hosts:node:h:a"[^>]*>\s*<mxCell[^>]*parent="hosts:card:host-a"/);
  });

  it('leaves out edges the hosts cards already show', () => {
    const hosts = xml.slice(xml.indexOf('name="Hosts"'));
    const layers = xml.slice(0, xml.indexOf('name="Hosts"'));
    const count = (s: string) => (s.match(/edge="1"/g) ?? []).length;
    expect(count(layers)).toBe(topo.edges.length);
    expect(count(hosts)).toBeLessThan(count(layers));
  });

  it('links https endpoints, marks failures and escapes XML', () => {
    expect(xml).toContain('link="https://shop.example.com"');
    expect(xml).toMatch(/id="layers:node:e:shop"[^>]*>\s*<mxCell style="[^"]*strokeWidth=3/);
    const odd = toDrawio({ ...topo, nodes: topo.nodes.map((n) => (n.id === 'site' ? { ...n, label: 'A & "B" <C>' } : n)) });
    expect(odd).toContain('label="A &amp; &quot;B&quot; &lt;C&gt;"');
  });

  it('can export a single view', () => {
    expect(toDrawio(topo, { views: ['hosts'] }).match(/<diagram /g)).toHaveLength(1);
  });
});
