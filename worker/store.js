// Durable Object storage adapter for server/core.mjs.
//
// Values are split into chunks well under the per-value limit and written without awaiting in
// between, so the Durable Object commits each document (or file) atomically (write coalescing).
//
//   doc:meta { chunks, size }            doc:<i>        current document
//   bak:index [{ name, size, mtime }]     bak:<name>:meta / bak:<name>:<i>
//   file:<name>:meta { chunks, size, type }   file:<name>:<i>

const CHUNK = 120_000; // bytes
const BATCH = 128; // max keys per get/put/delete call

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function split(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.byteLength; i += CHUNK) chunks.push(bytes.slice(i, i + CHUNK));
  return chunks;
}

function join(parts, size) {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    const view = p instanceof Uint8Array ? p : new Uint8Array(p);
    out.set(view, offset);
    offset += view.byteLength;
  }
  return out;
}

export function durableStorage(storage) {
  async function readBlob(prefix) {
    const meta = await storage.get(`${prefix}:meta`);
    if (!meta) return null;
    const keys = Array.from({ length: meta.chunks }, (_, i) => `${prefix}:${i}`);
    const parts = [];
    for (let i = 0; i < keys.length; i += BATCH) {
      const map = await storage.get(keys.slice(i, i + BATCH));
      for (const key of keys.slice(i, i + BATCH)) {
        const part = map.get(key);
        if (!part) throw new Error(`Falta el fragmento ${key}`);
        parts.push(part);
      }
    }
    return { bytes: join(parts, meta.size), meta };
  }

  /** Issues every write synchronously (no awaits in between) so they commit together. */
  function writeBlob(prefix, bytes, extraMeta, previousChunks) {
    const chunks = split(bytes);
    const entries = chunks.map((c, i) => [`${prefix}:${i}`, c]);
    const writes = [];
    for (let i = 0; i < entries.length; i += BATCH) writes.push(storage.put(Object.fromEntries(entries.slice(i, i + BATCH))));
    const stale = [];
    for (let i = chunks.length; i < previousChunks; i++) stale.push(`${prefix}:${i}`);
    for (let i = 0; i < stale.length; i += BATCH) writes.push(storage.delete(stale.slice(i, i + BATCH)));
    writes.push(storage.put(`${prefix}:meta`, { chunks: chunks.length, size: bytes.byteLength, ...extraMeta }));
    return Promise.all(writes);
  }

  function deleteBlob(prefix, chunks) {
    const keys = [`${prefix}:meta`, ...Array.from({ length: chunks }, (_, i) => `${prefix}:${i}`)];
    const writes = [];
    for (let i = 0; i < keys.length; i += BATCH) writes.push(storage.delete(keys.slice(i, i + BATCH)));
    return Promise.all(writes);
  }

  return {
    async readDoc() {
      const blob = await readBlob('doc');
      return blob ? decoder.decode(blob.bytes) : null;
    },

    async writeDoc(text) {
      const previous = (await storage.get('doc:meta'))?.chunks ?? 0;
      await writeBlob('doc', encoder.encode(text), {}, previous);
    },

    async snapshot(name) {
      if (await storage.get(`bak:${name}:meta`)) return;
      const current = await readBlob('doc');
      if (!current) return;
      const index = (await storage.get('bak:index')) ?? [];
      const entry = { name, size: current.bytes.byteLength, mtime: new Date().toISOString() };
      const writes = writeBlob(`bak:${name}`, current.bytes, {}, 0);
      await Promise.all([writes, storage.put('bak:index', [...index.filter((b) => b.name !== name), entry])]);
    },

    async listBackups() {
      return (await storage.get('bak:index')) ?? [];
    },

    async readBackup(name) {
      const blob = await readBlob(`bak:${name}`);
      return blob ? decoder.decode(blob.bytes) : null;
    },

    async deleteBackup(name) {
      const meta = await storage.get(`bak:${name}:meta`);
      const index = (await storage.get('bak:index')) ?? [];
      await Promise.all([
        meta ? deleteBlob(`bak:${name}`, meta.chunks) : null,
        storage.put('bak:index', index.filter((b) => b.name !== name)),
      ]);
    },

    async putFile(name, bytes, type) {
      await writeBlob(`file:${name}`, bytes, { type }, 0);
    },

    async getFile(name) {
      const blob = await readBlob(`file:${name}`);
      return blob ? { body: blob.bytes, size: blob.bytes.byteLength } : null;
    },
  };
}
