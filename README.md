# infra3d

React-Komponente, die IT-Infrastruktur als gestapelte 3D-Ebenen darstellt
(Hardware → Netzwerke → Container → Endpunkte). Ein Klick auf einen Knoten zeigt,
was er **braucht** (blau) und was bei seinem Ausfall **mit betroffen** ist (rot).

```bash
npm install
npm run dev                   # zeigt die Beispiel-Topologie (src/data/example.json)
```

Eigene Daten: `infra3d.config.example.json` nach `infra3d.config.json` kopieren,
anpassen und den Importer laufen lassen. Liegt `src/data/local.json` vor, zeigt die
Demo diese statt des Beispiels. Beide Dateien sind gitignored.

```bash
cp infra3d.config.example.json infra3d.config.json
npm run import:server-stack   # ../server-stack → src/data/local.json
```

## Einbinden

Alles Wiederverwendbare liegt in `src/infra3d/` (Abhängigkeiten: `three`,
`@react-three/fiber`, `@react-three/drei`). `src/App.tsx` ist nur die Demo.

```tsx
import { InfraScene, type Topology } from './infra3d';

<InfraScene
  topology={topology}
  selectedId={selected}
  onSelect={setSelected}
  mode="both"                 // 'deps' | 'impact' | 'both'
  hiddenLayers={['network']}
/>
```

## Datenmodell

```ts
{ layers: [{ id, label }], columns?: string[],
  nodes:  [{ id, label, type, layer, column?, group?, offset?, meta? }],
  edges:  [{ from, to, kind, label? }] }
```

Kanten zeigen immer vom Abhängigen zur Abhängigkeit (Endpunkt → Container →
Netz → Host → Standort). Daraus ergeben sich beide Richtungen der Hervorhebung.
`backup`-Kanten pflanzen einen Ausfall nicht weiter fort.

Layout: Knoten der Ankerebene (`container`) liegen im Raster — Spalte = `column`
(Host), Zeile = `group` (Stack). Alle anderen Knoten landen im Schwerpunkt ihrer
Nachbarn, dadurch stehen Netze und Endpunkte über bzw. unter „ihren“ Containern.

## Importer

`scripts/import-server-stack.mjs` liest `inventory/host_vars/*/main.yml` und
`stacks/<host>/<stack>/docker-compose.yml` und leitet ab:

- Container, Docker-Netze, `depends_on`
- Endpunkte aus Traefik-`Host()`-Regeln und veröffentlichten Ports
- Querverweise: Images aus `git.<domain>`, Dienst-URLs in `environment`
- Backups (`nas_backup_enabled`) und NAS-Mounts (`nas_mounts`)

Was sich nicht aus den Dateien ableiten lässt, steht in `infra3d.config.json`:
Hosts mit Hardware und Uplink, zusätzliche Knoten und Kanten (Standorte, Router,
NAS), Backup-/NAS-Ziel, Sonderfälle für Netze (`networkOverrides`), Adressen in
Env-Werten, die auf Geräte zeigen (`addressLinks`), und Auth-Middlewares.
Env-Werte und Vault-Inhalte werden nicht übernommen.
