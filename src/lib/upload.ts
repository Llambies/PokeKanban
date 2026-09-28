import type { Attachment } from '../types';
import { usePersist } from '../store/persistence';

export const MAX_UPLOAD_MB = 25;

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  type: string;
}

/** Uploads are stored by the server; not available in browser-only (localStorage) mode. */
export function canUpload(): boolean {
  return usePersist.getState().mode === 'server';
}

export async function uploadFile(file: File): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`"${file.name}" supera el máximo de ${MAX_UPLOAD_MB} MB`);
  }
  const res = await fetch(`api/uploads?name=${encodeURIComponent(file.name || 'imagen.png')}`, {
    method: 'POST',
    headers: { 'x-pokekanban-upload': '1', 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error ?? `Error ${res.status} al subir "${file.name}"`);
  }
  const result: UploadResult = await res.json();
  // The server guesses the type from the extension; prefer the browser's when it knows better.
  if (file.type && result.type === 'application/octet-stream') result.type = file.type;
  return result;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;

export function isImageAttachment(att: Pick<Attachment, 'url' | 'mime'>): boolean {
  if (att.mime) return att.mime.startsWith('image/');
  return IMAGE_EXT.test(att.url);
}

export function formatSize(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
