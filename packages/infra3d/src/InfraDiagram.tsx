import { useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref, type RefObject } from 'react';
import { computeDiagramLayout, shortenLabel, DIAGRAM_NODE_RADIUS as R, type DiagramLayout, type DiagramPoint, type DiagramView } from './layout2d.js';
import { computeHighlight, type Highlight } from './graph.js';
import { resolveTheme, type InfraTheme } from './theme.js';
import type { LayoutOptions } from './layout.js';
import { INFRA_PROFILE } from './infra-profile.js';
import { edgeKindSpec, nodeTypeSpec, shapeOf, type DomainProfile, type NodeShape } from './profile.js';
import type { HighlightMode, InfraEdge, InfraNode, NodeStatus, Topology } from './types.js';

export interface InfraDiagramProps {
  topology: Topology;
  /** `layers`: one band per layer, aligned with the 3D view. `hosts`: one card per host with its stacks. */
  view?: DiagramView;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  mode?: HighlightMode;
  hiddenLayers?: string[];
  /** Node shapes, edge styles and how failures travel. Default INFRA_PROFILE. */
  profile?: DomainProfile;
  /** Live state per node: failed nodes pulse red, suspects are marked orange. */
  status?: Record<string, NodeStatus>;
  theme?: Partial<InfraTheme>;
  /** Shortcut for `theme.background`. */
  background?: string;
  layout?: LayoutOptions;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<InfraDiagramHandle>;
}

export interface InfraDiagramHandle {
  /** Zooms and pans so that the whole diagram is visible. */
  fitAll(smooth?: boolean): void;
  /** The diagram as a standalone SVG document, as currently styled (selection and status included). */
  toSVG(): string;
}

interface View { k: number; x: number; y: number }

const MAX_ZOOM = 3;
const NO_LAYERS: string[] = [];

