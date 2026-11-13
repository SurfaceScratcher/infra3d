# Contributing

Thanks for helping! Bug reports, importers for new data sources, layout improvements and
docs are all welcome. For larger changes, please open an issue or start a
[discussion](https://github.com/SurfaceScratcher/infra3d/discussions) first so we can agree on
the approach. Questions and ideas belong in Discussions, bugs in issues.

## Setup

Requires Node 22 or newer.

```bash
npm install
npm run dev          # demo at http://localhost:5173 with live reload of the library source
npm run dev -w @infra3d/app   # live app: server on :8080 plus Vite, see apps/app/README.md
npm test             # vitest in all packages
npm run typecheck
npm run build
```

To try your own infrastructure in the demo without committing it:

```bash
npm run import -- ../my-stacks -o apps/app/web/src/data/local.json
```

To reproduce an importer bug from an issue, replay the attached report:

```bash
npm run import -- report.json -o apps/app/web/src/data/local.json
```

`local.json` and `infra3d.config.json` are gitignored. Please never commit real hostnames,
addresses or configs, including in test fixtures and screenshots. Use `example.com` and
private address ranges.

After visible UI changes, `npm run record-demo` re-records `docs/demo.gif` from the live demo
(needs Chromium and ffmpeg, see the comment at the top of `scripts/record-demo.mjs`).

## Repository layout

```
packages/infra3d/          the library, published as `infra3d`
  src/types.ts             topology format
  src/validate.ts          validateTopology(), mirrors topology.schema.json
  src/graph.ts             dependency / impact traversal for highlighting
  src/layout.ts            3D positions: anchor grid + centroid placement + overlap push
  src/health.ts            analyzeHealth(): root cause from endpoint checks
  src/theme.ts             colours and DEFAULT_THEME
  src/InfraScene.tsx       the react-three-fiber scene
  src/core.ts              entry `infra3d/core`: everything except the scene, no React or three
  test/                    vitest suites with a small fixture topology
packages/import-compose/   CLI `infra3d-import-compose`
  src/build.ts             buildTopology(): compose files → topology
  src/sources/             readers for on-disk layouts (directory, ansible)
apps/app/                  the self-hosted app (Docker image) and the demo on GitHub Pages
  server/src/              Node server: import, endpoint checks, notifications, /api/state
  web/src/                 UI; `--mode demo` builds the static demo instead of the live app
```

## Concepts

**Edges point from the dependent to its dependency.** An endpoint routes to a container,
the container is a member of a network, the network runs on a host. "What does X need"
follows edges forward, "what fails with X" follows them backward. `backup` edges do not
propagate further.

**Layout.** Nodes on the anchor layer (`container` by default) sit on a grid: one column per
`column` (host), one row per `group` (stack). Every other node is placed at the weighted
centroid of its already placed neighbours, then overlapping nodes on the same layer are
pushed apart. Keep it deterministic: the same topology must always produce the same picture.

**Health analysis.** Only endpoints are probed. A reachable endpoint clears its whole
structural chain; suspects of a failed endpoint are the nodes in its chain nobody cleared.
Loose couplings (`uses`, `image`, `auth`, `backup`) are deliberately not structural.
`health.test.ts` documents the expected behaviour scenario by scenario.

**Importer sources** only find hosts and parse compose files. Everything that turns compose
into nodes and edges lives in `buildTopology()`, so a new source (Kubernetes, Portainer,
Proxmox, NetBox …) is usually one small file in `src/sources/` plus fixtures.

## Pull requests

- AI-assisted contributions are welcome; most of infra3d itself was written with an AI agent.
  You are responsible for what you submit: understand it, test it, and be ready to explain it
  in the review.
- Keep PRs focused; one topic per PR.
- Add or update tests for behaviour changes.
- Run `npx changeset` if a published package or the app (`@infra3d/app`) changes and describe
  the change in one line. Below 1.0, breaking changes are a `minor` bump. The app's version is
  the Docker image tag; releases of `infra3d` or `infra3d-import-compose` bump it as well.
- Code, comments and docs are in English. Match the style of the surrounding code.
- Changes to the topology format need an update to `types.ts`, `topology.schema.json`,
  `validate.ts` and the README together.
