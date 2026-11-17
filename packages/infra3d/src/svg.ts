import { computeDiagramLayout, shortenLabel, DIAGRAM_NODE_RADIUS as R, type DiagramLayout, type DiagramPoint, type DiagramView } from './layout2d.js';
import { DRAWIO_THEME } from './drawio.js';
import type { LayoutOptions } from './layout.js';
import { INFRA_PROFILE } from './infra-profile.js';
import { edgeKindSpec, nodeTypeSpec, shapeOf, type DomainProfile, type NodeShape } from './profile.js';
import { resolveTheme, type InfraTheme } from './theme.js';
import type { InfraNode, NodeStatus, Topology } from './types.js';

export interface SvgOptions {
  view?: DiagramView;
  /** Shapes, line styles and what the hosts cards imply. Default INFRA_PROFILE. */
  profile?: DomainProfile;
  hiddenLayers?: string[];
  layout?: LayoutOptions;
  /** Marks failed nodes red and suspects orange. */
  status?: Record<string, NodeStatus>;
  /** Colours; anything left out falls back to DRAWIO_THEME (light). Pass DEFAULT_THEME for the dark look of the app. */
  theme?: Partial<InfraTheme>;
}

/**
 * One 2D view as a standalone SVG document, without a browser: for servers, scripts and images
 * embedded in a wiki. Looks like `<InfraDiagram>` without a selection.
 */
export function toSvg(topo: Topology, opts: SvgOptions = {}): string {
  const theme = resolveTheme({ ...DRAWIO_THEME, ...opts.theme });
  const profile = opts.profile ?? INFRA_PROFILE;
  const layout = computeDiagramLayout(topo, { view: opts.view, hiddenLayers: opts.hiddenLayers, layout: { profile, ...opts.layout } });
  const status = opts.status ?? {};
  const w = Math.ceil(layout.width), h = Math.ceil(layout.height);
  const faulty = (id: string) => status[id] === 'down' || status[id] === 'suspect';

  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${esc(theme.fontFamily)}">`);
  out.push(`<title>${esc(`${topo.name ?? 'Infrastructure'}: ${layout.view}`)}</title>`);
  out.push(`<rect width="100%" height="100%" fill="${theme.background}"/>`);
  out.push(frames(layout, theme));

  const cardOf = new Map<string, string>();
  if (layout.view === 'hosts') {
    for (const [id, p] of layout.positions) {
      const c = layout.columns.find((c) => p.x >= c.x && p.x <= c.x + c.width);
      if (c) cardOf.set(id, c.id);
    }
  }
  out.push('<g fill="none" stroke-linecap="round">');
  for (const e of topo.edges) {
    const a = layout.positions.get(e.from), b = layout.positions.get(e.to);
    if (!a || !b) continue;
    const broken = faulty(e.from) && faulty(e.to);
    const spec = edgeKindSpec(profile, e.kind);
    // Implied by the cards of the hosts view
    if (!broken && layout.view === 'hosts' && spec.impliedByColumn && cardOf.get(e.from) === cardOf.get(e.to)) continue;
    const color = broken ? theme.suspect : theme.edgeColors[e.kind] ?? theme.defaultEdgeColor;
    const opacity = broken ? 0.85 : spec.faint ? 0.2 : 0.5;
    const dash = spec.line === 'dashed' ? ' stroke-dasharray="5 4"' : '';
    out.push(`<path d="${curve(a, b)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${broken ? 2 : 1.2}"${dash}/>`);
  }
  out.push('</g>');

  for (const n of topo.nodes) {
    const p = layout.positions.get(n.id);
    if (p) out.push(node(n, p, theme, profile, status[n.id]));
  }
  out.push('</svg>');
  return out.join('\n') + '\n';
}

