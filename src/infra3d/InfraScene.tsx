import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { CameraControls, Html, QuadraticBezierLine } from '@react-three/drei';
import { computeLayout, type LayoutOptions, type Vec3 } from './layout';
import { computeHighlight, type Highlight } from './graph';
import type { Mesh } from 'three';
import type { EdgeKind, HighlightMode, InfraEdge, InfraNode, NodeStatus, NodeType, Topology } from './types';

export interface InfraSceneProps {
  topology: Topology;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  mode?: HighlightMode;
  hiddenLayers?: string[];
  /** Container-/Endpunkt-Beschriftungen immer zeigen, nicht nur bei Hover/Auswahl. */
  showAllLabels?: boolean;
  /** Live-Zustand je Knoten: gestörte Knoten pulsieren rot, verdächtige sind orange markiert. */
  status?: Record<string, NodeStatus>;
  background?: string;
  layout?: LayoutOptions;
  className?: string;
  style?: CSSProperties;
}

export const NODE_COLORS: Record<NodeType, string> = {
  site: '#94a3b8',
  device: '#cbd5e1',
  host: '#f59e0b',
  network: '#22d3ee',
  container: '#a78bfa',
  endpoint: '#34d399',
};

export const EDGE_COLORS: Record<EdgeKind, string> = {
  routes: '#34d399',
  via: '#34d399',
  auth: '#facc15',
  member: '#22d3ee',
  'runs-on': '#f59e0b',
  depends: '#a78bfa',
  uses: '#f472b6',
  image: '#f472b6',
  uplink: '#94a3b8',
  backup: '#fbbf24',
};

export const DOWN_COLOR = '#60a5fa';
export const UP_COLOR = '#f87171';
export const STATUS_COLORS: Record<'down' | 'suspect', string> = { down: '#ef4444', suspect: '#f59e0b' };

