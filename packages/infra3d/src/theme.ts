export interface InfraTheme {
  background: string;
  /** Colour per node type; unknown types use `defaultNodeColor`. */
  nodeColors: Record<string, string>;
  defaultNodeColor: string;
  /** Colour per edge kind; unknown kinds use `defaultEdgeColor`. */
  edgeColors: Record<string, string>;
  defaultEdgeColor: string;
  /** Highlight of what the selected node needs. */
  needs: string;
  /** Highlight of what fails together with the selected node. */
  affects: string;
  down: string;
  suspect: string;
  plane: string;
  planeOutline: string;
  column: string;
  labelText: string;
  labelBackground: string;
  layerLabel: string;
  columnLabel: string;
  fontFamily: string;
}

// Pastel palette: soft pastels on an ink-violet night
export const DEFAULT_THEME: InfraTheme = {
  background: '#15151f',
  nodeColors: {
    site: '#a7a4bb',
    device: '#d6d3e4',
    host: '#f7bc94',
    network: '#97d7df',
    container: '#cbb6f3',
    endpoint: '#a3dcbc',
  },
  defaultNodeColor: '#e8e6f2',
  edgeColors: {
    routes: '#a3dcbc',
    via: '#a3dcbc',
    auth: '#f1d68d',
    member: '#97d7df',
    'runs-on': '#f7bc94',
    depends: '#cbb6f3',
    uses: '#f2b3d9',
    image: '#f2b3d9',
    uplink: '#a7a4bb',
    backup: '#f1d68d',
  },
  defaultEdgeColor: '#a7a4bb',
  needs: '#aab9f6',
  affects: '#f3a6b6',
  down: '#f0778f',
  suspect: '#f1d68d',
  plane: '#282839',
  planeOutline: '#4a4966',
  column: '#3b3a52',
  labelText: '#e8e6f2',
  labelBackground: 'rgba(21, 21, 31, 0.85)',
  layerLabel: '#a7a4bb',
  columnLabel: '#f7bc94',
  fontFamily: 'system-ui, sans-serif',
};

/** Merges a partial theme into the defaults; colour maps are merged key by key. */
export function resolveTheme(theme: Partial<InfraTheme> = {}): InfraTheme {
  return {
    ...DEFAULT_THEME,
    ...theme,
    nodeColors: { ...DEFAULT_THEME.nodeColors, ...theme.nodeColors },
    edgeColors: { ...DEFAULT_THEME.edgeColors, ...theme.edgeColors },
  };
}

// Kept for apps that build legends from the default colours
export const NODE_COLORS = DEFAULT_THEME.nodeColors;
export const EDGE_COLORS = DEFAULT_THEME.edgeColors;
export const DOWN_COLOR = DEFAULT_THEME.needs;
export const UP_COLOR = DEFAULT_THEME.affects;
export const STATUS_COLORS = { down: DEFAULT_THEME.down, suspect: DEFAULT_THEME.suspect };
