import { describe, expect, it } from 'vitest';
import { analyzeHealth, checkTarget, dependencyClosure } from '../src/health.js';
import type { CheckResult } from '../src/health.js';
import { topo } from './fixture.js';

const allOk: Record<string, CheckResult> = { 'e:shop': { ok: true }, 'e:wiki': { ok: true }, 'e:git': { ok: true } };

describe('analyzeHealth', () => {
  it('marks the whole structural chain ok when every endpoint answers', () => {
    const r = analyzeHealth(topo, allOk);
    expect(r.down).toEqual([]);
    expect(r.causes).toEqual([]);
    expect(r.status['h:a']).toBe('ok');
    expect(r.status['c:a:shop-db']).toBe('ok');
    // only reachable through a backup edge, so nothing proves it runs
    expect(r.status['nas']).toBe('unknown');
  });

  it('narrows a single failure down to what no healthy endpoint covers', () => {
    const r = analyzeHealth(topo, { ...allOk, 'e:shop': { ok: false } });
    expect(r.down).toEqual(['e:shop']);
    // wiki is reachable through the same proxy, network and host
    expect(r.suspects['e:shop']).toEqual(['c:a:shop', 'c:a:shop-db', 'n:a:shop']);
    expect(r.status['c:a:traefik']).toBe('ok');
    expect(r.status['c:a:shop-db']).toBe('suspect');
  });

  it('clears the proxy chain when the proxy answered with an error', () => {
    const r = analyzeHealth(topo, { 'e:shop': { ok: false, answered: true } });
    expect(r.status['c:a:traefik']).toBe('ok');
    expect(r.status['h:a']).toBe('ok');
    expect(r.suspects['e:shop']).toEqual(['c:a:shop', 'c:a:shop-db', 'n:a:shop']);
  });

  it('ranks the shared host first when several endpoints on it fail', () => {
    const r = analyzeHealth(topo, { 'e:shop': { ok: false }, 'e:wiki': { ok: false }, 'e:git': { ok: true } });
    expect(r.causes[0]).toEqual({ id: 'h:a', count: 2 });
    // site is cleared by host-b's endpoint
    expect(r.status['site']).toBe('ok');
  });

  it('lists nothing suspicious when the failure must be in the service itself', () => {
    const r = analyzeHealth(topo, { 'e:shop': { ok: false, answered: true }, 'e:wiki': { ok: true }, 'e:git': { ok: true } });
    // shop and its database are still not proven by anything else
    expect(r.suspects['e:shop']).toEqual(['c:a:shop', 'c:a:shop-db', 'n:a:shop']);
    const alone = analyzeHealth(topo, { 'e:wiki': { ok: false, answered: true }, 'e:shop': { ok: true }, 'e:git': { ok: true } });
    expect(alone.suspects['e:wiki']).toEqual(['c:a:wiki']);
  });

  it('ignores loose couplings such as "uses"', () => {
    // wiki uses git, but git being down must not make the wiki suspect or vice versa
    const r = analyzeHealth(topo, { 'e:git': { ok: false }, 'e:wiki': { ok: true }, 'e:shop': { ok: true } });
    expect(r.suspects['e:git']).toEqual(['c:b:git', 'n:b:default', 'h:b']);
    expect(r.status['c:a:wiki']).toBe('ok');
  });

  it('treats unchecked endpoints as unknown', () => {
    const r = analyzeHealth(topo, {});
    expect(Object.values(r.status).every((s) => s === 'unknown')).toBe(true);
  });

  it('accepts custom structural kinds', () => {
    const r = analyzeHealth(topo, { 'e:wiki': { ok: false }, 'e:shop': { ok: true }, 'e:git': { ok: true } }, {
      structuralKinds: ['routes', 'via', 'member', 'runs-on', 'depends', 'uplink', 'uses'],
    });
    // with "uses" counted, the healthy git endpoint is part of the wiki's chain and stays cleared
    expect(r.suspects['e:wiki']).toEqual(['c:a:wiki']);
    expect(dependencyClosure(topo, 'e:wiki', ['routes', 'uses']).has('e:git')).toBe(true);
  });
});

describe('checkTarget', () => {
  it('prefers check over meta', () => {
    expect(checkTarget({ id: 'x', label: 'x', type: 'endpoint', layer: 'endpoint', check: 'tcp://a:1', meta: { URL: 'https://a' } })).toBe('tcp://a:1');
    expect(checkTarget({ id: 'x', label: 'x', type: 'endpoint', layer: 'endpoint', meta: { URL: 'https://a' } })).toBe('https://a');
    expect(checkTarget({ id: 'x', label: 'x', type: 'endpoint', layer: 'endpoint' })).toBeNull();
  });
});
