import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { createHandler } from '../../server/core.mjs';
// @ts-expect-error plain JS module
import { KIND_DEFAULTS, TOOLS } from '../../server/agent.mjs';
import { KIND_DEFAULTS as CLIENT_DEFAULTS, sampleData } from '../../src/store/factories';

const BASE = 'https://kanban.example';

/** In-memory storage adapter (see the interface in server/core.mjs). */
function memoryStorage() {
  const kv = new Map<string, string>();
  let doc: string | null = null;
  return {
    async readDoc() { return doc; },
    async writeDoc(text: string) { doc = text; },
    async snapshot() {},
    async listBackups() { return []; },
    async readBackup() { return null; },
    async deleteBackup() {},
    async putFile() {},
    async getFile() { return null; },
    async getItem(key: string) { return kv.get(key) ?? null; },
    async setItem(key: string, text: string) { kv.set(key, text); },
  };
}

async function setup(password = '') {
  const handle = createHandler({ storage: memoryStorage(), password });
  let cookie = '';
  const call = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    if (cookie && !headers.has('authorization')) headers.set('cookie', cookie);
    if (init.json !== undefined) headers.set('content-type', 'application/json');
    const res: Response = await handle(
      new Request(BASE + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }),
      { ip: '1.2.3.4' },
    );
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  // The web app saves its first document, then a key is created from the UI.
  if (password) await call('/api/login', { method: 'POST', json: { password } });
  await call('/api/data', { method: 'PUT', json: { baseRev: 0, data: sampleData() } });
  const created = await (await call('/api/keys', { method: 'POST', json: { name: 'test', scope: 'write' } })).json();
  const tool = async (name: string, args: unknown = {}, key = created.key) => {
    const res = await call(`/api/agent/${name}`, { method: 'POST', json: args, headers: { authorization: `Bearer ${key}` } });
    return { status: res.status, body: await res.json() };
  };
  return { call, tool, key: created.key as string, created };
}

