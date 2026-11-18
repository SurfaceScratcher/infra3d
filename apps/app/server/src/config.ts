// All settings come from environment variables, so the container needs no config file of its own.
import fs from 'node:fs';

const env = process.env;
/** `STRATOSCOPE_<name>`, or the name from before the rename (`INFRA3D_<name>`), which still works. */
const setting = (name: string) => env[`STRATOSCOPE_${name}`] || env[`INFRA3D_${name}`] || undefined;
/** The first file that exists, else the first: the config file may still carry its old name. */
const firstExisting = (...files: string[]) => files.find((f) => fs.existsSync(f)) ?? files[0];
const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

export const config = {
  port: num(env.PORT, 8080),
  /** Ready-made topology JSON. When set, no import runs. */
  topologyFile: setting('TOPOLOGY') || null,
  /** Root of the compose stacks (or the Ansible repository) to import. */
  stacksDir: setting('STACKS') || '/stacks',
  /** directory | ansible | auto */
  source: setting('SOURCE') || 'auto',
  /** Hosts, sites and special cases for the importer; optional. */
  importConfig: setting('CONFIG') || firstExisting('/config/stratoscope.config.json', '/config/infra3d.config.json'),
  /** Name of the host in single-host layouts (stack folders directly below STRATOSCOPE_STACKS). */
  host: setting('HOST') || null,
  /**
   * Where TCP checks of a single host's published ports go. From inside the container the Docker host is
   * reachable as host.docker.internal (with `extra_hosts: host.docker.internal:host-gateway`).
   */
  hostAddress: setting('HOST_ADDRESS') || 'host.docker.internal',
  /** Seconds between check runs; the topology is re-read in the same rhythm. */
  intervalSec: num(setting('INTERVAL'), 60),
  /** Consecutive failures before an endpoint counts as down. */
  confirmFails: num(setting('CONFIRM_FAILS'), 2),
  timeoutMs: num(setting('TIMEOUT'), 10) * 1000,
  /** e.g. https://ntfy.sh/my-homelab */
  ntfyUrl: env.NTFY_URL || null,
  ntfyToken: env.NTFY_TOKEN || null,
  /** Receives a JSON POST whenever endpoints go down or recover. */
  webhookUrl: env.WEBHOOK_URL || null,
  /** `user:password` for HTTP Basic Auth on the UI and API; /healthz stays open. */
  auth: setting('AUTH') || null,
  /**
   * Opens only the diagram endpoints (/api/diagram.svg, /api/diagram.drawio) to requests with
   * `?token=<value>`, e.g. for an image embedded in a wiki page whose readers have no login here.
   */
  embedToken: setting('EMBED_TOKEN') || null,
  /** Public URL of this app, used as the click target in notifications. */
  baseUrl: setting('BASE_URL') || null,
  webDir: setting('WEB_DIR') || new URL('../../web/dist/', import.meta.url).pathname,
};
