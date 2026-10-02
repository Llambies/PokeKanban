import { useEffect, useMemo, useState } from 'react';

type Renderer = (text: string) => string;

// marked + DOMPurify are only needed to show a card's description or comments, so they're loaded
// on demand instead of sitting in the main chunk.
let renderer: Renderer | null = null;
let loading: Promise<Renderer> | null = null;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function load(): Promise<Renderer> {
  if (!loading) {
    loading = Promise.all([import('marked'), import('dompurify')]).then(([{ marked }, { default: DOMPurify }]) => {
      marked.setOptions({ gfm: true, breaks: true });
      DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
      renderer = (text) => DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
      return renderer;
    });
  }
  return loading;
}

/**
 * Rendered markdown HTML for `text`. Shows it as plain (escaped) text on the first render, while the
 * markdown renderer loads in the background, then re-renders once it's ready.
 */
export function useMarkdown(text: string): string {
  const [ready, setReady] = useState(renderer !== null);
  useEffect(() => {
    if (!ready) load().then(() => setReady(true));
  }, [ready]);
  return useMemo(() => {
    if (ready && renderer) return renderer(text);
    return text.trim() ? `<p>${escapeHtml(text)}</p>` : '';
  }, [ready, text]);
}
