import path from 'node:path';
import type { Source, StackInput } from '../types.js';
import { readCompose, subdirs } from './files.js';

/**
 * One directory per host, one subdirectory per stack:
 *
 *   <root>/<host>/<stack>/compose.yaml
 */
export const directorySource: Source = (root, config) => {
  const hostIds = config.hosts ? Object.keys(config.hosts) : subdirs(root);
  return {
    domain: config.domain,
    hosts: hostIds.map((id) => ({
      id,
      stacks: subdirs(path.join(root, id)).flatMap((name): StackInput[] => {
        const compose = readCompose(path.join(root, id, name));
        return compose ? [{ name, compose }] : [];
      }),
    })),
  };
};
