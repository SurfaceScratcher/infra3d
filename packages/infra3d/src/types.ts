/** Node types with a built-in shape and colour. Any other string works too and is drawn as a box. */
export type BuiltinNodeType = 'site' | 'device' | 'host' | 'network' | 'container' | 'endpoint';
// `string & {}` keeps editor completion for the built-in names
export type NodeType = BuiltinNodeType | (string & {});

/**
 * Edges always point from the dependent to its dependency:
 * "endpoint routes to container", "container is member of network", "network runs on host".
 */
export type BuiltinEdgeKind =
  | 'routes' // endpoint -> container
  | 'via' // endpoint -> reverse proxy
  | 'auth' // endpoint -> login service
  | 'member' // container/host -> network
  | 'runs-on' // network -> host
  | 'depends' // container -> container
  | 'uses' // container -> other service
  | 'image' // container -> image registry
  | 'uplink' // host/site -> upstream connection
  | 'backup'; // host -> backup target (if it fails, the host keeps running)
export type EdgeKind = BuiltinEdgeKind | (string & {});

export interface InfraLayer {
  id: string;
  label: string;
}

export interface InfraNode {
  id: string;
  label: string;
  type: NodeType;
  layer: string;
  /** Layout column, typically the host. */
  column?: string;
  /** Group within the column, typically the compose stack. */
  group?: string;
  /** Free-form role; 'database' is drawn as a cylinder. */
  role?: string;
  /** Health check target, e.g. `https://app.example.com` or `tcp://10.0.0.5:22`. */
  check?: string;
  /** Offset [x, z] relative to the computed position. */
  offset?: [number, number];
  meta?: Record<string, string | number>;
}

export interface InfraEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

/** Version of the topology format described by topology.schema.json. */
export const SCHEMA_VERSION = 1;

export interface Topology {
  $schema?: string;
  schemaVersion?: typeof SCHEMA_VERSION;
  name?: string;
  layers: InfraLayer[];
  columns?: string[];
  nodes: InfraNode[];
  edges: InfraEdge[];
}

export type HighlightMode = 'deps' | 'impact' | 'both';

/** Live state of a node, e.g. derived from health checks. */
export type NodeStatus = 'ok' | 'down' | 'suspect' | 'unknown';
