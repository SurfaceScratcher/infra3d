import type { FetchOptions } from '../types.js';

/** GET `<server>/api<path>` with the token; throws on any non-2xx answer. */
export function apiGetter(opts: FetchOptions) {
  const server = opts.server.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const get = async <T>(path: string): Promise<T> => {
    const res = await doFetch(`${server}/api${path}`, { headers: { Authorization: `Bearer ${opts.token}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${res.statusText}`.trim());
    return (await res.json()) as T;
  };
  return { server, get };
}

export const slugPath = (slug: string) => slug.split('/').map(encodeURIComponent).join('/');
export const pipelineCount = (opts: FetchOptions) => Math.max(1, opts.pipelines ?? 1);
