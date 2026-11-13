import { useCallback, useEffect, useRef, useState } from 'react';
import type { HealthAnalysis, Topology } from 'infra3d';

// Shape of GET /api/state from the infra3d server (apps/app/server).

export interface Check {
  target: string | null;
  ok: boolean | null;
  error: string | null;
  ms: number | null;
  answered: boolean;
  since: string | null;
  checkedAt: string | null;
}

export interface LiveState extends HealthAnalysis {
  topology: Topology | null;
  source: { kind: 'file' | 'import'; path: string; error: string | null; loadedAt: string | null };
  intervalSec: number;
  notify: { ntfy: boolean; webhook: boolean };
  checkedAt: string | null;
  checks: Record<string, Check>;
}

const POLL_MS = 15_000;

export function useLiveState() {
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const topologyJson = useRef('');

  const apply = useCallback((next: LiveState) => {
    // Keep the topology object stable unless it changed, so the scene does not re-run its layout
    const json = JSON.stringify(next.topology);
    setState((prev) => (prev && json === topologyJson.current ? { ...next, topology: prev.topology } : next));
    topologyJson.current = json;
    setError(null);
  }, []);

  const request = useCallback(
    async (method: 'GET' | 'POST', path: string) => {
      try {
        const res = await fetch(path, { method });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        apply(await res.json());
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [apply],
  );

  useEffect(() => {
    void request('GET', 'api/state');
    const t = setInterval(() => void request('GET', 'api/state'), POLL_MS);
    return () => clearInterval(t);
  }, [request]);

  const checkNow = useCallback(async () => {
    setBusy(true);
    await request('POST', 'api/check');
    setBusy(false);
  }, [request]);

  return { state, error, busy, checkNow };
}

export function since(iso: string | null) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `for ${min} min`;
  if (min < 48 * 60) return `for ${Math.round(min / 60)} h`;
  return `since ${new Date(iso).toLocaleDateString()}`;
}

export const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–');
