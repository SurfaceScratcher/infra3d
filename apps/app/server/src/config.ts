// All settings come from environment variables, so the container needs no config file of its own.

const env = process.env;
const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

export const config = {
  port: num(env.PORT, 8080),
  /** Ready-made topology JSON. When set, no import runs. */
  topologyFile: env.INFRA3D_TOPOLOGY || null,
  /** Root of the compose stacks (or the Ansible repository) to import. */
  stacksDir: env.INFRA3D_STACKS || '/stacks',
  /** directory | ansible | auto */
  source: env.INFRA3D_SOURCE || 'auto',
  /** Hosts, sites and special cases for the importer; optional. */
  importConfig: env.INFRA3D_CONFIG || '/config/infra3d.config.json',
  /** Seconds between check runs; the topology is re-read in the same rhythm. */
  intervalSec: num(env.INFRA3D_INTERVAL, 60),
  /** Consecutive failures before an endpoint counts as down. */
  confirmFails: num(env.INFRA3D_CONFIRM_FAILS, 2),
  timeoutMs: num(env.INFRA3D_TIMEOUT, 10) * 1000,
  /** e.g. https://ntfy.sh/my-homelab */
  ntfyUrl: env.NTFY_URL || null,
  ntfyToken: env.NTFY_TOKEN || null,
  /** Receives a JSON POST whenever endpoints go down or recover. */
  webhookUrl: env.WEBHOOK_URL || null,
  /** `user:password` for HTTP Basic Auth on the UI and API; /healthz stays open. */
  auth: env.INFRA3D_AUTH || null,
  /** Public URL of this app, used as the click target in notifications. */
  baseUrl: env.INFRA3D_BASE_URL || null,
  webDir: env.INFRA3D_WEB_DIR || new URL('../../web/dist/', import.meta.url).pathname,
};
