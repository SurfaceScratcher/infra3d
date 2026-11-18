import { Scene, type SceneHandle, type SceneProps } from 'stratoscope';
import { infraTopology } from './infra.js';
import type { Topology } from './types.js';

export interface InfraSceneProps extends Omit<SceneProps, 'topology'> {
  topology: Topology;
}
export type InfraSceneHandle = SceneHandle;

/** stratoscope's `<Scene>`, drawing topologies without a profile as infrastructure. */
export function InfraScene({ topology, ...props }: InfraSceneProps) {
  return <Scene {...props} topology={infraTopology(topology)} />;
}
