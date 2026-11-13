import { useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type RefObject, type Ref } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { CameraControls, Html, QuadraticBezierLine } from '@react-three/drei';
import { computeLayout, type LayoutOptions, type Vec3 } from './layout.js';
import { fitCamera, sceneBox, type CameraAngle, type CameraFit } from './camera.js';
import { computeHighlight, type Highlight } from './graph.js';
import type { Mesh } from 'three';
import { resolveTheme, type InfraTheme } from './theme.js';
import type { HighlightMode, InfraEdge, InfraNode, NodeStatus, NodeType, Topology } from './types.js';

export interface InfraSceneProps {
  topology: Topology;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  mode?: HighlightMode;
  hiddenLayers?: string[];
  /** Always show container and endpoint labels, not only on hover or selection. */
  showAllLabels?: boolean;
  /** Live state per node: failed nodes pulse red, suspects are marked orange. */
  status?: Record<string, NodeStatus>;
  /** Colours and fonts; anything left out falls back to DEFAULT_THEME. */
  theme?: Partial<InfraTheme>;
  /** Shortcut for `theme.background`. */
  background?: string;
  layout?: LayoutOptions;
  /** Viewing angle of the overview; the distance follows from the scene size and the viewport. */
  cameraAngle?: CameraAngle;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<InfraSceneHandle>;
}

export interface InfraSceneHandle {
  /** Moves the camera back to the overview that shows the whole scene. */
  fitAll(smooth?: boolean): void;
}

const FOV = 45;

export function InfraScene({
  topology,
  selectedId = null,
  onSelect,
  mode = 'both',
  hiddenLayers = [],
  showAllLabels = false,
  status,
  theme: themeOverrides,
  background,
  layout: layoutOpts,
  cameraAngle,
  className,
  style,
  ref,
}: InfraSceneProps) {
  const layout = useMemo(() => computeLayout(topology, layoutOpts), [topology, layoutOpts]);
  const highlight = useMemo(() => computeHighlight(topology, selectedId, mode), [topology, selectedId, mode]);
  const hidden = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);
  const nodeById = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n])), [topology]);
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useMemo(() => resolveTheme(background ? { ...themeOverrides, background } : themeOverrides), [themeOverrides, background]);

  const visible = (n: InfraNode | undefined) => !!n && !hidden.has(n.layer);
  const { bounds } = layout;

  // The overview depends on the scene size and the viewport's aspect ratio
  const container = useRef<HTMLDivElement>(null);
  const aspect = useAspect(container);
  const fit = useMemo(
    () => fitCamera(sceneBox(layout), { fov: FOV, aspect, angle: cameraAngle }),
    [layout, aspect, cameraAngle?.azimuth, cameraAngle?.polar],
  );
  const fitAll = useRef<(smooth: boolean) => void>(null);
  useImperativeHandle(ref, () => ({ fitAll: (smooth = true) => fitAll.current?.(smooth) }), []);

  return (
    <div ref={container} className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <Canvas camera={{ position: fit.position, fov: FOV, near: 0.5, far: Math.max(1000, fit.distance * 10) }} onPointerMissed={() => onSelect?.(null)}>
        <color attach="background" args={[theme.background]} />
        {/* Fog fades what lies behind the overview, so it scales with the fitted distance */}
        <fog attach="fog" args={[theme.background, fit.distance * 1.25, fit.distance * 2.7]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[40, 80, 40]} intensity={1.1} />

        <CameraRig selectedPos={selectedId ? layout.positions.get(selectedId) : undefined} fit={fit} fitAll={fitAll} />

        {topology.layers.map((l) =>
          hidden.has(l.id) ? null : (
            <LayerPlane key={l.id} theme={theme} label={l.label} y={layout.layerY.get(l.id)!} bounds={bounds} columns={l.id === 'container' ? layout.columns : []} />
          ),
        )}

        {topology.edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!visible(a) || !visible(b)) return null;
          const faulty = !!status && isFaulty(status[e.from]) && isFaulty(status[e.to]);
          return <EdgeLine key={i} theme={theme} edge={e} index={i} from={layout.positions.get(e.from)!} to={layout.positions.get(e.to)!} highlight={highlight} faulty={faulty} />;
        })}

        {topology.nodes.map((n) =>
          visible(n) ? (
            <NodeMesh
              key={n.id}
              node={n}
              theme={theme}
              position={layout.positions.get(n.id)!}
              selected={n.id === selectedId}
              hovered={n.id === hovered}
              state={nodeState(n.id, highlight)}
              health={status?.[n.id]}
              showLabel={
                showAllLabels ||
                n.id === hovered ||
                !['container', 'endpoint'].includes(n.type) ||
                isFaulty(status?.[n.id]) ||
                (!!highlight && nodeState(n.id, highlight) !== 'dim')
              }
              onHover={setHovered}
              onSelect={(id) => onSelect?.(id)}
            />
          ) : null,
        )}
      </Canvas>
    </div>
  );
}

