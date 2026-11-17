import { INFRA_PROFILE } from './infra-profile.js';
import type { EdgeKind, InfraNode, NodeStatus, Topology } from './types.js';

/**
 * Abstract node shapes. Every renderer (3D, SVG, draw.io) has its own drawing for each,
 * so a profile only names them.
 */
export type NodeShape =
  | 'box' // small cube / rounded square
  | 'wide' // flat, wide box, e.g. a host
  | 'slab' // smaller flat box, e.g. a device
  | 'hexagon'
  | 'ring' // e.g. a network
  | 'diamond' // e.g. an endpoint
  | 'cylinder'; // e.g. a database

export const NODE_SHAPES: readonly NodeShape[] = ['box', 'wide', 'slab', 'hexagon', 'ring', 'diamond', 'cylinder'];

export interface NodeTypeSpec {
  /** Human-readable name, e.g. "Container". */
  label?: string;
  /** Default: the profile's `defaultShape`. */
  shape?: NodeShape;
  /** Colour (CSS), used unless the theme sets one for this type. */
  color?: string;
  /** Bold label, for the nodes that structure a view (e.g. hosts). */
  emphasis?: boolean;
  /** 3D only: the label shows on hover, selection or trouble instead of always (for numerous nodes). */
  labelOnHover?: boolean;
}

export interface EdgeKindSpec {
  /** Wording in both directions: [outgoing, incoming], e.g. ["runs on", "hosts network"]. */
  label?: [string, string];
  /** Default 'solid'. */
  line?: 'solid' | 'dashed';
  /** Colour (CSS), used unless the theme sets one for this kind. */
  color?: string;
  /** Drawn fainter, for edges that are always there and would clutter the view. */
  faint?: boolean;
  /**
   * Whether a failure or blockage travels along this edge. Default true. With false, the target
   * is still reached but not followed further (a host keeps running when its backup target fails).
   */
  propagates?: boolean;
  /** The source actually needs the target to work, so a working source proves the target works (health analysis). */
  structural?: boolean;
  /** Leads to a front (e.g. a reverse proxy) that answers even if the source behind it fails. */
  proxy?: boolean;
  /** 3D layout: how strongly the edge pulls a node towards its neighbour (0 = not at all, default). */
  pull?: number;
  /** Hosts view: not drawn between nodes of the same card, because the card already shows it. */
  impliedByColumn?: boolean;
}

/**
 * Everything domain-specific about a topology: node types, edge kinds, how failures travel and
 * how things look. Plain JSON-compatible data, so a profile can be stored, shared and validated
 * like a topology, or ship inside one (`topology.profile`). Colours in the profile fill in what the
 * theme does not set.
 */
export interface DomainProfile {
  id: string;
  label: string;
  /** Layer whose nodes are placed on a grid per column and group; all other layers follow from it. */
  anchorLayer: string;
  /**
   * 3D: the groups of the anchor layer one behind the other (`rows`, default) or side by side
   * (`columns`). Use `columns` when every group has its own node in the layer above (a workflow
   * over its steps), so those nodes line up across instead of hiding behind each other.
   */
  anchorGroups?: 'rows' | 'columns';
  nodeTypes: Record<string, NodeTypeSpec>;
  /** Shape overrides by `node.role`, e.g. `database` → cylinder. They win over the node type. */
  roles?: Record<string, { shape: NodeShape }>;
  edgeKinds: Record<string, EdgeKindSpec>;
  /** Shape of unknown node types. Default 'box'. */
  defaultShape?: NodeShape;
}

const NO_TYPE: NodeTypeSpec = {};
const NO_KIND: EdgeKindSpec = {};

export const nodeTypeSpec = (p: DomainProfile, type: string): NodeTypeSpec => p.nodeTypes[type] ?? NO_TYPE;
export const edgeKindSpec = (p: DomainProfile, kind: EdgeKind): EdgeKindSpec => p.edgeKinds[kind] ?? NO_KIND;

export function shapeOf(p: DomainProfile, node: InfraNode): NodeShape {
  return (node.role ? p.roles?.[node.role]?.shape : undefined) ?? p.nodeTypes[node.type]?.shape ?? p.defaultShape ?? 'box';
}

export const propagates = (p: DomainProfile, kind: EdgeKind) => edgeKindSpec(p, kind).propagates !== false;

const kindsWhere = (p: DomainProfile, test: (s: EdgeKindSpec) => boolean | undefined): EdgeKind[] =>
  Object.entries(p.edgeKinds).filter(([, s]) => test(s)).map(([k]) => k);

/** Edge kinds a working node actually needs (see `EdgeKindSpec.structural`). */
export const structuralKinds = (p: DomainProfile) => kindsWhere(p, (s) => s.structural);
/** Edge kinds that lead to a proxy (see `EdgeKindSpec.proxy`). */
export const proxyKinds = (p: DomainProfile) => kindsWhere(p, (s) => s.proxy);

/** "routes to" / "reachable via"; the kind itself if the profile has no wording. */
export const edgeLabel = (p: DomainProfile, kind: EdgeKind, dir: 'out' | 'in') => edgeKindSpec(p, kind).label?.[dir === 'out' ? 0 : 1] ?? kind;
export const typeLabel = (p: DomainProfile, type: string) => nodeTypeSpec(p, type).label ?? type;

/** Profiles a topology can name in `profile`. */
export const BUILTIN_PROFILES: Record<string, DomainProfile> = { [INFRA_PROFILE.id]: INFRA_PROFILE };

/**
 * The profile of a topology: the one it carries, the built-in one it names, or INFRA_PROFILE.
 * `known` adds profiles an app can resolve by name.
 */
export function resolveProfile(topo: Pick<Topology, 'profile'>, known: Record<string, DomainProfile> = {}): DomainProfile {
  const p = topo.profile;
  if (p && typeof p === 'object') return p;
  return (p && (known[p] ?? BUILTIN_PROFILES[p])) || INFRA_PROFILE;
}

/** Colours the profile defines for its node types and edge kinds. */
export function profileColors(p: DomainProfile): { nodeColors: Record<string, string>; edgeColors: Record<string, string> } {
  const pick = (specs: Record<string, { color?: string }>) =>
    Object.fromEntries(Object.entries(specs).flatMap(([k, s]) => (s.color ? [[k, s.color]] : [])));
  return { nodeColors: pick(p.nodeTypes), edgeColors: pick(p.edgeKinds) };
}

/** The `status` the source reported per node, or `undefined` if no node has one. */
export function reportedStatus(topo: Topology): Record<string, NodeStatus> | undefined {
  if (!topo.nodes.some((n) => n.status)) return undefined;
  return Object.fromEntries(topo.nodes.map((n) => [n.id, n.status ?? 'unknown']));
}
