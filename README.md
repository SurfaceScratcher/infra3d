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

`infra3d-import-compose` builds a topology from Docker Compose files:
containers, networks, `depends_on`, endpoints from Traefik `Host()` rules and published
ports, and references between services. See [packages/import-compose](packages/import-compose).

```bash
npx infra3d-import-compose ./stacks -c infra3d.config.json -o topology.json
```

In this repository, `npm run import -- <root> -o apps/demo/src/data/local.json` makes the
demo show your own infrastructure instead of the example. `local.json` and
`infra3d.config.json` are gitignored.

## License

MIT
