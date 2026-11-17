import { computeDiagramLayout, DIAGRAM_NODE_RADIUS, type DiagramBox, type DiagramLayout, type DiagramView } from './layout2d.js';
import type { LayoutOptions } from './layout.js';
import { resolveTheme, type InfraTheme } from './theme.js';
import type { InfraNode, NodeStatus, Topology } from './types.js';

export interface DrawioOptions {
  /** One diagram page per view, in this order. Default: both. */
  views?: DiagramView[];
  /** Page names; default `Layers` and `Hosts`. */
  pageNames?: Partial<Record<DiagramView, string>>;
  hiddenLayers?: string[];
  layout?: LayoutOptions;
  /** Marks failed nodes red and suspects orange. */
  status?: Record<string, NodeStatus>;
  /** Colours; anything left out falls back to DRAWIO_THEME, which suits a white wiki page. */
  theme?: Partial<InfraTheme>;
}

/** Light theme for diagrams that end up on white pages (wikis, docs, print). */
export const DRAWIO_THEME: InfraTheme = resolveTheme({
  background: '#ffffff',
  needs: '#5468d4',
  affects: '#d4546f',
  down: '#d93a5b',
  suspect: '#d9a521',
  plane: '#f5f4fa',
  planeOutline: '#d6d3e4',
  column: '#ebe9f4',
  labelText: '#1d1d2a',
  labelBackground: '#ffffff',
  layerLabel: '#6b6880',
  columnLabel: '#b5643a',
});

const PAGE_NAMES: Record<DiagramView, string> = { layers: 'Layers', hosts: 'Hosts' };
// Implied by the cards of the hosts view, so drawing them there only adds clutter
const IMPLIED_IN_CARD = ['member', 'runs-on'];

/**
 * The 2D diagrams as an uncompressed draw.io (diagrams.net) file, e.g. to embed with the draw.io
 * macro of XWiki or Confluence. Bands, cards and groups are containers and every edge is attached
 * to its nodes, so the diagram stays editable.
 */
export function toDrawio(topo: Topology, opts: DrawioOptions = {}): string {
  const theme = resolveTheme({ ...DRAWIO_THEME, ...opts.theme });
  const views = opts.views ?? ['layers', 'hosts'];
  const pages = views.map((view, i) => {
    const layout = computeDiagramLayout(topo, { view, hiddenLayers: opts.hiddenLayers, layout: opts.layout });
    const name = opts.pageNames?.[view] ?? PAGE_NAMES[view];
    return `  <diagram id="infra3d-${view}-${i}" name="${esc(name)}">\n${graphModel(topo, layout, theme, opts.status)}\n  </diagram>`;
  });
  return `<mxfile host="infra3d" type="device">\n${pages.join('\n')}\n</mxfile>\n`;
}

