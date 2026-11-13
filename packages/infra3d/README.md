# infra3d

React component that shows IT infrastructure as stacked 3D layers
(hardware → networks → containers → endpoints) you can rotate, zoom and click through.

```bash
npm install infra3d three @react-three/fiber @react-three/drei
```

Requires React 19, `@react-three/fiber` 9 and `@react-three/drei` 10.

## `<InfraScene>`

```tsx
import { InfraScene, type Topology } from 'infra3d';

<div style={{ height: 600 }}>
  <InfraScene
    topology={topology}
    selectedId={selected}
    onSelect={setSelected}
    mode="both"
    hiddenLayers={['network']}
    status={health?.status}
    theme={{ background: '#11111b' }}
  />
</div>
```

The scene fills its parent, so give the parent a height.

| Prop | Type | |
| --- | --- | --- |
| `topology` | `Topology` | required; keep the object stable, a new object re-runs the layout |
| `selectedId` | `string \| null` | highlighted node; the camera flies to it |
| `onSelect` | `(id \| null) => void` | click on a node, or `null` on empty space |
| `mode` | `'deps' \| 'impact' \| 'both'` | which direction to highlight, default `both` |
| `hiddenLayers` | `string[]` | layer ids to hide |
| `showAllLabels` | `boolean` | label every container and endpoint, not only on hover |
| `status` | `Record<id, 'ok' \| 'down' \| 'suspect' \| 'unknown'>` | failed nodes pulse red, suspects are orange |
| `theme` | `Partial<InfraTheme>` | colours and font, merged into `DEFAULT_THEME` |
| `layout` | `LayoutOptions` | spacing and the anchor layer |

## Topology format

```json
{
  "schemaVersion": 1,
  "layers": [{ "id": "physical", "label": "Hardware" }, { "id": "container", "label": "Containers" }],
  "columns": ["web-01"],
  "nodes": [
    { "id": "h:web-01", "label": "web-01", "type": "host", "layer": "physical", "column": "web-01" },
    { "id": "c:shop", "label": "shop", "type": "container", "layer": "container", "column": "web-01", "group": "shop" }
  ],
  "edges": [{ "from": "c:shop", "to": "h:web-01", "kind": "runs-on" }]
}
```

- **Layers** are listed bottom to top.
- **Edges point from the dependent to its dependency** (endpoint → container → network → host → site).
  Both highlight directions follow from that; `backup` edges do not propagate a failure.
- Built-in node types (`site`, `device`, `host`, `network`, `container`, `endpoint`) and edge kinds
  (`routes`, `via`, `auth`, `member`, `runs-on`, `depends`, `uses`, `image`, `uplink`, `backup`) have
  their own shapes and colours. Any other string works and gets a default look.
- Optional node fields: `column` (layout column, usually the host), `group` (row within the
  column, usually the stack), `role` (`"database"` draws a cylinder), `check` (health check
  target), `offset` (`[x, z]` nudge), `meta` (shown by your UI).

The JSON schema ships as `infra3d/topology.schema.json`. `validateTopology()` also checks
cross-references the schema cannot express:

```ts
import { validateTopology } from 'infra3d/core';

const { valid, errors, warnings } = validateTopology(JSON.parse(text));
```

## Health analysis

Probe only your endpoints (HTTP or TCP, from wherever you like) and let the graph
narrow down the cause:

```ts
import { analyzeHealth, checkTarget } from 'infra3d/core';

const results = { 'e:shop.example.com': { ok: false, answered: true }, 'e:wiki.example.com': { ok: true } };
const { status, down, suspects, causes } = analyzeHealth(topology, results);
// causes[0] → { id: 'c:shop-db', count: 1 }
```

1. A reachable endpoint proves its whole structural chain runs.
2. Suspects of a failed endpoint are the nodes in its chain that nothing else cleared.
3. `answered: true` means the reverse proxy responded (even with 502 or 404), so the proxy
   and everything below it run.
4. Causes that explain the most failures rank first; on a tie the lower layer wins.

Only `routes`, `via`, `member`, `runs-on`, `depends` and `uplink` count as structural by default
(`structuralKinds` option). `checkTarget(node)` returns `node.check` or `meta.URL`.

Tip for Traefik: a 404 with the exact body `404 page not found` means no router matched,
which usually means the container is gone. Count it as a failure with `answered: true`.

## Other exports

`computeLayout`, `traverse`, `computeHighlight`, `neighbors`, `dependencyClosure`,
`DEFAULT_THEME`, `resolveTheme`, and the colour constants `NODE_COLORS`, `EDGE_COLORS`,
`STATUS_COLORS`, `DOWN_COLOR`, `UP_COLOR` for building legends. Everything except
`InfraScene` is also available from `infra3d/core` without React or three.js.

## License

MIT
