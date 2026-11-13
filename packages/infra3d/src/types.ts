export type NodeType = 'site' | 'device' | 'host' | 'network' | 'container' | 'endpoint';

/**
 * Edges always point from the dependent to its dependency:
 * "endpoint routes to container", "container is member of network", "network runs on host".
 */
export type EdgeKind =
  | 'routes' // endpoint -> container
  | 'via' // endpoint -> reverse proxy
  | 'auth' // endpoint -> login service
  | 'member' // container/host -> network
  | 'runs-on' // network -> host
  | 'depends' // Container -> Container
  | 'uses' // container -> other service
  | 'image' // container -> image registry
  | 'uplink' // host/site -> upstream connection
  | 'backup'; // host -> backup target (if it fails, the host keeps running)

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

export interface Topology {
  name?: string;
  layers: InfraLayer[];
  columns?: string[];
  nodes: InfraNode[];
  edges: InfraEdge[];
}

export type HighlightMode = 'deps' | 'impact' | 'both';

/** Live state of a node, e.g. derived from health checks. */
export type NodeStatus = 'ok' | 'down' | 'suspect' | 'unknown';
