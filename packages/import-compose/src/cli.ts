#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateTopology } from 'infra3d/core';
import { buildTopology } from './build.js';
import { ansibleSource, isAnsibleRepo } from './sources/ansible.js';
import { directorySource } from './sources/directory.js';
import type { ImportConfig, Source } from './types.js';

const USAGE = `Usage: infra3d-import-compose <root> [options]

Builds an infra3d topology from Docker Compose files.

Options:
  -o, --out <file>       write the topology here (default: stdout)
  -c, --config <file>    hosts, sites and special cases (default: ./infra3d.config.json if present)
  -s, --source <name>    directory | ansible | auto (default: auto)
  -h, --help             show this help

Sources:
  directory   <root>/<host>/<stack>/compose.yaml
  ansible     inventory/host_vars/<host>/main.yml + stacks/<host>/<stack>/docker-compose.yml
`;

const SOURCES: Record<string, Source> = { directory: directorySource, ansible: ansibleSource };

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      config: { type: 'string', short: 'c' },
      source: { type: 'string', short: 's', default: 'auto' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || positionals.length !== 1) {
    process.stderr.write(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const root = path.resolve(positionals[0]);
  const configFile = values.config ?? (fs.existsSync('infra3d.config.json') ? 'infra3d.config.json' : undefined);
  const config: ImportConfig = configFile ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const sourceName = values.source === 'auto' ? (isAnsibleRepo(root) ? 'ansible' : 'directory') : values.source!;
  const source = SOURCES[sourceName];
  if (!source) throw new Error(`unknown source "${sourceName}", expected one of: ${Object.keys(SOURCES).join(', ')}`);

  const importWarnings: string[] = [];
  const topology = buildTopology(source(root, config), config, importWarnings);
  const { errors, warnings } = validateTopology(topology);
  for (const w of [...importWarnings, ...errors, ...warnings]) process.stderr.write(`warning: ${w}\n`);

  const json = JSON.stringify(topology, null, 2) + '\n';
  if (values.out && values.out !== '-') {
    fs.mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true });
    fs.writeFileSync(values.out, json);
  } else {
    process.stdout.write(json);
  }
  const count = (t: string) => topology.nodes.filter((n) => n.type === t).length;
  process.stderr.write(
    `${sourceName}: ${topology.nodes.length} nodes (${count('host')} hosts, ${count('network')} networks, ${count('container')} containers, ` +
      `${count('endpoint')} endpoints), ${topology.edges.length} edges${values.out && values.out !== '-' ? ` → ${values.out}` : ''}\n`,
  );
}

try {
  main();
} catch (e) {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
}
