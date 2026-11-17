#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_THEME, toDrawio, toSvg, validateTopology, type DiagramView } from 'infra3d/core';
import { buildTopology, statusOf } from './build.js';
import { detectSource, SOURCES } from './sources/index.js';
import type { CiSnapshot } from './types.js';

const USAGE = `Usage: infra3d-import-ci [options]

Reads CI pipelines with their workflows (Drone: stages) and steps and writes a layered topology.

Connection, from the environment the CI's own CLI uses:
  Woodpecker   WOODPECKER_SERVER and WOODPECKER_TOKEN
  Drone        DRONE_SERVER and DRONE_TOKEN
The token is a personal access token from your user profile in the CI's web UI.

Options:
  -s, --source <name>       woodpecker | drone (default: from the environment)
  -r, --repo <owner/name>   repository to read; repeat for more (default: all active ones)
  -n, --pipelines <n>       latest pipelines per repository (default: 1)
  -b, --branch <name>       only this branch; "*" for any (default: the repository's default branch)
  -f, --format <format>     json | svg | drawio | snapshot (default: json)
      --view <view>         hosts | layers, for svg (default: hosts)
      --dark                dark colours, for svg
      --from <file>         build from a snapshot written with --format snapshot instead of the API
  -o, --out <file>          write here (default: stdout)
  -h, --help                show this help
`;

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', short: 's' },
      repo: { type: 'string', short: 'r', multiple: true },
      pipelines: { type: 'string', short: 'n', default: '1' },
      branch: { type: 'string', short: 'b' },
      format: { type: 'string', short: 'f', default: 'json' },
      view: { type: 'string', default: 'hosts' },
      dark: { type: 'boolean' },
      from: { type: 'string' },
      out: { type: 'string', short: 'o' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return void process.stdout.write(USAGE);
  const format = values.format!;
  if (!['json', 'svg', 'drawio', 'snapshot'].includes(format)) fail(`unknown format "${format}"`);
  const view = values.view as DiagramView;
  if (view !== 'layers' && view !== 'hosts') fail(`unknown view "${values.view}"`);

  let snapshot: CiSnapshot;
  if (values.from) {
    snapshot = JSON.parse(fs.readFileSync(values.from, 'utf8'));
    if (!Array.isArray(snapshot.repos)) fail(`${values.from} is not a snapshot`);
  } else {
    const detected = detectSource(process.env);
    const source = values.source ? SOURCES[values.source] : detected?.source;
    if (!source) fail(values.source ? `unknown source "${values.source}"` : 'set WOODPECKER_SERVER and WOODPECKER_TOKEN, or DRONE_SERVER and DRONE_TOKEN, or use --from');
    const prefix = source!.name.toUpperCase();
    const server = process.env[`${prefix}_SERVER`], token = process.env[`${prefix}_TOKEN`];
    if (!server || !token) fail(`set ${prefix}_SERVER and ${prefix}_TOKEN`);
    const pipelines = Number(values.pipelines);
    if (!Number.isInteger(pipelines) || pipelines < 1) fail('--pipelines must be a positive number');
    snapshot = await source!.fetchSnapshot({
      server: server!,
      token: token!,
      repos: values.repo,
      pipelines,
      branch: values.branch === '*' ? null : values.branch,
    });
  }

  let output: string;
  if (format === 'snapshot') {
    output = JSON.stringify(snapshot, null, 2) + '\n';
  } else {
    const topology = buildTopology(snapshot);
    const { errors } = validateTopology(topology);
    if (errors.length) fail(`invalid topology:\n  ${errors.join('\n  ')}`);
    const status = statusOf(topology);
    // The topology carries its profile and status, so the exports need no options for them
    if (format === 'svg') output = toSvg(topology, { view, theme: values.dark ? DEFAULT_THEME : undefined });
    else if (format === 'drawio') output = toDrawio(topology, { pageNames: { hosts: 'Repositories' } });
    else output = JSON.stringify(topology, null, 2) + '\n';
    const down = Object.values(status).filter((s) => s === 'down').length;
    process.stderr.write(`${topology.columns?.length ?? 0} repositories with pipelines, ${topology.nodes.length} nodes, ${topology.edges.length} edges, ${down} failed\n`);
  }
  if (values.out) fs.writeFileSync(values.out, output);
  else process.stdout.write(output);
}

function fail(message: string): never {
  process.stderr.write(`infra3d-import-ci: ${message}\n`);
  process.exit(1);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
