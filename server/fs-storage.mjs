// File-system storage adapter for server/core.mjs:
//   data/pokekanban.json          current document ({ rev, savedAt, data })
//   data/backups/pokekanban-*.json snapshots
//   data/uploads/<file>            attachments
//   data/<key>.json                small documents (push.json: notification subscriptions)

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';

export function fsStorage(dataDir) {
  const file = path.join(dataDir, 'pokekanban.json');
  const backupsDir = path.join(dataDir, 'backups');
  const uploadsDir = path.join(dataDir, 'uploads');

  const missing = (err) => err?.code === 'ENOENT';

  return {
    async readDoc() {
      try {
        return await fs.readFile(file, 'utf8');
      } catch (err) {
        if (missing(err)) return null;
        throw err;
      }
    },

    async writeDoc(text) {
      await fs.mkdir(dataDir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, text);
      await fs.rename(tmp, file);
    },

    async snapshot(name) {
      await fs.mkdir(backupsDir, { recursive: true });
      const target = path.join(backupsDir, name);
      if (await fs.stat(target).catch(() => null)) return;
      try {
        await fs.copyFile(file, target);
      } catch (err) {
        if (!missing(err)) throw err;
      }
    },

    async listBackups() {
      const names = await fs.readdir(backupsDir).catch((err) => (missing(err) ? [] : Promise.reject(err)));
      return Promise.all(
        names
          .filter((n) => n.endsWith('.json'))
          .map(async (name) => {
            const st = await fs.stat(path.join(backupsDir, name));
            return { name, size: st.size, mtime: st.mtime.toISOString() };
          }),
      );
    },

    async readBackup(name) {
      try {
        return await fs.readFile(path.join(backupsDir, path.basename(name)), 'utf8');
      } catch (err) {
        if (missing(err)) return null;
        throw err;
      }
    },

    async deleteBackup(name) {
      await fs.rm(path.join(backupsDir, path.basename(name)), { force: true });
    },

    async putFile(name, bytes) {
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, path.basename(name)), bytes);
    },

    async getItem(key) {
      try {
        return await fs.readFile(path.join(dataDir, `${path.basename(key)}.json`), 'utf8');
      } catch (err) {
        if (missing(err)) return null;
        throw err;
      }
    },

    async setItem(key, text) {
      await fs.mkdir(dataDir, { recursive: true });
      const target = path.join(dataDir, `${path.basename(key)}.json`);
      const tmp = `${target}.${process.pid}.tmp`;
      await fs.writeFile(tmp, text);
      await fs.rename(tmp, target);
    },

    async getFile(name) {
      const full = path.join(uploadsDir, path.basename(name));
      const st = await fs.stat(full).catch(() => null);
      if (!st?.isFile()) return null;
      return { body: Readable.toWeb(createReadStream(full)), size: st.size };
    },
  };
}
