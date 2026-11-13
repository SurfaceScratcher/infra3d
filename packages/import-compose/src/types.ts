import type { InfraEdge, InfraNode } from 'infra3d/core';

/** A compose stack as parsed from its YAML file. */
export interface StackInput {
  name: string;
  compose: ComposeFile;
}

export interface HostInput {
  id: string;
  stacks: StackInput[];
  /** The host's data is backed up to `config.backupTarget`. */
  backup?: boolean;
  /** Mount points of network shares on `config.nasTarget`; containers mounting below them get a `uses` edge. */
  mounts?: string[];
}

/** Everything a source found; turned into a topology by buildTopology(). */
export interface ImportInput {
  hosts: HostInput[];
  /** Base domain for `${DOMAIN}` / `{{ domain }}` placeholders in Traefik rules and env values. */
  domain?: string;
}

/** Reads some on-disk layout of compose files. */
export type Source = (root: string, config: ImportConfig) => ImportInput;

export interface HostConfig {
  label?: string;
  meta?: Record<string, string | number>;
  /** Node the host connects to: a network (`member` edge) if the id starts with `n:`, otherwise an `uplink`. */
  uplink?: string;
  /** Address used for TCP checks of directly published ports. Falls back to `meta.LAN`, then the host id. */
  address?: string;
}

/**
 * What cannot be derived from compose files: hardware, sites, uplinks and special cases.
 * See infra3d.config.example.json.
 */
export interface ImportConfig {
  name?: string;
  domain?: string;
  /** Name of the host when all stacks belong to one machine (single-host layouts). Default: `host`. */
  host?: string;
  /** Address for TCP checks of hosts without `address` or `meta.LAN`, e.g. `host.docker.internal`. */
  defaultAddress?: string;
  /**
   * Health checks for services the importer cannot see a route for, e.g. behind Nginx Proxy Manager
   * or a Cloudflare tunnel. Key: `service`, `stack/service` or `host/stack/service`;
   * value: one or more `https://…` / `tcp://host:port` targets.
   */
  checks?: Record<string, string | string[]>;
  /** Hosts in layout order. Without it, every host the source finds is used. */
  hosts?: Record<string, HostConfig>;
  /** Extra nodes and edges, e.g. sites, routers and NAS devices. */
  nodes?: InfraNode[];
  edges?: InfraEdge[];
  backupTarget?: string;
  nasTarget?: string;
  /** Per network name: label, meta and an optional `member` edge to another network (e.g. macvlan into the LAN). */
  networkOverrides?: Record<string, { label?: string; meta?: Record<string, string | number>; memberOf?: string; edgeLabel?: string }>;
  /** Env values containing one of `match` get a `uses` edge to `to`. */
  addressLinks?: { match: string[]; to: string; label?: string }[];
  /** Traefik middlewares that put a login in front of a route: `endpoint` is the login service's subdomain. */
  authMiddlewares?: { match: string; endpoint: string; label?: string }[];
  /** Labels of the four layers, e.g. for a translated UI. */
  layerLabels?: Partial<Record<'physical' | 'network' | 'container' | 'endpoint', string>>;
}

export interface ComposeService {
  image?: string;
  networks?: string[] | Record<string, unknown>;
  depends_on?: string[] | Record<string, unknown>;
  labels?: string[] | Record<string, string>;
  ports?: (string | number | { published?: string | number; host_ip?: string; protocol?: string })[];
  environment?: Record<string, string | number | boolean | null> | string[];
  command?: unknown;
  entrypoint?: unknown;
  volumes?: (string | { source?: string })[];
}

export interface ComposeFile {
  /** Project name; used as the stack name for a single compose file. */
  name?: string;
  services?: Record<string, ComposeService>;
  networks?: Record<string, { external?: boolean; name?: string } | null>;
}
