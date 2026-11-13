# infra3d

[![CI](https://github.com/SurfaceScratcher/infra3d/actions/workflows/ci.yml/badge.svg)](https://github.com/SurfaceScratcher/infra3d/actions/workflows/ci.yml)

See how your infrastructure hangs together. infra3d is a React component that shows hosts,
networks, containers and endpoints as stacked 3D layers you can rotate, zoom and click through.

- **Dependencies and impact:** select a node to highlight what it **needs** (blue) and what
  **fails with it** (red).
- **Root-cause hints:** feed in endpoint health checks and `analyzeHealth()` narrows a failure
  down to the containers, networks or hosts that can explain it.
- **Bring your own data:** a documented JSON format, or `infra3d-import-compose` to build it
  from Docker Compose files.

**[Live demo](https://surfacescratcher.github.io/infra3d/)** · [Library docs](packages/infra3d) · [Importer](packages/import-compose) · [Contributing](CONTRIBUTING.md)

## Quick start

```bash
npm install infra3d three @react-three/fiber @react-three/drei
```

```tsx
import { useState } from 'react';
import { InfraScene } from 'infra3d';
import topology from './topology.json';

export function Infra() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ height: 600 }}>
      <InfraScene topology={topology} selectedId={selected} onSelect={setSelected} />
    </div>
  );
}
```

Generate `topology.json` from your compose stacks:

```bash
npx infra3d-import-compose ./stacks -o topology.json
```

## Packages

| Package | |
| --- | --- |
| [`infra3d`](packages/infra3d) | The scene component, plus `infra3d/core` with the data model, validation, layout and health analysis (no React needed) |
| [`infra3d-import-compose`](packages/import-compose) | CLI and API that build a topology from Docker Compose files, plain directories or an Ansible inventory |
| [`apps/demo`](apps/demo) | The live demo |

## Development

```bash
npm install
npm run dev     # demo with the example topology
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture and how to add an importer.

## License

[MIT](LICENSE)
