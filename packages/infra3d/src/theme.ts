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

export const DEFAULT_THEME: InfraTheme = {
  background: '#0b1020',
  nodeColors: {
    site: '#94a3b8',
    device: '#cbd5e1',
    host: '#f59e0b',
    network: '#22d3ee',
    container: '#a78bfa',
    endpoint: '#34d399',
  },
  defaultNodeColor: '#e2e8f0',
  edgeColors: {
    routes: '#34d399',
    via: '#34d399',
    auth: '#facc15',
    member: '#22d3ee',
    'runs-on': '#f59e0b',
    depends: '#a78bfa',
    uses: '#f472b6',
    image: '#f472b6',
    uplink: '#94a3b8',
    backup: '#fbbf24',
  },
  defaultEdgeColor: '#94a3b8',
  needs: '#60a5fa',
  affects: '#f87171',
  down: '#ef4444',
  suspect: '#f59e0b',
  plane: '#1e293b',
  planeOutline: '#475569',
  column: '#334155',
  labelText: '#e2e8f0',
  labelBackground: 'rgba(15, 23, 42, 0.82)',
  layerLabel: '#94a3b8',
  columnLabel: '#f59e0b',
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
