// Framework-free part of stratoscope-infra: stratoscope's core with infrastructure as the default domain.
// Safe to import in Node or a web worker without React or three.js.
export {
  fitCamera, sceneBox, DEFAULT_CAMERA_ANGLE,
  neighbors,
  shapeOf, nodeTypeSpec, edgeKindSpec, propagates, structuralKinds, proxyKinds, edgeLabel, typeLabel, anchorLayerOf, profileColors, reportedStatus, DEFAULT_PROFILE, NODE_SHAPES,
  checkTarget,
  shortenLabel, DIAGRAM_NODE_RADIUS, DIAGRAM_LABEL_CHARS,
} from 'stratoscope/core';
export type {
  GraphNode, GraphEdge, GraphLayer,
  ValidationResult, ValidateOptions,
  LayoutOptions, Layout, Vec3,
  CameraAngle, CameraFit, FitOptions, Box,
  Reach, Highlight,
  DomainProfile, NodeTypeSpec, EdgeKindSpec, NodeShape,
  CheckResult, HealthOptions, HealthAnalysis, Cause,
  Theme, Theme as InfraTheme,
  DiagramLayoutOptions, DiagramLayout, DiagramBox, DiagramPoint,
} from 'stratoscope/core';
export * from './types.js';
export { INFRA_PROFILE } from './infra-profile.js';
export {
  BUILTIN_PROFILES, resolveProfile, infraTopology, coreView,
  validateTopology, traverse, computeHighlight, computeLayout, computeDiagramLayout, analyzeHealth, dependencyClosure, STRUCTURAL_KINDS,
  toDrawio, toSvg,
  DEFAULT_THEME, DRAWIO_THEME, resolveTheme, NODE_COLORS, EDGE_COLORS, DOWN_COLOR, UP_COLOR, STATUS_COLORS,
} from './infra.js';
export type { DiagramView, InfraDiagramLayoutOptions, DrawioOptions, SvgOptions } from './infra.js';