export function InfraDiagram({
  topology,
  view = 'layers',
  selectedId = null,
  onSelect,
  mode = 'both',
  hiddenLayers = NO_LAYERS,
  profile = INFRA_PROFILE,
  status,
  theme: themeOverrides,
  background,
  layout: layoutOpts,
  className,
  style,
  ref,
}: InfraDiagramProps) {
  const layout = useMemo(() => computeDiagramLayout(topology, { view, hiddenLayers, layout: { profile, ...layoutOpts } }), [topology, view, hiddenLayers, profile, layoutOpts]);
  const highlight = useMemo(() => computeHighlight(topology, selectedId, mode, profile), [topology, selectedId, mode, profile]);
  const theme = useMemo(() => resolveTheme(background ? { ...themeOverrides, background } : themeOverrides), [themeOverrides, background]);
  const nodeById = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n])), [topology]);
  const cardOf = useMemo(() => cardIndex(layout), [layout]);
  const [hovered, setHovered] = useState<string | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const size = useSize(container);
  const [vp, setVp] = useState<View>({ k: 1, x: 0, y: 0 });
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const userMoved = useRef(false);
  const anim = useRef(0);

  const animateTo = (target: View, smooth: boolean) => {
    cancelAnimationFrame(anim.current);
    if (!smooth) return setVp(target);
    const from = vpRef.current;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 280);
      const e = 1 - (1 - p) ** 3;
      setVp({ k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e });
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  const fitView = (): View => {
    const pad = 12;
    const k = Math.min((size.w - pad * 2) / layout.width, (size.h - pad * 2) / layout.height, 1.4);
    return { k, x: (size.w - layout.width * k) / 2, y: (size.h - layout.height * k) / 2 };
  };
  const fitAll = (smooth = true) => {
    userMoved.current = false;
    if (size.w && size.h) animateTo(fitView(), smooth);
  };

  useImperativeHandle(ref, () => ({
    fitAll,
    toSVG: () => (svg.current ? standaloneSVG(svg.current, layout, theme) : ''),
  }));

  // Refit on resize and layout changes until the user pans or zooms
  useEffect(() => {
    if (!userMoved.current) fitAll(false);
  }, [size.w, size.h, layout]);

  // Bring the selected node into view if it is outside; the overview stays as it is
  useEffect(() => {
    const p = selectedId ? layout.positions.get(selectedId) : undefined;
    if (!p || !size.w) return;
    const { k, x, y } = vpRef.current;
    const sx = p.x * k + x, sy = p.y * k + y, margin = 40;
    if (sx > margin && sx < size.w - margin && sy > margin && sy < size.h - margin) return;
    const nk = Math.max(k, 0.9);
    animateTo({ k: nk, x: size.w / 2 - p.x * nk, y: size.h / 2 - p.y * nk }, true);
  }, [selectedId, layout]);

  // Wheel zoom around the pointer; needs a non-passive listener to stop the page from scrolling
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [layout, size.w, size.h]);

  const minZoom = () => Math.min(fitView().k, 0.5);
  const zoomAt = (px: number, py: number, factor: number) => {
    cancelAnimationFrame(anim.current);
    userMoved.current = true;
    setVp((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(minZoom(), v.k * factor));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  };

  // Drag to pan, two fingers to pinch; a click without movement on empty space clears the selection
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: 0, pinch: 0 });
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) drag.current = { moved: 0, pinch: 0 };
    if (pointers.current.size === 2) drag.current.pinch = spread(pointers.current);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved > 4 && !svg.current!.hasPointerCapture(e.pointerId)) svg.current!.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const d = spread(pointers.current);
      const rect = svg.current!.getBoundingClientRect();
      const [a, b] = [...pointers.current.values()];
      if (drag.current.pinch) zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, d / drag.current.pinch);
      drag.current.pinch = d;
    } else if (drag.current.moved > 4) {
      cancelAnimationFrame(anim.current);
      userMoved.current = true;
      setVp((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) drag.current.pinch = 0;
  };
  const onBackgroundClick = () => {
    if (drag.current.moved <= 4) onSelect?.(null);
  };
  const select = (id: string) => {
    if (drag.current.moved <= 4) onSelect?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Escape') onSelect?.(null);
    else if (e.key === '+' || e.key === '=') zoomAt(size.w / 2, size.h / 2, 1.25);
    else if (e.key === '-') zoomAt(size.w / 2, size.h / 2, 0.8);
    else if (e.key === '0') fitAll();
  };

  // Edges touching the hovered node stand out while nothing is selected
  const focusEdges = !highlight && hovered ? hovered : null;
  const isFaulty = (s?: NodeStatus) => s === 'down' || s === 'suspect';

  return (
    <div ref={container} className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: theme.background, ...style }}>
      <svg
        ref={svg}
        width="100%"
        height="100%"
        role="group"
        aria-label={`${topology.name ?? 'Infrastructure'}: ${view === 'hosts' ? 'hosts' : 'layers'} diagram`}
        tabIndex={-1}
        style={{ display: 'block', touchAction: 'none', fontFamily: theme.fontFamily, userSelect: 'none', outline: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onBackgroundClick}
        onKeyDown={onKeyDown}
      >
        <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.k})`}>
          <Frames layout={layout} theme={theme} />
          <g fill="none" pointerEvents="none">
            {topology.edges.map((e, i) => {
              const a = layout.positions.get(e.from), b = layout.positions.get(e.to);
              if (!a || !b) return null;
              const faulty = !!status && isFaulty(status[e.from]) && isFaulty(status[e.to]);
              const touched = focusEdges === e.from || focusEdges === e.to;
              // The hosts view draws what the cards imply only when it is highlighted
              const implied = view === 'hosts' && !!edgeKindSpec(profile, e.kind).impliedByColumn && cardOf.get(e.from) === cardOf.get(e.to);
              return <EdgePath key={i} edge={e} profile={profile} index={i} a={a} b={b} theme={theme} highlight={highlight} faulty={faulty} touched={touched} implied={implied} />;
            })}
          </g>
          {topology.nodes.map((n) => {
            const p = layout.positions.get(n.id);
            if (!p) return null;
            return (
              <NodeGlyph
                key={n.id}
                node={n}
                profile={profile}
                p={p}
                theme={theme}
                selected={n.id === selectedId}
                hovered={n.id === hovered}
                state={nodeState(n.id, highlight)}
                health={status?.[n.id]}
                onHover={setHovered}
                onSelect={select}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function Frames({ layout, theme }: { layout: DiagramLayout; theme: InfraTheme }) {
  const caption = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' } as const;
  if (layout.view === 'layers') {
    return (
      <g pointerEvents="none">
        {layout.columns.map((c) => (
          <g key={c.id}>
            <rect x={c.x} y={c.y} width={c.width} height={c.height} rx={8} fill={theme.column} opacity={0.35} />
            <text x={c.x + c.width / 2} y={c.y + 15} textAnchor="middle" fill={theme.columnLabel} style={caption}>{c.label}</text>
          </g>
        ))}
        {layout.bands.map((b) => (
          <g key={b.id}>
            <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={6} fill={theme.plane} fillOpacity={0.45} stroke={theme.planeOutline} strokeOpacity={0.6} />
            <text x={b.x + 10} y={b.y + 16} fill={theme.layerLabel} style={caption}>{b.label}</text>
          </g>
        ))}
      </g>
    );
  }
  return (
    <g pointerEvents="none">
      {layout.columns.map((c) => (
        <g key={c.id}>
          <rect x={c.x} y={c.y} width={c.width} height={c.height} rx={10} fill={theme.plane} fillOpacity={0.55} stroke={theme.planeOutline} strokeOpacity={0.7} />
          <text x={c.x + 14} y={c.y + 20} fill={theme.columnLabel} style={{ ...caption, fontSize: 13 }}>{c.label}</text>
        </g>
      ))}
      {layout.sections.map((s) => (
        <text key={s.id} x={s.x} y={s.y + 11} fill={theme.layerLabel} style={{ ...caption, fontSize: 10, fontWeight: 500 }}>{s.label}</text>
      ))}
      {layout.groups.map((g) => (
        <g key={g.id}>
          <rect x={g.x} y={g.y} width={g.width} height={g.height} rx={6} fill={theme.column} fillOpacity={0.3} stroke={theme.planeOutline} strokeDasharray="3 3" strokeOpacity={0.7} />
          <text x={g.x + 6} y={g.y + 13} fill={theme.layerLabel} fontSize={10}>{shortenLabel(g.label)}</text>
        </g>
      ))}
    </g>
  );
}

function EdgePath({ edge, profile, index, a, b, theme, highlight, faulty, touched, implied }: {
  edge: InfraEdge; profile: DomainProfile; index: number; a: DiagramPoint; b: DiagramPoint; theme: InfraTheme; highlight: Highlight | null; faulty: boolean; touched: boolean; implied: boolean;
}) {
  const spec = edgeKindSpec(profile, edge.kind);
  let color = theme.edgeColors[edge.kind] ?? theme.defaultEdgeColor;
  let opacity = implied ? 0 : spec.faint ? 0.15 : 0.4;
  let width = 1.2;
  if (faulty) { color = theme.suspect; opacity = 0.85; width = 2; }
  if (touched) { opacity = 0.9; width = 1.8; }
  if (highlight) {
    if (highlight.down.edges.has(index)) { color = theme.needs; opacity = 0.95; width = 2.4; }
    else if (highlight.up.edges.has(index)) { color = theme.affects; opacity = 0.95; width = 2.4; }
    else opacity = implied ? 0 : 0.05;
  }
  if (!opacity) return null;
  const dashed = spec.line === 'dashed';
  return <path d={edgeCurve(a, b)} stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeDasharray={dashed ? '5 4' : undefined} strokeLinecap="round" />;
}

/** Vertical S-curve between rows, an arc above the nodes within a row. */
function edgeCurve(a: DiagramPoint, b: DiagramPoint): string {
  const dy = b.y - a.y;
  if (Math.abs(dy) > 20) {
    const my = a.y + dy / 2;
    return `M${a.x} ${a.y}C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
  }
  const lift = 14 + Math.abs(b.x - a.x) * 0.12;
  return `M${a.x} ${a.y}Q${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - lift} ${b.x} ${b.y}`;
}

