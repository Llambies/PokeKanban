export type KeyScope = 'read' | 'write';

export interface ApiKey {
  id: string;
  name: string;
  scope: KeyScope;
  /** First characters of the key, to recognise it in the list. */
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export type CreatedKey = ApiKey & { key: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ? String(json.error) : `Error ${res.status}`);
  return json as T;
}

export const listKeys = () => request<ApiKey[]>('api/keys');

export const createKey = (name: string, scope: KeyScope) =>
  request<CreatedKey>('api/keys', { method: 'POST', body: JSON.stringify({ name, scope }) });

export const revokeKey = (id: string) => request<{ ok: true }>(`api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** URL of the MCP server of this installation. */
export const mcpUrl = () => new URL('api/mcp', document.baseURI).href;

export function claudeCommand(key: string): string {
  return `claude mcp add --transport http pokekanban ${mcpUrl()} --header "Authorization: Bearer ${key}"`;
}

export function codexCommands(key: string): string {
  return `export POKEKANBAN_API_KEY=${key}\ncodex mcp add pokekanban --url ${mcpUrl()} --bearer-token-env-var POKEKANBAN_API_KEY`;
}
