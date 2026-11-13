import path from 'node:path';
import type { ImportConfig, ImportInput, Source, StackInput } from '../types.js';
import { readCompose, subdirs } from './files.js';

/**
 * Compose files in plain directories. The layout is detected:
 *
 *   <root>/compose.yaml                   one host, one stack (a single compose file)
 *   <root>/<stack>/compose.yaml           one host, one folder per stack (Dockge, Komodo, by hand)
 *   <root>/<host>/<stack>/compose.yaml    one folder per host
 *
 * Single-host layouts name the host after `config.host` (default `host`).
 */
export const directorySource: Source = (root, config) => {
  const single = (stacks: StackInput[]): ImportInput => ({ domain: config.domain, hosts: [{ id: singleHost(config), stacks }] });

  const file = readCompose(root);
  if (file) return single([{ name: file.name ?? path.basename(root), compose: file }]);

  const stacks = stacksIn(root);
  if (stacks.length) return single(stacks);

  const hostIds = config.hosts ? Object.keys(config.hosts) : subdirs(root);
  return { domain: config.domain, hosts: hostIds.map((id) => ({ id, stacks: stacksIn(path.join(root, id)) })) };
};

const singleHost = (config: ImportConfig) => config.host ?? (config.hosts ? Object.keys(config.hosts)[0] : undefined) ?? 'host';

function stacksIn(dir: string): StackInput[] {
  return subdirs(dir).flatMap((name): StackInput[] => {
    const compose = readCompose(path.join(dir, name));
    return compose ? [{ name, compose }] : [];
  });
}