type NodeState = 'normal' | 'down' | 'up' | 'self' | 'dim';

function nodeState(id: string, h: Highlight | null): NodeState {
  if (!h) return 'normal';
  const inDown = h.down.nodes.has(id);
  const inUp = h.up.nodes.has(id);
  if (inDown && inUp) return 'self';
  if (inDown) return 'down';
  if (inUp) return 'up';
  return 'dim';
}

function NodeGlyph({ node, profile, p, theme, selected, hovered, state, health, onHover, onSelect }: {
  node: InfraNode; profile: DomainProfile; p: DiagramPoint; theme: InfraTheme; selected: boolean; hovered: boolean; state: NodeState; health?: NodeStatus;
  onHover: (id: string | null) => void; onSelect: (id: string) => void;
}) {
  const color = theme.nodeColors[node.type] ?? theme.defaultNodeColor;
  const ring = state === 'down' ? theme.needs : state === 'up' ? theme.affects : null;
  const alarm = health === 'down' || health === 'suspect' ? theme[health] : null;
  const outline = selected ? '#ffffff' : hovered ? theme.labelText : 'none';
  const scale = selected ? 1.25 : hovered ? 1.1 : 1;
  const hitWidth = Math.max(2 * R + 8, shortenLabel(node.label).length * 6.3 + 8);
  return (
    <g
      transform={`translate(${p.x} ${p.y})`}
      opacity={state === 'dim' ? 0.18 : 1}
      role="button"
      tabIndex={0}
      aria-label={`${node.label}, ${node.type}${health && health !== 'unknown' ? `, ${health}` : ''}`}
      aria-pressed={selected}
      style={{ cursor: 'pointer', outline: 'none' }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node.id); }
      }}
    >
      <title>{node.label}</title>
      {/* Glyph and label form one target, which also helps on touch screens */}
      <rect x={-hitWidth / 2} y={-R - 4} width={hitWidth} height={2 * R + 24} fill="transparent" />
      {alarm && (
        <circle r={R + 6} fill="none" stroke={alarm} strokeWidth={2.5}>
          {health === 'down' && <animate attributeName="r" values={`${R + 4};${R + 9};${R + 4}`} dur="1.4s" repeatCount="indefinite" />}
        </circle>
      )}
      {ring && <circle r={R + 4} fill="none" stroke={ring} strokeWidth={2} />}
      <g transform={`scale(${scale})`}>
        <Shape shape={shapeOf(profile, node)} color={color} outline={outline} />
      </g>
      <text
        y={R + 14}
        textAnchor="middle"
        fontSize={11}
        fontWeight={selected || nodeTypeSpec(profile, node.type).emphasis ? 600 : 400}
        fill={theme.labelText}
        stroke={theme.background}
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {shortenLabel(node.label)}
      </text>
    </g>
  );
}

