import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ComposeFile } from '../types.js';

export const COMPOSE_FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];

export const readYaml = <T>(file: string): T => YAML.parse(fs.readFileSync(file, 'utf8')) as T;

/** The compose file in a stack directory, or null if it has none. */
export function readCompose(dir: string): ComposeFile | null {
  const file = COMPOSE_FILES.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  return file ? readYaml<ComposeFile>(file) ?? {} : null;
}

export const subdirs = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name).sort() : [];
