#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateTopology } from 'infra3d/core';
import { buildTopology } from './build.js';
import { createImportReport, isImportReport } from './report.js';
import { ansibleSource, isAnsibleRepo } from './sources/ansible.js';
import { directorySource } from './sources/directory.js';
import type { ImportConfig, ImportInput, Source } from './types.js';

const USAGE = `Usage: infra3d-import-compose <root> [options]
       infra3d-import-compose <report.json> [options]

Builds an infra3d topology from Docker Compose files, or replays an import report.

Options:
  -o, --out <file>       write the topology here (default: stdout)
  -c, --config <file>    hosts, sites and special cases (default: ./infra3d.config.json if present)
  -s, --source <name>    directory | ansible | auto (default: auto)
  -r, --report <file>    also write an anonymized import report for bug reports
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
      report: { type: 'string', short: 'r' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || positionals.length !== 1) {
    process.stderr.write(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const root = path.resolve(positionals[0]);
  let config: ImportConfig;
  let input: ImportInput;
  let sourceName: string;
  const replay = root.endsWith('.json') && fs.statSync(root).isFile() ? JSON.parse(fs.readFileSync(root, 'utf8')) : null;
  if (replay) {
    if (!isImportReport(replay)) throw new Error(`${positionals[0]} is not an infra3d import report`);
    ({ input, config } = replay);
    sourceName = 'report';
  } else {
    const configFile = values.config ?? (fs.existsSync('infra3d.config.json') ? 'infra3d.config.json' : undefined);
    config = configFile ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
    sourceName = values.source === 'auto' ? (isAnsibleRepo(root) ? 'ansible' : 'directory') : values.source!;
    const source = SOURCES[sourceName];
    if (!source) throw new Error(`unknown source "${sourceName}", expected one of: ${Object.keys(SOURCES).join(', ')}`);
    input = source(root, config);
  }

  const importWarnings: string[] = [];
  const topology = buildTopology(input, config, importWarnings);
  if (values.report) {
    fs.writeFileSync(values.report, JSON.stringify(createImportReport(input, config, importWarnings), null, 2) + '\n');
    process.stderr.write(`anonymized import report → ${values.report} (please read it before sharing)\n`);
  }
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
