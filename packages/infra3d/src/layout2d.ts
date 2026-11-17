import type { LayoutOptions } from './layout.js';
import type { InfraLayer, InfraNode, Topology } from './types.js';

/**
 * - `layers`: a matrix of one horizontal band per layer (top layer first) and one vertical
 *   strip per column, so a host's endpoints, containers, networks and hardware line up.
 * - `hosts`: one card per column (typically a host) with its nodes grouped by layer and
 *   the anchor layer split into its groups (typically compose stacks).
 */
export type DiagramView = 'layers' | 'hosts';

export interface DiagramLayoutOptions {
  view?: DiagramView;
  /** Layers left out of the diagram; the remaining layers close up. */
  hiddenLayers?: string[];
  /** Only `anchorLayer` is used: the layer that is split into groups. */
  layout?: LayoutOptions;
  /** Maximum nodes per row in a cell (`layers`, default 5) or card (`hosts`, default 4). */
  perRow?: number;
}

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramBox {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 2D positions in pixels; the origin is the top left corner of the diagram. */
export interface DiagramLayout {
  view: DiagramView;
  /** Centre of every visible node. */
  positions: Map<string, DiagramPoint>;
  /** `layers` view: one band per visible layer. */
  bands: DiagramBox[];
  /** `layers` view: the vertical strips. `hosts` view: the cards. */
  columns: DiagramBox[];
  /** `hosts` view: groups of the anchor layer inside the cards. */
  groups: DiagramBox[];
  /** `hosts` view: the caption of each layer inside a card; `y` is the caption's top. */
  sections: DiagramBox[];
  width: number;
  height: number;
}

/** Radius of a node glyph; the label sits below it. */
export const DIAGRAM_NODE_RADIUS = 10;
/** Labels longer than this are shortened with an ellipsis. */
export const DIAGRAM_LABEL_CHARS = 22;

const R = DIAGRAM_NODE_RADIUS;
const ROW_H = 50;
const MARGIN = 16;
// Average glyph width of an 11px sans-serif label
const CHAR_W = 6.3;

export function shortenLabel(label: string): string {
  return label.length > DIAGRAM_LABEL_CHARS ? `${label.slice(0, DIAGRAM_LABEL_CHARS - 1)}…` : label;
}

/** Horizontal space a node needs including its label. */
function cellWidth(n: InfraNode) {
  return Math.max(2 * R, Math.min(n.label.length, DIAGRAM_LABEL_CHARS) * CHAR_W) + 14;
}

export function computeDiagramLayout(topo: Topology, opts: DiagramLayoutOptions = {}): DiagramLayout {
  const hidden = new Set(opts.hiddenLayers ?? []);
  // Top layer first, as in the 3D view
  const layers = topo.layers.filter((l) => !hidden.has(l.id)).reverse();
  const nodes = topo.nodes.filter((n) => !hidden.has(n.layer));
  return opts.view === 'hosts' ? hostsView(topo, layers, nodes, opts) : layersView(topo, layers, nodes, opts);
}

function layersView(topo: Topology, layers: InfraLayer[], nodes: InfraNode[], opts: DiagramLayoutOptions): DiagramLayout {
  const anchorLayer = opts.layout?.anchorLayer ?? 'container';
  const perRowMax = Math.max(1, opts.perRow ?? 5);
  const COLUMN_CAPTION = 24, BAND_CAPTION = 22, BAND_PAD = 6, BAND_GAP = 8, COLUMN_GAP = 14, INSET = 10;

  // A matrix: one strip per column (nodes without a column first), one band per layer
  const strips = columnsOf(topo, nodes);
  const geo = strips.map((strip) => {
    const cell = Math.max(...strip.nodes.map(cellWidth));
    const most = Math.max(...layers.map((l) => strip.nodes.filter((n) => n.layer === l.id).length));
    return { ...strip, cell, perRow: Math.max(1, Math.min(perRowMax, most)) };
  });
  const bandRows = layers.map((l) => Math.max(0, ...geo.map((g) => Math.ceil(g.nodes.filter((n) => n.layer === l.id).length / g.perRow))));

  let x = MARGIN + INSET;
  const columns: DiagramBox[] = geo.map((g) => {
    const width = g.perRow * g.cell;
    const box = { id: g.id, label: g.label, x, y: MARGIN, width, height: 0 };
    x += width + COLUMN_GAP;
    return box;
  });
  const width = x - COLUMN_GAP + INSET + MARGIN;

  const bands: DiagramBox[] = [];
  let y = MARGIN + COLUMN_CAPTION;
  for (const [i, l] of layers.entries()) {
    const height = BAND_CAPTION + bandRows[i] * ROW_H + BAND_PAD;
    bands.push({ id: l.id, label: l.label, x: MARGIN, y, width: width - 2 * MARGIN, height });
    y += height + BAND_GAP;
  }
  const bottom = y - BAND_GAP;
  for (const c of columns) c.height = bottom - MARGIN;

  // Fill the cells: the anchor layer by group, every other layer by where its neighbours sit,
  // starting next to the anchor layer, so that edges cross as little as possible
  const positions = new Map<string, DiagramPoint>();
  const neighbours = new Map<string, string[]>();
  for (const e of topo.edges) {
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) {
      if (!neighbours.has(a)) neighbours.set(a, []);
      neighbours.get(a)!.push(b);
    }
  }
  const anchorIdx = Math.max(0, layers.findIndex((l) => l.id === anchorLayer));
  const order = layers.map((l, i) => ({ l, i })).sort((a, b) => Math.abs(a.i - anchorIdx) - Math.abs(b.i - anchorIdx));
  for (const { l, i } of order) {
    geo.forEach((g, gi) => {
      let list = g.nodes.filter((n) => n.layer === l.id);
      if (l.id === anchorLayer) {
        const groups = [...new Set(list.map((n) => n.group ?? ''))];
        list = [...list].sort((a, b) => groups.indexOf(a.group ?? '') - groups.indexOf(b.group ?? ''));
      } else {
        const key = new Map(list.map((n, k) => {
          const xs = (neighbours.get(n.id) ?? []).map((id) => positions.get(id)?.x).filter((v): v is number => v !== undefined);
          return [n.id, xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : Infinity - k];
        }));
        list = [...list].sort((a, b) => (key.get(a.id)! - key.get(b.id)!) || 0);
      }
      const top = bands[i].y + BAND_CAPTION;
      const c = columns[gi];
      // Centre short last rows under the full ones
      list.forEach((n, k) => {
        const row = Math.floor(k / g.perRow);
        const inRow = Math.min(g.perRow, list.length - row * g.perRow);
        const offset = ((g.perRow - inRow) * g.cell) / 2;
        positions.set(n.id, { x: c.x + offset + (k % g.perRow) * g.cell + g.cell / 2, y: top + row * ROW_H + R + 2 });
      });
    });
  }

  return { view: 'layers', positions, bands, columns, groups: [], sections: [], width, height: bottom + MARGIN };
}

