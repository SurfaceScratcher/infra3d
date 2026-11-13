import fs from 'node:fs';
import { validateTopology, type Topology } from 'infra3d/core';
import { ansibleSource, buildTopology, directorySource, isAnsibleRepo, type ImportConfig } from 'infra3d-import-compose';
import { config } from './config.js';

export interface TopologySource {
  kind: 'file' | 'import';
  path: string;
  /** Why no topology could be loaded, or problems the validation found. */
  error: string | null;
  loadedAt: string | null;
}

/** Reads the topology file, or imports the compose stacks. Throws with a readable message. */
function read(): Topology {
  if (config.topologyFile) return JSON.parse(fs.readFileSync(config.topologyFile, 'utf8')) as Topology;

  if (!fs.existsSync(config.stacksDir)) throw new Error(`${config.stacksDir} does not exist; mount your compose stacks there`);
  const hasConfig = fs.existsSync(config.importConfig) && fs.statSync(config.importConfig).isFile();
  const importConfig: ImportConfig = hasConfig ? JSON.parse(fs.readFileSync(config.importConfig, 'utf8')) : {};
  const kind = config.source === 'auto' ? (isAnsibleRepo(config.stacksDir) ? 'ansible' : 'directory') : config.source;
  const source = kind === 'ansible' ? ansibleSource : kind === 'directory' ? directorySource : null;
  if (!source) throw new Error(`unknown INFRA3D_SOURCE "${config.source}", expected auto, directory or ansible`);
  const topology = buildTopology(source(config.stacksDir, importConfig), importConfig);
  if (!topology.nodes.some((n) => n.type === 'container')) throw new Error(`no compose files found below ${config.stacksDir}`);
  return topology;
}

let current: Topology | null = null;
let currentJson = '';
export const source: TopologySource = {
  kind: config.topologyFile ? 'file' : 'import',
  path: config.topologyFile ?? config.stacksDir,
  error: null,
  loadedAt: null,
};

/** Re-reads the topology; returns true if it changed. A failed read keeps the last good topology. */
export function reload(): boolean {
  try {
    const next = read();
    const { valid, errors } = validateTopology(next);
    if (!valid) throw new Error(`invalid topology: ${errors.slice(0, 3).join('; ')}`);
    source.error = null;
    const json = JSON.stringify(next);
    if (json === currentJson) return false;
    current = next;
    currentJson = json;
    source.loadedAt = new Date().toISOString();
    return true;
  } catch (e) {
    source.error = (e as Error).message;
    return false;
  }
}

export const topology = () => current;
