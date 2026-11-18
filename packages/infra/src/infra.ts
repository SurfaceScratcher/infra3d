/**
 * stratoscope-infra is stratoscope with infrastructure as the default domain. Every function here hands
 * over to stratoscope, with INFRA_PROFILE where a topology names no other profile, the hosts view
 * as an alias of the columns view, and the infrastructure colours in the default themes.
 */
import * as core from 'stratoscope/core';
import type { CheckResult, Highlight, HighlightMode, Reach, DiagramLayout, DiagramLayoutOptions, DomainProfile, EdgeKind, HealthAnalysis, HealthOptions, Layout, LayoutOptions, Theme, ValidateOptions, ValidationResult } from 'stratoscope/core';
import { INFRA_PROFILE } from './infra-profile.js';
import type { Topology } from './types.js';

/** Profiles a topology can name in `profile`. */
export const BUILTIN_PROFILES: Record<string, DomainProfile> = { [INFRA_PROFILE.id]: INFRA_PROFILE };

/** The profile of a topology: the one it carries, the one it names (`known` or built in), else INFRA_PROFILE. */
export function resolveProfile(topo: Pick<Topology, 'profile'>, known: Record<string, DomainProfile> = {}, fallback: DomainProfile = INFRA_PROFILE): DomainProfile {
  return core.resolveProfile(topo, { ...BUILTIN_PROFILES, ...known }, fallback);
}

const withProfile = new WeakMap<object, object>();

/**
 * The topology with its profile resolved to an object, so stratoscope draws it as infrastructure
 * unless it says otherwise. The same input always gives the same object, so components that
 * memoise on the topology do not lay it out again.
 */
export function infraTopology<T extends Pick<Topology, 'profile'>>(topo: T): T {
  if (typeof topo.profile === 'object' && topo.profile) return topo;
  let resolved = withProfile.get(topo) as T | undefined;
  if (!resolved) withProfile.set(topo, (resolved = { ...topo, profile: resolveProfile(topo) }));
  return resolved;
}

/** `layers`, `columns`, or `hosts`: the columns view under its infrastructure name. */
export type DiagramView = core.DiagramView | 'hosts';

export function coreView(view: DiagramView): core.DiagramView;
export function coreView(view: DiagramView | undefined): core.DiagramView | undefined;
export function coreView(view: DiagramView | undefined) {
  return view === 'hosts' ? 'columns' : view;
}

export function validateTopology(input: unknown, opts: ValidateOptions = {}): ValidationResult {
  return core.validateTopology(input, { ...opts, profiles: { ...BUILTIN_PROFILES, ...opts.profiles } });
}

export function traverse(topo: Topology, start: string, dir: 'down' | 'up', profile?: DomainProfile): Reach {
  return core.traverse(infraTopology(topo), start, dir, profile);
}

export function computeHighlight(topo: Topology, selected: string | null | undefined, mode: HighlightMode, profile?: DomainProfile): Highlight | null {
  return core.computeHighlight(infraTopology(topo), selected, mode, profile);
}

export function computeLayout(topo: Topology, opts?: LayoutOptions): Layout {
  return core.computeLayout(infraTopology(topo), opts);
}

export interface InfraDiagramLayoutOptions extends Omit<DiagramLayoutOptions, 'view'> {
  view?: DiagramView;
}

/** The 2D layout; `view: 'hosts'` gives the columns view and reports it as `hosts`. */
export function computeDiagramLayout(topo: Topology, opts: InfraDiagramLayoutOptions = {}): Omit<DiagramLayout, 'view'> & { view: DiagramView } {
  const layout = core.computeDiagramLayout(infraTopology(topo), { ...opts, view: coreView(opts.view) });
  return opts.view === 'hosts' ? { ...layout, view: 'hosts' } : layout;
}

export function analyzeHealth(topo: Topology, results: Record<string, CheckResult | undefined>, opts?: HealthOptions): HealthAnalysis {
  return core.analyzeHealth(infraTopology(topo), results, opts);
}

/** Structural edge kinds of INFRA_PROFILE. */
export const STRUCTURAL_KINDS: EdgeKind[] = core.structuralKinds(INFRA_PROFILE);

/** Everything `start` structurally depends on, itself included. Default kinds: those of the topology's profile. */
export function dependencyClosure(topo: Topology, start: string, kinds?: EdgeKind[]): Set<string> {
  return core.dependencyClosure(infraTopology(topo), start, kinds);
}

export interface DrawioOptions extends Omit<core.DrawioOptions, 'views' | 'pageNames'> {
  /** Default `layers` and `hosts`. */
  views?: DiagramView[];
  /** Page names; default `Layers` and `Hosts`. */
  pageNames?: Partial<Record<DiagramView, string>>;
}

export function toDrawio(topo: Topology, opts: DrawioOptions = {}): string {
  const { views = ['layers', 'hosts'], pageNames = {}, ...rest } = opts;
  const names: Partial<Record<core.DiagramView, string>> = { columns: 'Hosts' };
  for (const [view, name] of Object.entries(pageNames)) if (name) names[coreView(view as DiagramView)] = name;
  return core.toDrawio(infraTopology(topo), { ...rest, views: views.map((v) => coreView(v)), pageNames: names });
}

export interface SvgOptions extends Omit<core.SvgOptions, 'view'> {
  view?: DiagramView;
}

export function toSvg(topo: Topology, opts: SvgOptions = {}): string {
  return core.toSvg(infraTopology(topo), { ...opts, view: coreView(opts.view) });
}

// Themes with the infrastructure colours filled in, for apps that build legends from them
const colors = core.profileColors(INFRA_PROFILE);

/** Dark default theme with the colours of INFRA_PROFILE. */
export const DEFAULT_THEME: Theme = core.resolveTheme({}, INFRA_PROFILE);
/** Light theme of the draw.io and SVG exports with the colours of INFRA_PROFILE. */
export const DRAWIO_THEME: Theme = core.resolveTheme({}, INFRA_PROFILE, core.DRAWIO_THEME);

/** Merges a partial theme into `base` (default: stratoscope-infra's DEFAULT_THEME), with the profile's colours in between. */
export function resolveTheme(theme: Partial<Theme> = {}, profile?: DomainProfile, base: Theme = DEFAULT_THEME): Theme {
  return core.resolveTheme(theme, profile, base);
}

export const NODE_COLORS = colors.nodeColors;
export const EDGE_COLORS = colors.edgeColors;
export const DOWN_COLOR = DEFAULT_THEME.needs;
export const UP_COLOR = DEFAULT_THEME.affects;
export const STATUS_COLORS = { down: DEFAULT_THEME.down, suspect: DEFAULT_THEME.suspect };
