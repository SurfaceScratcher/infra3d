export type NodeType = 'site' | 'device' | 'host' | 'network' | 'container' | 'endpoint';

/**
 * Kanten zeigen immer vom Abhängigen zur Abhängigkeit:
 * "Endpunkt routet auf Container", "Container ist Mitglied im Netz", "Netz läuft auf Host".
 */
export type EdgeKind =
  | 'routes' // Endpunkt -> Container
  | 'via' // Endpunkt -> Reverse Proxy
  | 'auth' // Endpunkt -> Login-Dienst
  | 'member' // Container/Host -> Netz
  | 'runs-on' // Netz -> Host
  | 'depends' // Container -> Container
  | 'uses' // Container -> fremder Dienst
  | 'image' // Container -> Registry
  | 'uplink' // Host/Standort -> übergeordnete Anbindung
  | 'backup'; // Host -> Backup-Ziel (fällt es aus, läuft der Host weiter)

export interface InfraLayer {
  id: string;
  label: string;
}

export interface InfraNode {
  id: string;
  label: string;
  type: NodeType;
  layer: string;
  /** Spalte im Layout, typischerweise der Host. */
  column?: string;
  /** Gruppe innerhalb der Spalte, typischerweise der Stack. */
  group?: string;
  /** Verschiebung [x, z] relativ zur berechneten Position. */
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