export function InfraScene({
  topology,
  selectedId = null,
  onSelect,
  mode = 'both',
  hiddenLayers = [],
  showAllLabels = false,
  status,
  background = '#0b1020',
  layout: layoutOpts,
  className,
  style,
}: InfraSceneProps) {
  const layout = useMemo(() => computeLayout(topology, layoutOpts), [topology, layoutOpts]);
  const highlight = useMemo(() => computeHighlight(topology, selectedId, mode), [topology, selectedId, mode]);
  const hidden = useMemo(() => new Set(hiddenLayers), [hiddenLayers]);
  const nodeById = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n])), [topology]);
  const [hovered, setHovered] = useState<string | null>(null);

  const visible = (n: InfraNode | undefined) => !!n && !hidden.has(n.layer);
  const { bounds } = layout;
  const center: Vec3 = [(bounds.minX + bounds.maxX) / 2, ((topology.layers.length - 1) * (layoutOpts?.layerGap ?? 10)) / 2, (bounds.minZ + bounds.maxZ) / 2];
  // Kameraabstand, Nebel und Zoomgrenze mit der Breite der Szene wachsen lassen,
  // damit bei vielen Spalten alles im Bild und sichtbar bleibt.
  const zoom = Math.max(1, (bounds.maxX - bounds.minX) / 110);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <Canvas camera={{ position: [center[0] + 10, center[1] + 45 * zoom, center[2] + 85 * zoom], fov: 45, near: 0.5, far: 1000 * zoom }} onPointerMissed={() => onSelect?.(null)}>
        <color attach="background" args={[background]} />
        <fog attach="fog" args={[background, 120 * zoom, 260 * zoom]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[40, 80, 40]} intensity={1.1} />

        <CameraRig selectedPos={selectedId ? layout.positions.get(selectedId) : undefined} center={center} zoom={zoom} />

        {topology.layers.map((l) =>
          hidden.has(l.id) ? null : (
            <LayerPlane key={l.id} label={l.label} y={layout.layerY.get(l.id)!} bounds={bounds} columns={l.id === 'container' ? layout.columns : []} />
          ),
        )}

        {topology.edges.map((e, i) => {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!visible(a) || !visible(b)) return null;
          const faulty = !!status && isFaulty(status[e.from]) && isFaulty(status[e.to]);
          return <EdgeLine key={i} edge={e} index={i} from={layout.positions.get(e.from)!} to={layout.positions.get(e.to)!} highlight={highlight} faulty={faulty} />;
        })}

        {topology.nodes.map((n) =>
          visible(n) ? (
            <NodeMesh
              key={n.id}
              node={n}
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

function CameraRig({ selectedPos, center, zoom = 1 }: { selectedPos?: Vec3; center: Vec3; zoom?: number }) {
  const ref = useRef<CameraControls>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (selectedPos) {
      const [x, y, z] = selectedPos;
      c.setLookAt(x + 18, y + 30, z + 55, x, y, z, true);
    }
  }, [selectedPos?.[0], selectedPos?.[1], selectedPos?.[2]]);
  useEffect(() => {
    ref.current?.setTarget(center[0], center[1], center[2], false);
  }, []);
  return <CameraControls ref={ref} makeDefault maxDistance={220 * zoom} minDistance={5} dollySpeed={0.6} />;
}

function LayerPlane({ label, y, bounds, columns }: { label: string; y: number; bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; columns: { id: string; x: number; width: number; depth: number }[] }) {
  const pad = 6;
  const w = bounds.maxX - bounds.minX + pad * 2;
  const d = bounds.maxZ - bounds.minZ + pad * 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return (
    <group position={[0, y - 0.9, 0]}>
      <mesh position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <PlaneOutline cx={cx} cz={cz} w={w} d={d} />
      <Html position={[bounds.minX - pad, 0, bounds.maxZ + pad]} style={{ pointerEvents: 'none' }}>
        <div style={layerLabelStyle}>{label}</div>
      </Html>
      {columns.map((c) => (
        <group key={c.id}>
          <mesh position={[c.x, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[c.width + 3, c.depth + 3]} />
            <meshBasicMaterial color="#334155" transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <Html position={[c.x, 0, -c.depth / 2 - 2.5]} center style={{ pointerEvents: 'none' }}>
            <div style={columnLabelStyle}>{c.id}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function PlaneOutline({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  const pts = useMemo(() => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    return new Float32Array([x0, 0, z0, x1, 0, z0, x1, 0, z0, x1, 0, z1, x1, 0, z1, x0, 0, z1, x0, 0, z1, x0, 0, z0]);
  }, [cx, cz, w, d]);
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pts, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#475569" transparent opacity={0.6} />
    </lineSegments>
  );
}

function EdgeLine({ edge, index, from, to, highlight, faulty }: { edge: InfraEdge; index: number; from: Vec3; to: Vec3; highlight: Highlight | null; faulty: boolean }) {
  const sameLayer = Math.abs(from[1] - to[1]) < 0.01;
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + (sameLayer ? 1.5 + Math.hypot(to[0] - from[0], to[2] - from[2]) * 0.12 : 0), (from[2] + to[2]) / 2];

  let color = EDGE_COLORS[edge.kind];
  let opacity = edge.kind === 'via' ? 0.12 : 0.35;
  let width = 1;
  if (faulty) { color = STATUS_COLORS.suspect; opacity = 0.8; width = 2; }
  if (highlight) {
    if (highlight.down.edges.has(index)) { color = DOWN_COLOR; opacity = 0.95; width = 2.5; }
    else if (highlight.up.edges.has(index)) { color = UP_COLOR; opacity = 0.95; width = 2.5; }
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
  node, position, selected, hovered, state, health, showLabel, onHover, onSelect,
}: {
  node: InfraNode; position: Vec3; selected: boolean; hovered: boolean; state: NodeState; health?: NodeStatus; showLabel: boolean;
  onHover: (id: string | null) => void; onSelect: (id: string) => void;
}) {
  const base = NODE_COLORS[node.type];
  const dim = state === 'dim';
  const ring = state === 'down' ? DOWN_COLOR : state === 'up' ? UP_COLOR : null;
  const alarm = health === 'down' || health === 'suspect' ? STATUS_COLORS[health] : null;
  const isDb = node.meta?.Rolle === 'Datenhaltung';
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
          <div style={{ ...nodeLabelStyle, opacity: dim ? 0.25 : 1, borderColor: selected ? '#fff' : alarm ?? ring ?? 'transparent', fontWeight: node.type === 'host' || selected ? 600 : 400 }}>
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
  }
}

const nodeLabelStyle: CSSProperties = {
  font: '12px/1.2 system-ui, sans-serif',
  color: '#e2e8f0',
  background: 'rgba(15, 23, 42, 0.82)',
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid transparent',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
const layerLabelStyle: CSSProperties = {
  font: '600 13px/1 system-ui, sans-serif',
  color: '#94a3b8',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
const columnLabelStyle: CSSProperties = { ...layerLabelStyle, color: '#f59e0b', fontSize: 12 };