function graphModel(topo: Topology, layout: DiagramLayout, theme: InfraTheme, status?: Record<string, NodeStatus>): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const prefix = layout.view;
  const font = `fontFamily=${theme.fontFamily.split(',')[0].replace(/["']/g, '').trim()};`;

  // Containers, outermost first; a node or group belongs to the innermost one around it
  type Container = DiagramBox & { cellId: string; parent: Container | null };
  const containers: Container[] = [];
  const add = (b: DiagramBox, kind: string, style: string, parent: Container | null) => {
    const c: Container = { ...b, cellId: `${prefix}:${kind}:${b.id}`, parent };
    const [x, y] = relative(c, parent);
    cells.push(cell(c.cellId, b.label, style, parent?.cellId ?? '1', 'vertex="1"', geometry(x, y, b.width, b.height)));
    containers.push(c);
    return c;
  };
  const caption = `verticalAlign=top;align=left;spacingLeft=10;spacingTop=2;fontStyle=1;fontSize=11;${font}`;

  if (layout.view === 'layers') {
    // Column guides lie behind the bands and stay out of the way
    for (const col of layout.columns) {
      cells.push(cell(`${prefix}:column:${col.id}`, col.label, `rounded=1;arcSize=4;fillColor=${theme.column};strokeColor=none;fillOpacity=60;verticalAlign=top;fontStyle=1;fontSize=11;fontColor=${theme.columnLabel};movable=0;${font}`, '1', 'vertex="1"', geometry(col.x, col.y, col.width, col.height)));
    }
    for (const b of layout.bands) {
      add(b, 'band', `rounded=0;container=1;collapsible=0;fillColor=${theme.plane};fillOpacity=55;strokeColor=${theme.planeOutline};fontColor=${theme.layerLabel};${caption}`, null);
    }
  } else {
    for (const c of layout.columns) {
      const card = add(c, 'card', `rounded=1;arcSize=3;container=1;collapsible=0;fillColor=${theme.plane};strokeColor=${theme.planeOutline};fontColor=${theme.columnLabel};fontSize=13;${caption}spacingTop=6;`, null);
      for (const s of layout.sections.filter((s) => inside(s, card))) {
        const [x, y] = relative(s, card);
        cells.push(cell(`${prefix}:section:${s.id}`, s.label, `text;fontSize=10;fontColor=${theme.layerLabel};align=left;verticalAlign=top;spacing=0;${font}`, card.cellId, 'vertex="1"', geometry(x, y, s.width, s.height)));
      }
      for (const g of layout.groups.filter((g) => inside(g, card))) {
        add(g, 'group', `rounded=1;arcSize=6;container=1;collapsible=0;fillColor=${theme.background};strokeColor=${theme.planeOutline};dashed=1;fontColor=${theme.layerLabel};fontSize=10;${caption}fontStyle=0;spacingLeft=6;`, card);
      }
    }
  }

  const owner = (p: { x: number; y: number }) => {
    let best: Container | null = null;
    for (const c of containers) if (contains(c, p) && (!best || c.width * c.height < best.width * best.height)) best = c;
    return best;
  };

  const nodeById = new Map(topo.nodes.map((n) => [n.id, n]));
  const nodeOwner = new Map<string, Container | null>();
  const S = 2 * DIAGRAM_NODE_RADIUS;
  for (const [id, p] of layout.positions) {
    const n = nodeById.get(id)!;
    const parent = owner(p);
    nodeOwner.set(id, parent);
    const [w, h] = n.type === 'host' ? [S + 6, S - 2] : [S, S];
    const [x, y] = relative({ x: p.x - w / 2, y: p.y - h / 2 }, parent);
    const health = status?.[id];
    const alarm = health === 'down' || health === 'suspect' ? theme[health] : null;
    const style = `${shapeStyle(n)}fillColor=${theme.nodeColors[n.type] ?? theme.defaultNodeColor};strokeColor=${alarm ?? darken(theme.nodeColors[n.type] ?? theme.defaultNodeColor)};strokeWidth=${alarm ? 3 : 1};verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;spacingTop=-2;fontSize=11;fontColor=${theme.labelText};whiteSpace=nowrap;${font}`;
    const link = n.check?.startsWith('https://') || n.check?.startsWith('http://') ? n.check : undefined;
    cells.push(cell(`${prefix}:node:${id}`, n.label, style, parent?.cellId ?? '1', 'vertex="1"', geometry(x, y, w, h), { link, tooltip: tooltip(n, health) }));
  }

  topo.edges.forEach((e, i) => {
    if (!layout.positions.has(e.from) || !layout.positions.has(e.to)) return;
    const a = nodeOwner.get(e.from), b = nodeOwner.get(e.to);
    if (layout.view === 'hosts' && IMPLIED_IN_CARD.includes(e.kind) && card(a) === card(b)) return;
    const dashed = e.kind === 'backup' || e.kind === 'image' || e.kind === 'via';
    const style = `endArrow=classic;endSize=5;html=1;rounded=1;curved=1;strokeColor=${theme.edgeColors[e.kind] ? darken(theme.edgeColors[e.kind]) : theme.defaultEdgeColor};opacity=${e.kind === 'via' ? 35 : 70};dashed=${dashed ? 1 : 0};fontSize=9;fontColor=${theme.layerLabel};${font}`;
    cells.push(cell(`${prefix}:edge:${i}`, e.label ?? '', style, '1', `edge="1" source="${esc(`${prefix}:node:${e.from}`)}" target="${esc(`${prefix}:node:${e.to}`)}"`, '<mxGeometry relative="1" as="geometry"/>', { tooltip: e.kind }));
  });

  return `    <mxGraphModel dx="0" dy="0" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${Math.ceil(layout.width)}" pageHeight="${Math.ceil(layout.height)}" math="0" shadow="0" background="${theme.background}">\n      <root>\n${cells.map((c) => `        ${c}`).join('\n')}\n      </root>\n    </mxGraphModel>`;
}

