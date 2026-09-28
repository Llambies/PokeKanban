import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module
import { createHandler } from '../../server/core.mjs';
// @ts-expect-error plain JS module
import { b64url, encryptPayload, fromB64url } from '../../server/push.mjs';

// RFC 8291, appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  result:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

function jwk(pub: string, d?: string): JsonWebKey {
  const raw = fromB64url(pub);
  return { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33)), ...(d ? { d } : {}), ext: true };
}

describe('web push encryption', () => {
  it('matches the RFC 8291 example', async () => {
    const serverKeys = {
      privateKey: await crypto.subtle.importKey('jwk', jwk(RFC.asPublic, RFC.asPrivate), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      publicKey: await crypto.subtle.importKey('jwk', jwk(RFC.asPublic), { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    };
    const body = await encryptPayload(RFC.plaintext, RFC.uaPublic, RFC.auth, { serverKeys, salt: fromB64url(RFC.salt) });
    expect(b64url(body)).toBe(RFC.result);
  });
});

function memoryStorage() {
  const items = new Map<string, string>();
  let doc: string | null = null;
  return {
    items,
    readDoc: async () => doc,
    writeDoc: async (text: string) => void (doc = text),
    snapshot: async () => {},
    listBackups: async () => [],
    readBackup: async () => null,
    deleteBackup: async () => {},
    putFile: async () => {},
    getFile: async () => null,
    getItem: async (key: string) => items.get(key) ?? null,
    setItem: async (key: string, text: string) => void items.set(key, text),
  };
}

async function subscription() {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = await crypto.subtle.exportKey('raw', ua.publicKey);
  return {
    endpoint: 'https://push.example/send/abc',
    keys: { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
  };
}

function setup() {
  const alarms: (number | null)[] = [];
  const sent: { url: string; init: RequestInit }[] = [];
  let status = 201;
  const handle = createHandler({
    storage: memoryStorage(),
    scheduler: { set: (at: number | null) => alarms.push(at) },
    fetchImpl: async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(null, { status });
    },
  });
  const call = async (path: string, json?: unknown, method = json === undefined ? 'GET' : 'POST') =>
    handle(
      new Request(`https://kanban.example${path}`, {
        method,
        headers: json === undefined ? {} : { 'content-type': 'application/json' },
        body: json === undefined ? undefined : JSON.stringify(json),
      }),
    ) as Promise<Response>;
  return { handle, call, alarms, sent, setStatus: (s: number) => (status = s) };
}

const data = {
  boards: {}, lists: {}, cards: {}, eventLabels: [],
  settings: { timeZone: 'UTC', allDayTime: '09:00', cardReminders: [], showCards: true },
  events: {
    e1: {
      id: 'e1', kind: 'event', title: 'Dentista', start: '2026-09-28T09:30', end: null, recurrence: null, exdates: [],
      reminders: [15], done: [], labelIds: [], notes: '', location: 'Centro', color: null, icon: null, sinceYear: null,
    },
  },
};

describe('reminders by push', () => {
  afterEach(() => vi.useRealTimers());

  it('schedules the next reminder, sends it when due and forgets dead subscriptions', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
    const api = setup();
    await api.call('/api/data', { baseRev: 0, data }, 'PUT');

    const { publicKey } = await (await api.call('/api/push')).json();
    expect(fromB64url(publicKey)).toHaveLength(65);
    expect((await api.call('/api/push/subscribe', { subscription: await subscription(), device: 'Móvil' })).status).toBe(200);
    expect(api.alarms.at(-1)).toBe(Date.parse('2026-09-28T09:15:00Z') + 500);
    expect(api.sent).toHaveLength(0);

    vi.setSystemTime(new Date('2026-09-28T09:15:01Z'));
    expect(await api.handle.runAlarm()).toBe(1);
    const [push] = api.sent;
    expect(push.url).toBe('https://push.example/send/abc');
    const headers = push.init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(headers['content-encoding']).toBe('aes128gcm');
    // Nothing left: the next alarm is a long-range re-check, and running again sends nothing.
    expect(await api.handle.runAlarm()).toBe(0);
    expect(api.sent).toHaveLength(1);

    api.setStatus(410);
    const sub = await subscription();
    await api.call('/api/push/subscribe', { subscription: sub, device: 'Móvil' });
    expect((await api.call('/api/push/test', { endpoint: sub.endpoint })).status).toBe(502);
    expect((await (await api.call('/api/push')).json()).devices).toEqual([]);
  });

  it('serves the agenda for the widget', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
    const api = setup();
    await api.call('/api/data', { baseRev: 0, data }, 'PUT');
    const body = await (await api.call('/api/agenda?days=3')).json();
    expect(body.today).toBe('2026-09-28');
    expect(body.items.map((i: { title: string; time: string }) => `${i.title} ${i.time}`)).toEqual(['Dentista 09:30']);
  });
});