type NodeState = 'normal' | 'down' | 'up' | 'self' | 'dim';

const isFaulty = (s?: NodeStatus) => s === 'down' || s === 'suspect';

function nodeState(id: string, h: Highlight | null): NodeState {
  if (!h) return 'normal';
  const inDown = h.down.nodes.has(id);
  const inUp = h.up.nodes.has(id);
  if (inDown && inUp) return 'self';
  if (inDown) return 'down';
  if (inUp) return 'up';
  return 'dim';
}

/** Width / height of an element, updated on resize. */
function useAspect(ref: RefObject<HTMLDivElement | null>) {
  const [aspect, setAspect] = useState(16 / 10);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth && el.clientHeight) setAspect(el.clientWidth / el.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return aspect;
}

function CameraRig({ selectedPos, fit, fitAll }: { selectedPos?: Vec3; fit: CameraFit; fitAll: RefObject<((smooth: boolean) => void) | null> }) {
  const ref = useRef<CameraControls>(null);
  // Once the user moves the camera, resizes and topology updates no longer reset the view
  const userMoved = useRef(false);
  const selected = !!selectedPos;

  fitAll.current = (smooth) => {
    userMoved.current = false;
    ref.current?.setLookAt(...fit.position, ...fit.target, smooth);
  };

  useEffect(() => {
    if (!userMoved.current && !selected) fitAll.current?.(false);
  }, [fit.distance, ...fit.target]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !selectedPos) return;
    const [x, y, z] = selectedPos;
    c.setLookAt(x + 18, y + 30, z + 55, x, y, z, true);
  }, [selectedPos?.[0], selectedPos?.[1], selectedPos?.[2]]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      maxDistance={fit.distance * 2.3}
      minDistance={5}
      dollySpeed={0.6}
      onControlStart={() => (userMoved.current = true)}
    />
  );
}

