import { describe, expect, it } from 'vitest';
import { computeHighlight, toDrawio, toSvg, traverse, validateTopology } from 'infra3d/core';
import { buildTopology, CI_PROFILE, formatDuration, statusOf } from '../src/index.js';
import { woodpeckerSnapshot } from './fixtures.js';

const topo = buildTopology(woodpeckerSnapshot);
const edge = (from: string, to: string) => topo.edges.find((e) => e.from === from && e.to === to)?.kind;
const P = 'acme/shop#42';
// Steps of `test`: 1 postgres, 2 clone, 3 lint, 4 unit, 5 integration, 6 report
const T = (i: number) => `s:${P}/test/${i}`;

describe('buildTopology', () => {
  it('builds a valid topology with one column per repository that has pipelines', () => {
    const { errors, warnings } = validateTopology(topo);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(topo.columns).toEqual(['acme/shop', 'acme/docs']);
    expect(topo.layers.map((l) => l.id)).toEqual(['step', 'workflow', 'pipeline']);
  });

  it('carries its profile and each node its status, so infra3d needs no options', () => {
    expect(topo.profile).toBe(CI_PROFILE);
    expect(topo.nodes.find((n) => n.id === T(5))!.status).toBe('down');
    expect(toSvg(topo, { view: 'hosts' })).toBe(toSvg(topo, { view: 'hosts', profile: CI_PROFILE, status: statusOf(topo) }));
  });

  it('nests pipelines, workflows and steps, grouping steps by workflow', () => {
    expect(edge(`p:${P}`, `w:${P}/test`)).toBe('contains');
    expect(edge(`w:${P}/test`, T(5))).toBe('runs');
    expect(topo.nodes.find((n) => n.id === T(5))).toMatchObject({ label: 'integration', column: 'acme/shop', group: 'test', layer: 'step' });
    // With several pipelines per repository the group names the pipeline too
    const shop = woodpeckerSnapshot.repos[0];
    const two = buildTopology({ source: 'woodpecker', repos: [{ ...shop, pipelines: [shop.pipelines[0], { ...shop.pipelines[0], number: 41 }] }] });
    expect(two.nodes.find((n) => n.id === 's:acme/shop#41/test/5')!.group).toBe('#41 test');
  });

  it('turns dependsOn into needs edges between workflows and between steps', () => {
    expect(edge(`w:${P}/test`, `w:${P}/build`)).toBe('needs');
    expect(edge(`w:${P}/deploy`, `w:${P}/test`)).toBe('needs');
    expect(edge(T(5), T(4))).toBe('needs');
    expect(edge(T(6), T(5))).toBe('needs');
    expect(edge(T(6), T(3))).toBe('needs');
    // With dependsOn in use, steps without dependencies start after the clone
    expect(edge(T(4), T(2))).toBe('after');
  });

  it('chains steps in order when a workflow has no dependsOn', () => {
    expect(edge(`s:${P}/build/2`, `s:${P}/build/1`)).toBe('after');
    expect(edge(`s:${P}/build/3`, `s:${P}/build/2`)).toBe('after');
    expect(edge(`s:${P}/build/3`, `s:${P}/build/1`)).toBeUndefined();
  });

  it('links steps to the services of their workflow, but not the clone', () => {
    expect(edge(T(5), T(1))).toBe('uses');
    expect(edge(T(2), T(1))).toBeUndefined();
    expect(topo.nodes.find((n) => n.id === T(1))!.role).toBe('service');
    expect(topo.nodes.find((n) => n.id === T(2))!.role).toBe('clone');
  });

  it('keeps state, details and links to the web UI', () => {
    const p = topo.nodes.find((n) => n.id === `p:${P}`)!;
    expect(p.label).toBe('#42 main');
    expect(p.meta).toMatchObject({ State: 'failure', Event: 'push', Commit: '9fe0034c', Message: 'Add checkout tests', Duration: '3m 20s', Link: 'https://ci.example.com/repos/3/pipeline/42' });
    expect(topo.nodes.find((n) => n.id === T(5))!.meta).toMatchObject({ 'Exit code': 1, Link: 'https://ci.example.com/repos/3/pipeline/42/10' });
    // No `URL` key, so infra3d does not probe it as a health check
    expect(topo.nodes.some((n) => 'URL' in (n.meta ?? {}))).toBe(false);
  });

  it('maps states to node status', () => {
    const status = statusOf(topo);
    expect(status[`p:${P}`]).toBe('down');
    expect(status[T(5)]).toBe('down');
    expect(status[T(6)]).toBe('unknown'); // skipped
    expect(status[`w:${P}/build`]).toBe('ok');
  });

  it('formats durations', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(65)).toBe('1m 05s');
  });
});

describe('CI_PROFILE', () => {
  it('traces a failed pipeline down to its steps and a step up to what it blocks', () => {
    expect(traverse(topo, `p:${P}`, 'down', CI_PROFILE).nodes.has(T(5))).toBe(true);
    const up = computeHighlight(topo, T(5), 'impact', CI_PROFILE)!.up.nodes;
    expect([...up]).toEqual(expect.arrayContaining([T(6), `w:${P}/test`, `w:${P}/deploy`, `p:${P}`]));
    expect(up.has(T(3))).toBe(false); // lint does not depend on integration
  });

  it('renders as SVG and draw.io with its shapes', () => {
    const status = statusOf(topo);
    const svg = toSvg(topo, { view: 'hosts', profile: CI_PROFILE, status });
    expect(svg).toContain('(step, down)');
    expect(svg).toContain('<ellipse cy="-6"'); // service
    const xml = toDrawio(topo, { profile: CI_PROFILE, status });
    expect(xml).toMatch(/id="hosts:node:w:acme\/shop#42\/test"[^>]*>\s*<mxCell style="shape=hexagon/);
    expect(xml).toContain('hosts:group:acme/shop/test');
    // The workflow box implies `runs`, so the hosts page leaves those edges out
    const hosts = xml.slice(xml.indexOf('name="Hosts"'));
    expect((hosts.match(/edge="1"/g) ?? []).length).toBe(topo.edges.filter((e) => e.kind !== 'runs').length);
  });
});