/** Outermost container, i.e. the card of the hosts view. */
function card<T extends { parent: T | null }>(c: T | null | undefined): T | null {
  let cur = c ?? null;
  while (cur?.parent) cur = cur.parent;
  return cur;
}

function shapeStyle(n: InfraNode): string {
  if (n.role === 'database') return 'shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=4;';
  switch (n.type) {
    case 'host': return 'rounded=1;arcSize=15;';
    case 'site': return 'shape=hexagon;perimeter=hexagonPerimeter2;size=0.25;';
    case 'device': return 'rounded=1;arcSize=10;';
    case 'network': return 'ellipse;perimeter=ellipsePerimeter;';
    case 'endpoint': return 'rhombus;perimeter=rhombusPerimeter;';
    default: return 'rounded=1;arcSize=20;';
  }
}

function tooltip(n: InfraNode, health?: NodeStatus): string {
  const lines = [`${n.type}${n.group ? ` · ${n.group}` : ''}${n.column ? ` · ${n.column}` : ''}${health && health !== 'unknown' ? ` · ${health}` : ''}`];
  if (n.check) lines.push(n.check);
  for (const [k, v] of Object.entries(n.meta ?? {})) lines.push(`${k}: ${v}`);
  return lines.join('\n');
}

function cell(id: string, value: string, style: string, parent: string, kind: string, geom: string, extra: { link?: string; tooltip?: string } = {}): string {
  const inner = `<mxCell style="${esc(style)}" parent="${esc(parent)}" ${kind}>${geom}</mxCell>`;
  // A UserObject carries the tooltip and the link that draw.io opens on click
  if (extra.link || extra.tooltip) {
    const attrs = [`id="${esc(id)}"`, `label="${esc(value)}"`];
    if (extra.tooltip) attrs.push(`tooltip="${esc(extra.tooltip)}"`);
    if (extra.link) attrs.push(`link="${esc(extra.link)}"`);
    return `<UserObject ${attrs.join(' ')}>${inner}</UserObject>`;
  }
  return `<mxCell id="${esc(id)}" value="${esc(value)}" style="${esc(style)}" parent="${esc(parent)}" ${kind}>${geom}</mxCell>`;
}

const geometry = (x: number, y: number, w: number, h: number) =>
  `<mxGeometry x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" as="geometry"/>`;
const r = (v: number) => Math.round(v * 10) / 10;

function relative(p: { x: number; y: number }, parent: { x: number; y: number } | null): [number, number] {
  return parent ? [p.x - parent.x, p.y - parent.y] : [p.x, p.y];
}
const contains = (b: DiagramBox, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
const inside = (inner: DiagramBox, outer: DiagramBox) => contains(outer, { x: inner.x + inner.width / 2, y: inner.y + inner.height / 2 });

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

/** The colour at 70 % brightness, for outlines on light backgrounds. */
function darken(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(((v >> shift) & 255) * 0.7).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
