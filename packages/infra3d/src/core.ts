// Framework-free part of infra3d: data model, validation, graph traversal, layout and
// health analysis. Safe to import in Node or a web worker without React or three.js.
export { SCHEMA_VERSION } from './types.js';
export type * from './types.js';
export { validateTopology } from './validate.js';
export type { ValidationResult } from './validate.js';
export { computeLayout } from './layout.js';
export type { LayoutOptions, Layout, Vec3 } from './layout.js';
export { fitCamera, sceneBox, DEFAULT_CAMERA_ANGLE } from './camera.js';
export type { CameraAngle, CameraFit, FitOptions, Box } from './camera.js';
export { traverse, computeHighlight, neighbors } from './graph.js';
export type { Reach, Highlight } from './graph.js';
export { analyzeHealth, dependencyClosure, checkTarget, STRUCTURAL_KINDS } from './health.js';
export type { CheckResult, HealthOptions, HealthAnalysis, Cause } from './health.js';
export { DEFAULT_THEME, resolveTheme, NODE_COLORS, EDGE_COLORS, DOWN_COLOR, UP_COLOR, STATUS_COLORS } from './theme.js';
export type { InfraTheme } from './theme.js';
