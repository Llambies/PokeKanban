// Cloudflare Worker: serves the app (static assets from dist/) and the storage API.
// All data lives in one SQLite-backed Durable Object, so every device sees the same boards.
//
// Configuration (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
//   POKEKANBAN_PASSWORD   (secret, required) password asked by the login screen

import { DurableObject } from 'cloudflare:workers';
import { createHandler, isApiPath } from '../server/core.mjs';
import { durableStorage } from './store.js';

export class PokeKanbanStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.handle = createHandler({
      storage: durableStorage(ctx.storage),
      password: env.POKEKANBAN_PASSWORD ?? '',
      // A public URL without a password would expose the boards: refuse until one is set.
      requirePassword: true,
      // Reminders: the Durable Object alarm wakes it up when the next one is due.
      scheduler: {
        set: (at) => {
          const pending = at === null || at === undefined ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(at);
          ctx.waitUntil(pending);
        },
      },
    });
  }

  async alarm() {
    await this.handle.runAlarm();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const response = await this.handle(request, {
      ip: request.headers.get('cf-connecting-ip') ?? '',
      secure: url.protocol === 'https:',
    });
    return response ?? new Response('No encontrado', { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      const store = env.STORE.get(env.STORE.idFromName('pokekanban'));
      return store.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
