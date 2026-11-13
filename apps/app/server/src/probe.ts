import net from 'node:net';

export interface ProbeResult {
  ok: boolean;
  error: string | null;
  /** A reverse proxy answered, even if with an error status. */
  answered: boolean;
}

/** Checks `https://…` / `http://…` with a request and `tcp://host:port` with a connect. */
export async function probe(target: string, timeoutMs: number): Promise<ProbeResult> {
  if (target.startsWith('tcp://')) return probeTcp(target.slice(6), timeoutMs);
  try {
    const res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const text = res.status === 404 ? (await res.text()).trim() : '';
    await res.body?.cancel().catch(() => {});
    // Traefik answers exactly this when no router matches, which usually means the container is gone
    if (text === '404 page not found') return { ok: false, error: '404 from proxy (no router, container stopped?)', answered: true };
    if (res.status >= 500) return { ok: false, error: `${res.status} ${res.statusText}`.trim(), answered: true };
    // 2xx, 3xx (login redirects), 401/403: the service answers
    return { ok: true, error: null, answered: true };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const reason = err.name === 'TimeoutError' ? 'timeout' : err.cause?.code ?? err.cause?.message ?? err.message;
    return { ok: false, error: reason, answered: false };
  }
}

function probeTcp(address: string, timeoutMs: number): Promise<ProbeResult> {
  const i = address.lastIndexOf(':');
  const host = address.slice(0, i).replace(/^\[|\]$/g, '');
  const port = Number(address.slice(i + 1));
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    const done = (ok: boolean, error: string | null) => {
      socket.destroy();
      resolve({ ok, error, answered: false });
    };
    socket.once('connect', () => done(true, null));
    socket.once('timeout', () => done(false, 'timeout'));
    socket.once('error', (e: NodeJS.ErrnoException) => done(false, e.code ?? e.message));
  });
}
