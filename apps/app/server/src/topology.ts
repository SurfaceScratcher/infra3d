import fs from 'node:fs';
import { validateTopology, type Topology } from 'infra3d/core';
import { ansibleSource, buildTopology, createImportReport, directorySource, isAnsibleRepo, type ImportConfig, type ImportReport } from 'infra3d-import-compose';
import { config } from './config.js';

export interface TopologySource {
  kind: 'file' | 'import';
  path: string;
  /** Why no topology could be loaded, or problems the validation found. */
  error: string | null;
  /** Import problems that did not stop it, e.g. a `checks` key matching no service. */
  warnings: string[];
  loadedAt: string | null;
}

/** Reads the topology file, or imports the compose stacks. Throws with a readable message. */
function read(): Topology {
  if (config.topologyFile) return JSON.parse(fs.readFileSync(config.topologyFile, 'utf8')) as Topology;

  if (!fs.existsSync(config.stacksDir)) throw new Error(`${config.stacksDir} does not exist; mount your compose stacks there`);
  const hasConfig = fs.existsSync(config.importConfig) && fs.statSync(config.importConfig).isFile();
  const importConfig: ImportConfig = hasConfig ? JSON.parse(fs.readFileSync(config.importConfig, 'utf8')) : {};
  if (config.host) importConfig.host = config.host;
  const kind = config.source === 'auto' ? (isAnsibleRepo(config.stacksDir) ? 'ansible' : 'directory') : config.source;
  const importSource = kind === 'ansible' ? ansibleSource : kind === 'directory' ? directorySource : null;
  if (!importSource) throw new Error(`unknown INFRA3D_SOURCE "${config.source}", expected auto, directory or ansible`);
  const input = importSource(config.stacksDir, importConfig);
  // A single host is the Docker host this container runs on
  if (input.hosts.length === 1 && !importConfig.defaultAddress) importConfig.defaultAddress = config.hostAddress;
  const warnings: string[] = [];
  const topology = buildTopology(input, importConfig, warnings);
  source.warnings = warnings;
  lastImport = () => createImportReport(input, importConfig, warnings);
  if (!topology.nodes.some((n) => n.type === 'container')) throw new Error(`no compose files found below ${config.stacksDir}`);
  return topology;
}

let current: Topology | null = null;
let lastImport: (() => ImportReport) | null = null;
let currentJson = '';
export const source: TopologySource = {
  kind: config.topologyFile ? 'file' : 'import',
  path: config.topologyFile ?? config.stacksDir,
  error: null,
  warnings: [],
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

/** The last import, anonymized for bug reports; null when the topology comes from a file. */
export const importReport = () => lastImport?.() ?? null;
