import type { GraphEdge, GraphLayer, GraphNode, Topology as GraphTopology } from 'stratoscope/core';

export type { HighlightMode, NodeStatus } from 'stratoscope/core';
export { SCHEMA_VERSION } from 'stratoscope/core';

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

/** A layer, bottom to top: physical, network, container, endpoint. */
export type InfraLayer = GraphLayer;

/**
 * A stratoscope node with the infrastructure types for editor completion. `column` is typically
 * the host, `group` the compose stack; the role `database` is drawn as a cylinder.
 */
export interface InfraNode extends GraphNode {
  type: NodeType;
}

export interface InfraEdge extends GraphEdge {
  kind: EdgeKind;
}

/**
 * A stratoscope topology. Without `profile` (or with `"profile": "infra"`) stratoscope-infra uses
 * INFRA_PROFILE; a topology can still carry any other profile.
 */
export interface Topology extends GraphTopology {
  layers: InfraLayer[];
  nodes: InfraNode[];
  edges: InfraEdge[];
}
