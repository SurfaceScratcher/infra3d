import fs from 'node:fs';
import path from 'node:path';
import type { HostInput, Source, StackInput } from '../types.js';
import { readCompose, readYaml, subdirs } from './files.js';

interface HostVars {
  stacks?: string[];
  nas_backup_enabled?: boolean;
  nas_mounts?: { dest: string }[];
}

/**
 * Ansible repository that deploys compose stacks per host:
 *
 *   inventory/group_vars/all/main.yml   domain
 *   inventory/host_vars/<host>/main.yml stacks (deployed stacks), nas_backup_enabled, nas_mounts
 *   stacks/<host>/<stack>/docker-compose.yml
 *
 * Only stacks listed in the host vars are imported; other directories are not deployed.
 */
export const ansibleSource: Source = (root, config) => {
  const groupVars = path.join(root, 'inventory/group_vars/all/main.yml');
  const domain = config.domain ?? (fs.existsSync(groupVars) ? readYaml<{ domain?: string }>(groupVars)?.domain : undefined);
  const hostIds = config.hosts ? Object.keys(config.hosts) : subdirs(path.join(root, 'inventory/host_vars'));

  const hosts = hostIds.map((id): HostInput => {
    const varsFile = path.join(root, 'inventory/host_vars', id, 'main.yml');
    const vars = fs.existsSync(varsFile) ? readYaml<HostVars>(varsFile) ?? {} : {};
    const stacks = (vars.stacks ?? subdirs(path.join(root, 'stacks', id))).flatMap((name): StackInput[] => {
      const compose = readCompose(path.join(root, 'stacks', id, name));
      return compose ? [{ name, compose }] : [];
    });
    return { id, stacks, backup: !!vars.nas_backup_enabled, mounts: (vars.nas_mounts ?? []).map((m) => m.dest) };
  });
  return { domain, hosts };
};

/** Looks like an Ansible repository with an inventory. */
export const isAnsibleRepo = (root: string) => fs.existsSync(path.join(root, 'inventory/host_vars'));
