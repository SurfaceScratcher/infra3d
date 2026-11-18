import { Diagram, type DiagramHandle, type DiagramProps } from 'stratoscope/diagram';
import { coreView, infraTopology, type DiagramView } from './infra.js';
import type { Topology } from './types.js';

export interface InfraDiagramProps extends Omit<DiagramProps, 'topology' | 'view'> {
  topology: Topology;
  /** `layers`: one band per layer, aligned with the 3D view. `hosts` (or `columns`): one card per host with its stacks. */
  view?: DiagramView;
}
export type InfraDiagramHandle = DiagramHandle;

/** stratoscope's `<Diagram>`, drawing topologies without a profile as infrastructure. */
export function InfraDiagram({ topology, view, ...props }: InfraDiagramProps) {
  return <Diagram {...props} view={coreView(view)} topology={infraTopology(topology)} />;
}
