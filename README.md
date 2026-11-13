# infra3d

A React component that shows IT infrastructure as stacked 3D layers
(hardware → networks → containers → endpoints) you can rotate, zoom and click through.
Selecting a node highlights what it **needs** (blue) and what is **affected** when it fails (red).

```bash
npm install
npm run dev        # demo with the example topology (apps/demo/src/data/example.json)
```

## Repository layout

| Path | What |
| --- | --- |
| `packages/infra3d` | The library (`infra3d` on npm): `<InfraScene>`, layout, graph helpers |
| `packages/import-compose` | Importer that builds a topology from Docker Compose files |
| `apps/demo` | Demo app, also published as the live demo |

## Usage

```bash
npm install infra3d three @react-three/fiber @react-three/drei
```

```tsx
import { InfraScene, type Topology } from 'infra3d';

<InfraScene
  topology={topology}
  selectedId={selected}
  onSelect={setSelected}
  mode="both"                 // 'deps' | 'impact' | 'both'
  hiddenLayers={['network']}
/>
```

The scene fills its parent, so give the parent a height.
Requires React 19, `@react-three/fiber` 9 and `@react-three/drei` 10.

`infra3d/core` contains the framework-free part (types, layout, graph traversal)
and can be used in Node without React or three.js.

## Data model

```ts
{ layers: [{ id, label }], columns?: string[],
  nodes:  [{ id, label, type, layer, column?, group?, role?, offset?, meta? }],
  edges:  [{ from, to, kind, label? }] }
```

Edges always point from the dependent to its dependency
(endpoint → container → network → host → site). Both highlight directions follow from that.
`backup` edges do not propagate a failure further.

Layout: nodes of the anchor layer (`container`) sit on a grid, column = `column` (host),
row = `group` (stack). All other nodes are placed at the centroid of their neighbours,
so networks and endpoints end up above or below "their" containers.

## Your own data

Copy `packages/import-compose/infra3d.config.example.json` to `infra3d.config.json`
in the repository root, adjust it and run the importer. If `apps/demo/src/data/local.json`
exists, the demo shows it instead of the example. Both files are gitignored.

```bash
npm run import:server-stack   # ../server-stack → apps/demo/src/data/local.json
```

## License

MIT