function Shape({ shape, color, outline }: { shape: NodeShape; color: string; outline: string }) {
  const stroke = { stroke: outline, strokeWidth: 2 };
  switch (shape) {
    case 'cylinder': return (
      <g>
        <path d="M-8 -6V6A8 3 0 0 0 8 6V-6" fill={color} {...stroke} />
        <ellipse cy={-6} rx={8} ry={3} fill={color} {...stroke} />
        <path d="M-8 -6A8 3 0 0 0 8 -6" fill="none" stroke="rgba(0,0,0,0.25)" />
      </g>
    );
    case 'wide': return <rect x={-13} y={-8} width={26} height={16} rx={3} fill={color} {...stroke} />;
    case 'hexagon': return <polygon points="-11,0 -5.5,-9.5 5.5,-9.5 11,0 5.5,9.5 -5.5,9.5" fill={color} {...stroke} />;
    case 'slab': return <rect x={-10} y={-6} width={20} height={12} rx={2} fill={color} {...stroke} />;
    case 'ring': return (
      <g>
        {outline !== 'none' && <circle r={10.5} fill="none" {...stroke} />}
        <circle r={7} fill="none" stroke={color} strokeWidth={4} />
      </g>
    );
    case 'diamond': return <polygon points="0,-10 10,0 0,10 -10,0" fill={color} {...stroke} />;
    default: return <rect x={-8} y={-8} width={16} height={16} rx={3} fill={color} {...stroke} />;
  }
}

/** Card each node sits in, for the hosts view. */
function cardIndex(layout: DiagramLayout) {
  const map = new Map<string, string>();
  if (layout.view !== 'hosts') return map;
  for (const [id, p] of layout.positions) {
    const c = layout.columns.find((c) => p.x >= c.x && p.x <= c.x + c.width);
    if (c) map.set(id, c.id);
  }
  return map;
}

function spread(points: Map<number, { x: number; y: number }>) {
  const [a, b] = [...points.values()];
  return Math.hypot(a.x - b.x, a.y - b.y) || 1;
}

function useSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Copy of the rendered diagram at its natural size, without pan and zoom. */
function standaloneSVG(el: SVGSVGElement, layout: DiagramLayout, theme: InfraTheme): string {
  const copy = el.cloneNode(true) as SVGSVGElement;
  const w = Math.ceil(layout.width), h = Math.ceil(layout.height);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(w));
  copy.setAttribute('height', String(h));
  copy.setAttribute('viewBox', `0 0 ${w} ${h}`);
  copy.setAttribute('style', `font-family:${theme.fontFamily}`);
  // A static picture has nothing to focus or press
  for (const el of [copy, ...copy.querySelectorAll('[tabindex], [role]')]) {
    for (const attr of ['tabindex', 'role', 'aria-label', 'aria-pressed']) el.removeAttribute(attr);
  }
  copy.querySelector(':scope > g')?.removeAttribute('transform');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', theme.background);
  copy.insertBefore(bg, copy.firstChild);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`;
}
