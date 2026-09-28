// Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291), using
// only Web Crypto so it runs on Node and on Cloudflare Workers. No third-party service or key
// setup is needed: the server generates its VAPID key pair once and keeps it in storage.

const encoder = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function concat(...parts) {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** New VAPID key pair: { publicKey: base64url of the raw point, privateJwk }. */
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateJwk };
}

/**
 * Encrypts a payload for a subscription (RFC 8291, single aes128gcm record).
 * `opts.serverKeys` / `opts.salt` are only for tests (fixed values from the RFC).
 */
export async function encryptPayload(payload, p256dh, auth, opts = {}) {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const serverKeys =
    opts.serverKeys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256));

  const keyInfo = concat(encoder.encode('WebPush: info\u0000'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\u0000'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\u0000'), 12);

  const body = typeof payload === 'string' ? encoder.encode(payload) : payload;
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (and only) record.
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(body, [2]));
  const recordSize = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, recordSize, [asPublic.byteLength], asPublic, ciphertext);
}

const signingKeys = new Map();

async function signingKey(privateJwk) {
  const id = privateJwk.d;
  if (!signingKeys.has(id)) {
    signingKeys.set(id, crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']));
  }
  return signingKeys.get(id);
}

/** "vapid t=<JWT>, k=<public key>" for a push endpoint. */
export async function vapidAuthorization(endpoint, vapid, subject, now = Date.now()) {
  const header = b64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })),
  );
  // Web Crypto ECDSA signatures are already r||s, the format JWS wants.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(vapid.privateJwk), encoder.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${vapid.publicKey}`;
}

/**
 * Sends one notification. Returns { ok, status, gone } — `gone` means the subscription no longer
 * exists (unsubscribed / expired) and should be forgotten.
 */
export async function sendPush(subscription, message, vapid, subject, fetchImpl = fetch) {
  const body = await encryptPayload(JSON.stringify(message), subscription.keys.p256dh, subscription.keys.auth);
  let response;
  try {
    response = await fetchImpl(subscription.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuthorization(subscription.endpoint, vapid, subject),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(24 * 3600),
        urgency: 'high',
      },
      body,
    });
  } catch (err) {
    return { ok: false, status: 0, gone: false, error: String(err?.message ?? err) };
  }
  return { ok: response.ok, status: response.status, gone: response.status === 404 || response.status === 410 };
}
