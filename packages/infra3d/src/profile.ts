import type { EdgeKind, InfraNode } from './types.js';

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

export interface NodeTypeSpec {
  /** Human-readable name, e.g. "Container". */
  label?: string;
  /** Default: the profile's `defaultShape`. */
  shape?: NodeShape;
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
 * like a topology. Colours stay in the theme (keyed by node type and edge kind).
 */
export interface DomainProfile {
  id: string;
  label: string;
  /** Layer whose nodes are placed on a grid per column and group; all other layers follow from it. */
  anchorLayer: string;
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
