import type { DomainProfile } from 'stratoscope/core';

/**
 * The infrastructure domain: sites, devices and hosts at the bottom, then networks, containers
 * and the endpoints users reach. Default profile of every function and component of infra3d.
 */
export const INFRA_PROFILE: DomainProfile = {
  id: 'infra',
  label: 'Infrastructure',
  anchorLayer: 'container',
  nodeTypes: {
    site: { color: '#a7a4bb', label: 'Site', shape: 'hexagon' },
    device: { color: '#d6d3e4', label: 'Device', shape: 'slab' },
    host: { color: '#f7bc94', label: 'Host', shape: 'wide', emphasis: true },
    network: { color: '#97d7df', label: 'Network', shape: 'ring' },
    container: { color: '#cbb6f3', label: 'Container', shape: 'box', labelOnHover: true },
    endpoint: { color: '#a3dcbc', label: 'Endpoint', shape: 'diamond', labelOnHover: true },
  },
  roles: { database: { shape: 'cylinder' } },
  edgeKinds: {
    routes: { color: '#a3dcbc', label: ['routes to', 'reachable via'], structural: true, pull: 1 },
    // The proxy is on every request path, which says little; drawn faint
    via: { color: '#a3dcbc', label: ['goes through', 'forwards'], line: 'dashed', faint: true, structural: true, proxy: true, pull: 0.15 },
    // The login service, image registry and backup target are loose couplings: a running service
    // does not prove they work, so they stay out of the health analysis
    auth: { color: '#f1d68d', label: ['login via', 'protects'] },
    member: { color: '#97d7df', label: ['in network', 'member'], structural: true, pull: 1, impliedByColumn: true },
    'runs-on': { color: '#f7bc94', label: ['runs on', 'hosts network'], structural: true, pull: 1, impliedByColumn: true },
    depends: { color: '#cbb6f3', label: ['depends on', 'needed by'], structural: true },
    uses: { color: '#f2b3d9', label: ['uses', 'used by'] },
    image: { color: '#f2b3d9', label: ['image from', 'provides image to'], line: 'dashed' },
    uplink: { color: '#a7a4bb', label: ['connected to', 'connects'], structural: true, pull: 1 },
    // If the backup target fails, the host keeps running
    backup: { color: '#f1d68d', label: ['backs up to', 'backup of'], line: 'dashed', propagates: false },
  },
  defaultShape: 'box',
  // Nodes without a host: the internet uplink, external services
  looseColumn: 'External',
};
