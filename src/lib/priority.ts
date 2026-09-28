import type { Priority } from '../types';

export interface PriorityDef {
  key: Priority;
  name: string;
  color: string;
}

export const PRIORITIES: PriorityDef[] = [
  { key: 'urgent', name: 'Urgente', color: '#C9372C' },
  { key: 'high', name: 'Alta', color: '#E56910' },
  { key: 'medium', name: 'Media', color: '#B38600' },
  { key: 'low', name: 'Baja', color: '#1D7AFC' },
];

const BY_KEY = new Map(PRIORITIES.map((p) => [p.key, p]));

export function getPriority(key: Priority | null | undefined): PriorityDef | null {
  return key ? BY_KEY.get(key) ?? null : null;
}