function LayerPlane({ theme, label, y, bounds, columns }: { theme: InfraTheme; label: string; y: number; bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; columns: { id: string; x: number; width: number; depth: number }[] }) {
  const pad = 6;
  const w = bounds.maxX - bounds.minX + pad * 2;
  const d = bounds.maxZ - bounds.minZ + pad * 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return (
    <group position={[0, y - 0.9, 0]}>
      <mesh position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={theme.plane} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <PlaneOutline color={theme.planeOutline} cx={cx} cz={cz} w={w} d={d} />
      <Html position={[bounds.minX - pad, 0, bounds.maxZ + pad]} style={{ pointerEvents: 'none' }}>
        <div style={{ ...layerLabelStyle, color: theme.layerLabel, fontFamily: theme.fontFamily }}>{label}</div>
      </Html>
      {columns.map((c) => (
        <group key={c.id}>
          <mesh position={[c.x, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[c.width + 3, c.depth + 3]} />
            <meshBasicMaterial color={theme.column} transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <Html position={[c.x, 0, -c.depth / 2 - 2.5]} center style={{ pointerEvents: 'none' }}>
            <div style={{ ...columnLabelStyle, color: theme.columnLabel, fontFamily: theme.fontFamily }}>{c.id}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function PlaneOutline({ color, cx, cz, w, d }: { color: string; cx: number; cz: number; w: number; d: number }) {
  const pts = useMemo(() => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    return new Float32Array([x0, 0, z0, x1, 0, z0, x1, 0, z0, x1, 0, z1, x1, 0, z1, x0, 0, z1, x0, 0, z1, x0, 0, z0]);
  }, [cx, cz, w, d]);
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pts, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.6} />
    </lineSegments>
  );
}

function EdgeLine({ theme, edge, index, from, to, highlight, faulty }: { theme: InfraTheme; edge: InfraEdge; index: number; from: Vec3; to: Vec3; highlight: Highlight | null; faulty: boolean }) {
  const sameLayer = Math.abs(from[1] - to[1]) < 0.01;
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + (sameLayer ? 1.5 + Math.hypot(to[0] - from[0], to[2] - from[2]) * 0.12 : 0), (from[2] + to[2]) / 2];

  let color = theme.edgeColors[edge.kind] ?? theme.defaultEdgeColor;
  let opacity = edge.kind === 'via' ? 0.12 : 0.35;
  let width = 1;
  if (faulty) { color = theme.suspect; opacity = 0.8; width = 2; }
  if (highlight) {
    if (highlight.down.edges.has(index)) { color = theme.needs; opacity = 0.95; width = 2.5; }
    else if (highlight.up.edges.has(index)) { color = theme.affects; opacity = 0.95; width = 2.5; }
    else { opacity = 0.04; }
  }
  return (
    <QuadraticBezierLine
      start={from}
      end={to}
      mid={mid}
      color={color}
      lineWidth={width}
      transparent
      opacity={opacity}
      dashed={edge.kind === 'backup' || edge.kind === 'image' || edge.kind === 'via'}
      dashSize={0.6}
      gapSize={0.4}
      depthWrite={false}
    />
  );
}

function NodeMesh({
  node, theme, position, selected, hovered, state, health, showLabel, onHover, onSelect,
}: {
  node: InfraNode; theme: InfraTheme; position: Vec3; selected: boolean; hovered: boolean; state: NodeState; health?: NodeStatus; showLabel: boolean;
  onHover: (id: string | null) => void; onSelect: (id: string) => void;
}) {
  const base = theme.nodeColors[node.type] ?? theme.defaultNodeColor;
  const dim = state === 'dim';
  const ring = state === 'down' ? theme.needs : state === 'up' ? theme.affects : null;
  const alarm = health === 'down' || health === 'suspect' ? theme[health] : null;
  const isDb = node.role === 'database';
  const scale = selected ? 1.35 : hovered ? 1.15 : 1;

  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { onHover(null); document.body.style.cursor = ''; },
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(node.id); },
  };

  return (
    <group position={position}>
      <mesh {...handlers} scale={scale} rotation={node.type === 'network' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
        <Shape type={node.type} isDb={isDb} />
        <meshStandardMaterial
          color={base}
          emissive={selected ? '#ffffff' : ring ?? base}
          emissiveIntensity={selected ? 0.35 : ring ? 0.45 : 0.12}
          transparent
          opacity={dim ? 0.13 : 1}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>
      {ring && !dim && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.75, 0]}>
          <ringGeometry args={[1.05, 1.35, 32]} />
          <meshBasicMaterial color={ring} transparent opacity={0.8} />
        </mesh>
      )}
      {alarm && <AlarmRing color={alarm} pulse={health === 'down'} />}
      {showLabel && (
        <Html position={[0, node.type === 'host' ? 1.6 : 1.2, 0]} center distanceFactor={32} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div style={{ ...nodeLabelStyle, color: theme.labelText, background: theme.labelBackground, fontFamily: theme.fontFamily, opacity: dim ? 0.25 : 1, borderColor: selected ? '#fff' : alarm ?? ring ?? 'transparent', fontWeight: node.type === 'host' || selected ? 600 : 400 }}>
            {node.label}
          </div>
        </Html>
      )}
    </group>
  );
}

function AlarmRing({ color, pulse }: { color: string; pulse: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !pulse) return;
    const s = 1 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4));
    ref.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
      <ringGeometry args={[1.5, 1.85, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

function Shape({ type, isDb }: { type: NodeType; isDb: boolean }) {
  switch (type) {
    case 'host': return <boxGeometry args={[3, 1.4, 3]} />;
    case 'site': return <cylinderGeometry args={[1.6, 1.6, 0.8, 6]} />;
    case 'device': return <boxGeometry args={[2, 1, 1.4]} />;
    case 'network': return <torusGeometry args={[0.85, 0.28, 12, 32]} />;
    case 'endpoint': return <octahedronGeometry args={[0.75]} />;
    case 'container': return isDb ? <cylinderGeometry args={[0.6, 0.6, 1.1, 20]} /> : <boxGeometry args={[1.1, 1.1, 1.1]} />;
    default: return isDb ? <cylinderGeometry args={[0.6, 0.6, 1.1, 20]} /> : <boxGeometry args={[1.2, 1.2, 1.2]} />;
  }
}

const nodeLabelStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid transparent',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
const layerLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
const columnLabelStyle: CSSProperties = { ...layerLabelStyle, fontSize: 12 };
