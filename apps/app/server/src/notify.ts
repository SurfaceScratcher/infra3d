import type { Topology } from 'infra3d/core';
import type { Change, State } from './checks.js';
import { config } from './config.js';

export const notifyTargets = () => ({ ntfy: !!config.ntfyUrl, webhook: !!config.webhookUrl });

/** Sends one message for new failures and one for recoveries, to ntfy and/or a webhook. */
export async function notify(changes: Change[], topology: Topology, st: State) {
  if (!changes.length || (!config.ntfyUrl && !config.webhookUrl)) return;
  const label = (id: string) => topology.nodes.find((n) => n.id === id)?.label ?? id;
  const down = changes.filter((c) => !c.ok).map((c) => c.id);
  const up = changes.filter((c) => c.ok).map((c) => c.id);
  const causes = st.causes.slice(0, 2).map((c) => label(c.id));

  const messages = [];
  if (down.length) {
    messages.push({
      event: 'down' as const,
      title: down.length === 1 ? `Down: ${label(down[0])}` : `${down.length} services down`,
      body: [down.map((id) => `${label(id)}: ${st.checks[id]?.error ?? 'unreachable'}`).join('\n'), causes.length ? `Likely cause: ${causes.join(', ')}` : '']
        .filter(Boolean)
        .join('\n'),
      endpoints: down,
      causes: st.causes.slice(0, 5),
      priority: 4,
      tags: 'rotating_light',
    });
  }
  if (up.length) {
    messages.push({
      event: 'up' as const,
      title: up.length === 1 ? `Recovered: ${label(up[0])}` : `${up.length} services recovered`,
      body: up.map(label).join(', '),
      endpoints: up,
      causes: [],
      priority: 2,
      tags: 'white_check_mark',
    });
  }

  for (const m of messages) {
    if (config.ntfyUrl) {
      await send(config.ntfyUrl, m.body, {
        Title: m.title,
        Priority: String(m.priority),
        Tags: m.tags,
        ...(config.baseUrl ? { Click: config.baseUrl } : {}),
        ...(config.ntfyToken ? { Authorization: `Bearer ${config.ntfyToken}` } : {}),
      });
    }
    if (config.webhookUrl) {
      const { event, title, body, endpoints, causes } = m;
      await send(config.webhookUrl, JSON.stringify({ event, title, message: body, endpoints, causes, url: config.baseUrl }), {
        'Content-Type': 'application/json',
      });
    }
  }
}

async function send(url: string, body: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { method: 'POST', body, headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) console.warn(`notification to ${new URL(url).host} failed: ${res.status}`);
  } catch (e) {
    console.warn(`notification to ${new URL(url).host} failed: ${(e as Error).message}`);
  }
}
