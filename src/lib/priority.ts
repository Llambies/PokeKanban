import type { Priority } from '../types';

export interface PriorityDef {
  key: Priority;
  name: string;
  color: string;
}

// Colors are theme-aware CSS custom properties (see :root / [data-theme='dark'] in
// src/styles/base.css) so they stay >=4.5:1 on --card-bg in both themes.
export const PRIORITIES: PriorityDef[] = [
  { key: 'urgent', name: 'Urgente', color: 'var(--prio-urgent)' },
  { key: 'high', name: 'Alta', color: 'var(--prio-high)' },
  { key: 'medium', name: 'Media', color: 'var(--prio-medium)' },
  { key: 'low', name: 'Baja', color: 'var(--prio-low)' },
];

const BY_KEY = new Map(PRIORITIES.map((p) => [p.key, p]));

export function getPriority(key: Priority | null | undefined): PriorityDef | null {
  return key ? BY_KEY.get(key) ?? null : null;
}