/** Columns in their given order, then any the topology does not list; nodes without a column go first. */
function columnsOf(topo: Topology, nodes: InfraNode[]) {
  const ids = [...new Set([...(topo.columns ?? []), ...(nodes.map((n) => n.column).filter(Boolean) as string[])])];
  return [
    { id: '', label: 'External', nodes: nodes.filter((n) => !n.column) },
    ...ids.map((id) => ({ id, label: id, nodes: nodes.filter((n) => n.column === id) })),
  ].filter((c) => c.nodes.length);
}

function hostsView(topo: Topology, layers: InfraLayer[], nodes: InfraNode[], opts: DiagramLayoutOptions): DiagramLayout {
  const anchorLayer = opts.layout?.anchorLayer ?? 'container';
  const perRow = Math.max(1, opts.perRow ?? 4);
  const CARD_TITLE = 30, CARD_PAD = 14, CARD_GAP = 20, SECTION_CAPTION = 18, SECTION_GAP = 8, GROUP_CAPTION = 18, GROUP_GAP = 8;

  const cards = columnsOf(topo, nodes);

  const positions = new Map<string, DiagramPoint>();
  const columns: DiagramBox[] = [];
  const groups: DiagramBox[] = [];
  const sections: DiagramBox[] = [];
  let x = MARGIN;
  let bottom = MARGIN;

  for (const card of cards) {
    const cell = Math.max(...card.nodes.map(cellWidth));
    const x0 = x + CARD_PAD;
    // Split every layer into blocks; only the anchor layer has named groups
    const blocks = layers.map((layer) => {
      const list = card.nodes.filter((n) => n.layer === layer.id);
      const byGroup = new Map<string, InfraNode[]>();
      for (const n of list) {
        const g = layer.id === anchorLayer ? n.group ?? '' : '';
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(n);
      }
      return { layer, groups: [...byGroup] };
    }).filter((b) => b.groups.length);
    const widest = Math.max(1, ...blocks.flatMap((b) => b.groups.map(([, list]) => Math.min(perRow, list.length))));
    const inner = widest * cell;

    let y = MARGIN + CARD_TITLE;
    for (const { layer, groups: blockGroups } of blocks) {
      sections.push({ id: `${card.id}/${layer.id}`, label: layer.label, x: x0, y, width: inner, height: SECTION_CAPTION });
      y += SECTION_CAPTION;
      for (const [group, list] of blockGroups) {
        const top = y;
        if (group) y += GROUP_CAPTION;
        list.forEach((n, i) => {
          positions.set(n.id, { x: x0 + (i % perRow) * cell + cell / 2, y: y + Math.floor(i / perRow) * ROW_H + R + 2 });
        });
        y += Math.ceil(list.length / perRow) * ROW_H;
        if (group) {
          groups.push({ id: `${card.id}/${group}`, label: group, x: x0 - 6, y: top, width: inner + 12, height: y - top });
          y += GROUP_GAP;
        }
      }
      y += SECTION_GAP;
    }
    const width = inner + 2 * CARD_PAD;
    columns.push({ id: card.id, label: card.label, x, y: MARGIN, width, height: y - MARGIN });
    bottom = Math.max(bottom, y);
    x += width + CARD_GAP;
  }

  // Cards share one height so they read as a row
  for (const c of columns) c.height = bottom - MARGIN;
  const width = columns.length ? x - CARD_GAP + MARGIN : 2 * MARGIN;
  return { view: 'hosts', positions, bands: [], columns, groups, sections, width, height: bottom + MARGIN };
}
