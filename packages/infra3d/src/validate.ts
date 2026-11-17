import { BUILTIN_PROFILES, NODE_SHAPES } from './profile.js';
import { SCHEMA_VERSION, type Topology } from './types.js';

export interface ValidationResult {
  valid: boolean;
  /** Problems that break rendering or analysis. */
  errors: string[];
  /** Suspicious but harmless, e.g. a column that is not listed in `columns`. */
  warnings: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Checks a parsed topology, e.g. from a JSON file, and reports readable errors.
 * Mirrors topology.schema.json plus the cross-references a schema cannot express.
 */
export function validateTopology(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const done = () => ({ valid: errors.length === 0, errors, warnings });

  if (!isObject(input)) {
    errors.push('topology must be an object');
    return done();
  }
  if (input.schemaVersion !== undefined && input.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion ${JSON.stringify(input.schemaVersion)}, expected ${SCHEMA_VERSION}`);
  }
  for (const key of ['layers', 'nodes', 'edges'] as const) {
    if (!Array.isArray(input[key])) errors.push(`"${key}" must be an array`);
  }
  if (input.columns !== undefined && !(Array.isArray(input.columns) && input.columns.every(isString))) {
    errors.push('"columns" must be an array of strings');
  }
  if (errors.length) return done();
  const topo = input as unknown as Topology;
  checkProfile(input.profile, input.layers as unknown[], errors, warnings);

  const layerIds = new Set<string>();
  topo.layers.forEach((l, i) => {
    if (!isObject(l) || !isString(l.id) || typeof l.label !== 'string') errors.push(`layers[${i}]: needs string "id" and "label"`);
    else if (layerIds.has(l.id)) errors.push(`layers[${i}]: duplicate layer id "${l.id}"`);
    else layerIds.add(l.id);
  });

  const columns = topo.columns ? new Set(topo.columns) : null;
  const nodeIds = new Set<string>();
  topo.nodes.forEach((n, i) => {
    const at = `nodes[${i}]`;
    if (!isObject(n) || !isString(n.id)) {
      errors.push(`${at}: needs a string "id"`);
      return;
    }
    const name = `${at} "${n.id}"`;
    if (nodeIds.has(n.id)) errors.push(`${name}: duplicate node id`);
    nodeIds.add(n.id);
    if (typeof n.label !== 'string') errors.push(`${name}: needs a string "label"`);
    if (!isString(n.type)) errors.push(`${name}: needs a string "type"`);
    if (!isString(n.layer)) errors.push(`${name}: needs a string "layer"`);
    else if (!layerIds.has(n.layer)) errors.push(`${name}: unknown layer "${n.layer}"`);
    if (n.offset !== undefined && !(Array.isArray(n.offset) && n.offset.length === 2 && n.offset.every(Number.isFinite))) {
      errors.push(`${name}: "offset" must be [x, z]`);
    }
    if (n.meta !== undefined && !isObject(n.meta)) errors.push(`${name}: "meta" must be an object`);
    if (n.status !== undefined && !STATUSES.includes(n.status)) errors.push(`${name}: "status" must be one of ${STATUSES.join(', ')}`);
    if (columns && n.column !== undefined && !columns.has(n.column)) warnings.push(`${name}: column "${n.column}" is not listed in "columns"`);
  });

  topo.edges.forEach((e, i) => {
    const at = `edges[${i}]`;
    if (!isObject(e) || !isString(e.from) || !isString(e.to) || !isString(e.kind)) {
      errors.push(`${at}: needs string "from", "to" and "kind"`);
      return;
    }
    if (!nodeIds.has(e.from)) errors.push(`${at}: unknown node "${e.from}" in "from"`);
    if (!nodeIds.has(e.to)) errors.push(`${at}: unknown node "${e.to}" in "to"`);
    if (e.from === e.to) warnings.push(`${at}: edge from "${e.from}" to itself`);
  });

  return done();
}

const STATUSES = ['ok', 'down', 'suspect', 'unknown'];

/** `profile` is a built-in name or a whole profile; mirrors the profile part of the schema. */
function checkProfile(p: unknown, layers: unknown[], errors: string[], warnings: string[]) {
  if (p === undefined) return;
  if (typeof p === 'string') {
    if (!BUILTIN_PROFILES[p]) warnings.push(`profile "${p}" is not built in (${Object.keys(BUILTIN_PROFILES).join(', ')}); apps that do not know it fall back to "infra"`);
    return;
  }
  if (!isObject(p)) {
    errors.push('"profile" must be a name or a profile object');
    return;
  }
  for (const key of ['id', 'label', 'anchorLayer'] as const) if (!isString(p[key])) errors.push(`profile: needs a string "${key}"`);
  const layerIds = new Set(layers.map((l) => (isObject(l) ? l.id : undefined)));
  if (isString(p.anchorLayer) && !layerIds.has(p.anchorLayer)) warnings.push(`profile: anchorLayer "${p.anchorLayer}" is not a layer of this topology`);
  const shape = (v: unknown, at: string) => {
    if (v !== undefined && !NODE_SHAPES.includes(v as never)) errors.push(`${at}: unknown shape ${JSON.stringify(v)}, expected one of ${NODE_SHAPES.join(', ')}`);
  };
  const colour = (v: unknown, at: string) => {
    if (v !== undefined && !isString(v)) errors.push(`${at}: "color" must be a string`);
  };
  for (const [key, label] of [['nodeTypes', 'node type'], ['edgeKinds', 'edge kind']] as const) {
    if (!isObject(p[key])) {
      errors.push(`profile: "${key}" must be an object`);
      continue;
    }
    for (const [name, spec] of Object.entries(p[key] as Record<string, unknown>)) {
      const at = `profile ${label} "${name}"`;
      if (!isObject(spec)) {
        errors.push(`${at}: must be an object`);
        continue;
      }
      colour(spec.color, at);
      if (key === 'nodeTypes') shape(spec.shape, at);
      if (key === 'edgeKinds') {
        if (spec.line !== undefined && spec.line !== 'solid' && spec.line !== 'dashed') errors.push(`${at}: "line" must be "solid" or "dashed"`);
        if (spec.label !== undefined && !(Array.isArray(spec.label) && spec.label.length === 2 && spec.label.every((x) => typeof x === 'string'))) {
          errors.push(`${at}: "label" must be [outgoing, incoming]`);
        }
        if (spec.pull !== undefined && !Number.isFinite(spec.pull)) errors.push(`${at}: "pull" must be a number`);
      }
    }
  }
  if (p.roles !== undefined) {
    if (!isObject(p.roles)) errors.push('profile: "roles" must be an object');
    else for (const [name, spec] of Object.entries(p.roles)) shape(isObject(spec) ? spec.shape : spec, `profile role "${name}"`);
  }
  shape(p.defaultShape, 'profile defaultShape');
  if (p.anchorGroups !== undefined && p.anchorGroups !== 'rows' && p.anchorGroups !== 'columns') errors.push('profile: "anchorGroups" must be "rows" or "columns"');
}