describe('API keys', () => {
  it('are created from the session, stored hashed and revocable', async () => {
    const { call, created } = await setup();
    expect(created.key).toMatch(/^pk_/);
    const list = await (await call('/api/keys')).json();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.key);
    expect(list[0]).toMatchObject({ name: 'test', scope: 'write', prefix: created.key.slice(0, 9) });
    expect((await call(`/api/keys/${created.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await (await call('/api/keys')).json()).toEqual([]);
    expect((await call('/api/keys', { method: 'POST', json: { name: '', scope: 'read' } })).status).toBe(400);
    expect((await call('/api/keys', { method: 'POST', json: { name: 'x', scope: 'admin' } })).status).toBe(400);
  });

  it('need a login to be managed, and the agent API needs a key instead of a session', async () => {
    const { call, tool, key } = await setup('secret');
    const anon = createHandler({ storage: memoryStorage(), password: 'secret' });
    expect((await anon(new Request(`${BASE}/api/keys`), {})).status).toBe(401);
    expect((await call('/api/agent/get_overview', { method: 'POST', json: {} , headers: { authorization: 'Bearer pk_nope_nope_nope_nope_nope' } })).status).toBe(401);
    // A browser cookie alone is not enough for the agent API.
    const noKey = await anon(new Request(`${BASE}/api/agent`), {});
    expect(noKey.status).toBe(401);
    expect((await tool('get_overview', {}, key)).status).toBe(200);
  });

  it('revoked keys stop working and read-only keys cannot write', async () => {
    const { call, tool, key, created } = await setup();
    const ro = await (await call('/api/keys', { method: 'POST', json: { name: 'ro', scope: 'read' } })).json();
    expect((await tool('get_overview', {}, ro.key)).status).toBe(200);
    const denied = await tool('create_board', { title: 'x' }, ro.key);
    expect(denied.status).toBe(403);
    await call(`/api/keys/${created.id}`, { method: 'DELETE' });
    expect((await tool('get_overview', {}, key)).status).toBe(401);
  });
});

describe('agent tools', () => {
  it('lists the boards with ids, labels and fields', async () => {
    const { tool } = await setup();
    const { body } = await tool('get_overview');
    expect(body.boards).toHaveLength(1);
    expect(body.boards[0].lists.map((l: { title: string }) => l.title)).toEqual(['Pendiente', 'En curso', 'Hecho']);
    expect(body.boards[0].labels.map((l: { name: string }) => l.name)).toContain('Urgente');
    expect(body.eventLabels.length).toBeGreaterThan(0);
  });

  it('creates, reads, updates, moves and deletes cards', async () => {
    const { tool, call } = await setup();
    const overview = (await tool('get_overview')).body.boards[0];
    const [todo, doing] = overview.lists;
    const created = await tool('create_card', {
      listId: todo.id, title: '  Escribir tests ', labels: ['urgente'], due: '2030-05-01', priority: 'high', position: 'top',
      checklists: [{ title: 'Pasos', items: ['uno', { text: 'dos', done: true, children: [{ text: 'dos.a', done: true }] }] }],
      fields: { 'Esfuerzo': 'Medio', 'Coste (€)': 12 },
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ title: 'Escribir tests', labels: ['Urgente'], due: '2030-05-01', priority: 'high', listId: todo.id });
    expect(created.body.fields).toEqual({ Esfuerzo: 'Medio', 'Coste (€)': 12 });
    expect(created.body.checklist).toEqual({ done: 1, total: 2 });

    const id = created.body.id;
    expect((await tool('get_overview')).body.boards[0].lists[0].cards).toBe(todo.cards + 1);
    const found = await tool('list_cards', { query: 'tests', boardId: overview.id });
    expect(found.body.cards.map((c: { id: string }) => c.id)).toEqual([id]);

    const moved = await tool('update_card', { cardId: id, listId: doing.id, position: 0, dueDone: true, labels: [] });
    expect(moved.body).toMatchObject({ listId: doing.id, dueDone: true, labels: [] });
    const listed = (await tool('list_cards', { listId: doing.id })).body.cards;
    expect(listed[0].id).toBe(id);

    expect((await tool('add_comment', { cardId: id, text: 'hola' })).status).toBe(200);
    const comments = (await tool('get_card', { cardId: id })).body.commentList;
    expect(comments).toHaveLength(1);
    expect((await tool('update_comment', { cardId: id, commentId: comments[0].id, text: 'adiós' })).body.text).toBe('adiós');
    expect((await tool('delete_comment', { cardId: id, commentId: comments[0].id })).status).toBe(200);

    const archived = await tool('update_card', { cardId: id, archived: true });
    expect(archived.body.archived).toBe(true);
    expect((await tool('list_cards', { query: 'tests' })).body.total).toBe(0);
    expect((await tool('list_cards', { query: 'tests', includeArchived: true })).body.total).toBe(1);
    await tool('update_card', { cardId: id, archived: false });

    expect((await tool('delete_card', { cardId: id })).status).toBe(200);
    expect((await tool('get_card', { cardId: id })).status).toBe(404);

    // What the web app sees is a consistent document: no list keeps the deleted card.
    const data = (await (await call('/api/data')).json()).data;
    expect(Object.values(data.lists).some((l: any) => l.cardIds.includes(id))).toBe(false);
  });

  it('validates input with clear messages and leaves the data untouched on errors', async () => {
    const { tool, call } = await setup();
    const { id: listId } = (await tool('get_overview')).body.boards[0].lists[0];
    const before = (await (await call('/api/meta')).json()).rev;
    for (const args of [
      { listId, title: '' },
      { listId, title: 'x', due: '1 de mayo' },
      { listId, title: 'x', priority: 'asap' },
      { listId, title: 'x', labels: ['no existe'] },
      { listId, title: 'x', start: '2030-02-01', due: '2030-01-01' },
      { listId: 'nope', title: 'x' },
    ]) {
      const res = await tool('create_card', args);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(typeof res.body.error).toBe('string');
    }
    expect((await (await call('/api/meta')).json()).rev).toBe(before);
    expect((await tool('no_such_tool')).status).toBe(404);
  });

  it('moves cards across boards remapping labels by name', async () => {
    const { tool } = await setup();
    const board = (await tool('create_board', { title: 'Otro' })).body;
    const list = (await tool('create_list', { boardId: board.id, title: 'Entrada' })).body;
    const first = (await tool('get_overview')).body.boards[0];
    const card = (await tool('create_card', { listId: first.lists[0].id, title: 'viaja', labels: ['Idea'] })).body;
    const moved = (await tool('update_card', { cardId: card.id, listId: list.id })).body;
    expect(moved).toMatchObject({ boardId: board.id, listId: list.id, labels: ['Idea'] });
  });

  it('manages boards, lists and labels', async () => {
    const { tool } = await setup();
    const board = (await tool('create_board', { title: 'Nuevo', starred: true })).body;
    const a = (await tool('create_list', { boardId: board.id, title: 'A' })).body;
    const b = (await tool('create_list', { boardId: board.id, title: 'B', position: 'top', color: 'blue', wipLimit: 2 })).body;
    expect(b).toMatchObject({ color: 'blue', wipLimit: 2 });
    await tool('update_list', { listId: a.id, position: 0, title: 'A2' });
    const order = (await tool('get_overview')).body.boards.find((x: { id: string }) => x.id === board.id).lists.map((l: { title: string }) => l.title);
    expect(order).toEqual(['A2', 'B']);
    expect((await tool('create_list', { boardId: board.id, title: 'C', color: 'chartreuse' })).status).toBe(400);

    await tool('create_label', { boardId: board.id, name: 'Nueva', color: 'pink' });
    const card = (await tool('create_card', { listId: a.id, title: 'con etiqueta', labels: ['nueva'] })).body;
    expect(card.labels).toEqual(['Nueva']);
    await tool('update_label', { boardId: board.id, label: 'Nueva', name: 'Renombrada' });
    expect((await tool('get_card', { cardId: card.id })).body.labels).toEqual(['Renombrada']);
    await tool('delete_label', { boardId: board.id, label: 'Renombrada' });
    expect((await tool('get_card', { cardId: card.id })).body.labels).toEqual([]);

    expect((await tool('delete_list', { listId: a.id })).body.cards).toBe(1);
    expect((await tool('delete_board', { boardId: board.id })).status).toBe(200);
    expect((await tool('get_overview')).body.boards).toHaveLength(1);
  });

  it('manages events, recurrences and completions', async () => {
    const { tool } = await setup();
    const ev = (await tool('create_event', {
      title: 'Yoga', start: '2030-01-07T18:00', end: '2030-01-07T19:00', labels: ['Salud'],
      recurrence: { freq: 'weekly', byWeekday: [1, 3] }, reminders: [10, 60],
    })).body;
    expect(ev).toMatchObject({ kind: 'event', labelNames: ['Salud'], reminders: [60, 10] });
    expect(ev.recurrence).toMatchObject({ freq: 'weekly', interval: 1, byWeekday: [1, 3], count: null });

    const range = (await tool('list_events', { from: '2030-01-01', to: '2030-01-14', query: 'yoga' })).body.events[0];
    expect(range.occurrences).toEqual(['2030-01-07', '2030-01-09', '2030-01-14']);
    expect((await tool('list_events', { from: '2031-01-01', to: '2031-01-02', query: 'yoga' })).body.total).toBe(1);
    expect((await tool('list_events', { from: '2029-01-01', to: '2029-01-31', query: 'yoga' })).body.total).toBe(0);

    await tool('update_event', { eventId: ev.id, exdates: ['2030-01-09'], location: 'Gimnasio', end: null, start: '2030-01-07' });
    expect((await tool('list_events', { from: '2030-01-01', to: '2030-01-14', query: 'yoga' })).body.events[0].occurrences).toEqual(['2030-01-07', '2030-01-14']);

    expect((await tool('update_event', { eventId: ev.id, start: '2030-01-07T10:00', end: '2030-01-07' })).status).toBe(400);
    expect((await tool('create_event', { title: 'x', start: '2030-13-45' })).status).toBe(400);
    expect((await tool('create_event', { title: 'x' })).status).toBe(400);
    expect((await tool('set_event_done', { eventId: ev.id, date: '2030-01-07' })).status).toBe(400);

    const birthday = (await tool('create_event', { title: 'Ana', kind: 'birthday', start: '1990-03-04', sinceYear: 1990 })).body;
    expect(birthday.recurrence).toMatchObject({ freq: 'yearly' });
    expect(birthday.reminders).toEqual([0]);
    const deadline = (await tool('create_event', { title: 'Pagar', kind: 'deadline', start: '2030-02-01' })).body;
    expect((await tool('set_event_done', { eventId: deadline.id, date: '2030-02-01' })).body.done).toEqual(['2030-02-01']);
    expect((await tool('set_event_done', { eventId: deadline.id, date: '2030-02-01', done: false })).body.done).toEqual([]);

    expect((await tool('delete_event', { eventId: ev.id })).status).toBe(200);
    expect((await tool('get_event', { eventId: ev.id })).status).toBe(404);
  });

  it('keeps the same defaults for events as the web app', () => {
    expect(KIND_DEFAULTS).toEqual(Object.fromEntries(Object.entries(CLIENT_DEFAULTS).map(([k, v]) => [k, { reminders: v.reminders, yearly: v.yearly }])));
  });

  it('publishes every tool with an input schema', () => {
    const names = TOOLS.map((t: { name: string }) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) expect(t.inputSchema.type).toBe('object');
  });
});

describe('MCP endpoint', () => {
  async function rpc(call: (p: string, i?: any) => Promise<Response>, key: string, message: unknown) {
    const res = await call('/api/mcp', { method: 'POST', json: message, headers: { authorization: `Bearer ${key}` } });
    return { status: res.status, body: res.status === 202 ? null : await res.json() };
  }

  it('speaks JSON-RPC: initialize, tools/list and tools/call', async () => {
    const { call, key } = await setup();
    const init = await rpc(call, key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(init.body.result).toMatchObject({ protocolVersion: '2025-03-26', serverInfo: { name: 'pokekanban' } });
    expect((await rpc(call, key, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);

    const list = await rpc(call, key, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.body.result.tools.map((t: { name: string }) => t.name)).toContain('create_card');
    expect(list.body.result.tools.find((t: { name: string }) => t.name === 'get_card').annotations.readOnlyHint).toBe(true);

    const overview = await rpc(call, key, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_overview', arguments: {} } });
    expect(JSON.parse(overview.body.result.content[0].text).boards).toHaveLength(1);

    const bad = await rpc(call, key, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_card', arguments: { cardId: 'nope' } } });
    expect(bad.body.result.isError).toBe(true);
    expect(bad.body.result.content[0].text).toContain('nope');

    expect((await rpc(call, key, { jsonrpc: '2.0', id: 5, method: 'nope' })).body.error.code).toBe(-32601);
    expect((await call('/api/mcp', { method: 'POST', json: {} })).status).toBe(401);
    expect((await call('/api/mcp', { headers: { authorization: `Bearer ${key}` } })).status).toBe(405);
  });
});