function frames(layout: DiagramLayout, theme: InfraTheme): string {
  const caption = (x: number, y: number, text: string, color: string, size = 11, anchor = 'start') =>
    `<text x="${r(x)}" y="${r(y)}" fill="${color}" font-size="${size}" font-weight="600" letter-spacing="0.06em" text-anchor="${anchor}">${esc(text.toUpperCase())}</text>`;
  const s: string[] = [];
  if (layout.view === 'layers') {
    for (const c of layout.columns) {
      s.push(`<rect x="${r(c.x)}" y="${r(c.y)}" width="${r(c.width)}" height="${r(c.height)}" rx="8" fill="${theme.column}" opacity="0.35"/>`);
      s.push(caption(c.x + c.width / 2, c.y + 15, c.label, theme.columnLabel, 11, 'middle'));
    }
    for (const b of layout.bands) {
      s.push(`<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.width)}" height="${r(b.height)}" rx="6" fill="${theme.plane}" fill-opacity="0.45" stroke="${theme.planeOutline}" stroke-opacity="0.6"/>`);
      s.push(caption(b.x + 10, b.y + 16, b.label, theme.layerLabel));
    }
  } else {
    for (const c of layout.columns) {
      s.push(`<rect x="${r(c.x)}" y="${r(c.y)}" width="${r(c.width)}" height="${r(c.height)}" rx="10" fill="${theme.plane}" fill-opacity="0.55" stroke="${theme.planeOutline}" stroke-opacity="0.7"/>`);
      s.push(caption(c.x + 14, c.y + 20, c.label, theme.columnLabel, 13));
    }
    for (const sec of layout.sections) s.push(caption(sec.x, sec.y + 11, sec.label, theme.layerLabel, 10));
    for (const g of layout.groups) {
      s.push(`<rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.width)}" height="${r(g.height)}" rx="6" fill="${theme.column}" fill-opacity="0.3" stroke="${theme.planeOutline}" stroke-dasharray="3 3" stroke-opacity="0.7"/>`);
      s.push(`<text x="${r(g.x + 6)}" y="${r(g.y + 13)}" fill="${theme.layerLabel}" font-size="10">${esc(shortenLabel(g.label))}</text>`);
    }
  }
  return `<g>${s.join('')}</g>`;
}

function node(n: InfraNode, p: DiagramPoint, theme: InfraTheme, profile: DomainProfile, health?: NodeStatus): string {
  const color = theme.nodeColors[n.type] ?? theme.defaultNodeColor;
  const alarm = health === 'down' || health === 'suspect' ? theme[health] : null;
  const ring = alarm ? `<circle r="${R + 6}" fill="none" stroke="${alarm}" stroke-width="2.5"/>` : '';
  const label = `<text y="${R + 14}" text-anchor="middle" font-size="11" font-weight="${nodeTypeSpec(profile, n.type).emphasis ? 600 : 400}" fill="${theme.labelText}" stroke="${theme.background}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${esc(shortenLabel(n.label))}</text>`;
  const tip = `<title>${esc(`${n.label} (${n.type}${health && health !== 'unknown' ? `, ${health}` : ''})`)}</title>`;
  return `<g transform="translate(${r(p.x)} ${r(p.y)})">${tip}${ring}${shape(shapeOf(profile, n), color)}${label}</g>`;
}

function shape(s: NodeShape, color: string): string {
  switch (s) {
    case 'cylinder': return `<path d="M-8 -6V6A8 3 0 0 0 8 6V-6" fill="${color}"/><ellipse cy="-6" rx="8" ry="3" fill="${color}"/><path d="M-8 -6A8 3 0 0 0 8 -6" fill="none" stroke="rgba(0,0,0,0.25)"/>`;
    case 'wide': return `<rect x="-13" y="-8" width="26" height="16" rx="3" fill="${color}"/>`;
    case 'hexagon': return `<polygon points="-11,0 -5.5,-9.5 5.5,-9.5 11,0 5.5,9.5 -5.5,9.5" fill="${color}"/>`;
    case 'slab': return `<rect x="-10" y="-6" width="20" height="12" rx="2" fill="${color}"/>`;
    case 'ring': return `<circle r="7" fill="none" stroke="${color}" stroke-width="4"/>`;
    case 'diamond': return `<polygon points="0,-10 10,0 0,10 -10,0" fill="${color}"/>`;
    default: return `<rect x="-8" y="-8" width="16" height="16" rx="3" fill="${color}"/>`;
  }
}

/** Same curves as `<InfraDiagram>`: an S between rows, an arc within a row. */
function curve(a: DiagramPoint, b: DiagramPoint): string {
  const dy = b.y - a.y;
  if (Math.abs(dy) > 20) {
    const my = a.y + dy / 2;
    return `M${r(a.x)} ${r(a.y)}C${r(a.x)} ${r(my)} ${r(b.x)} ${r(my)} ${r(b.x)} ${r(b.y)}`;
  }
  const lift = 14 + Math.abs(b.x - a.x) * 0.12;
  return `M${r(a.x)} ${r(a.y)}Q${r((a.x + b.x) / 2)} ${r(Math.min(a.y, b.y) - lift)} ${r(b.x)} ${r(b.y)}`;
}

const r = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
