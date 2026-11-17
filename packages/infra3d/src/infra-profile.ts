import type { DomainProfile } from './profile.js';

/**
 * The infrastructure domain: sites, devices and hosts at the bottom, then networks, containers
 * and the endpoints users reach. Default profile of every function and component.
 */
export const INFRA_PROFILE: DomainProfile = {
  id: 'infra',
  label: 'Infrastructure',
  anchorLayer: 'container',
  nodeTypes: {
    site: { label: 'Site', shape: 'hexagon' },
    device: { label: 'Device', shape: 'slab' },
    host: { label: 'Host', shape: 'wide', emphasis: true },
    network: { label: 'Network', shape: 'ring' },
    container: { label: 'Container', shape: 'box', labelOnHover: true },
    endpoint: { label: 'Endpoint', shape: 'diamond', labelOnHover: true },
  },
  roles: { database: { shape: 'cylinder' } },
  edgeKinds: {
    routes: { label: ['routes to', 'reachable via'], structural: true, pull: 1 },
    // The proxy is on every request path, which says little; drawn faint
    via: { label: ['goes through', 'forwards'], line: 'dashed', faint: true, structural: true, proxy: true, pull: 0.15 },
    // The login service, image registry and backup target are loose couplings: a running service
    // does not prove they work, so they stay out of the health analysis
    auth: { label: ['login via', 'protects'] },
    member: { label: ['in network', 'member'], structural: true, pull: 1, impliedByColumn: true },
    'runs-on': { label: ['runs on', 'hosts network'], structural: true, pull: 1, impliedByColumn: true },
    depends: { label: ['depends on', 'needed by'], structural: true },
    uses: { label: ['uses', 'used by'] },
    image: { label: ['image from', 'provides image to'], line: 'dashed' },
    uplink: { label: ['connected to', 'connects'], structural: true, pull: 1 },
    // If the backup target fails, the host keeps running
    backup: { label: ['backs up to', 'backup of'], line: 'dashed', propagates: false },
  },
  defaultShape: 'box',
};
