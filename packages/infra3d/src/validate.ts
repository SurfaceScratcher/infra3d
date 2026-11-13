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
