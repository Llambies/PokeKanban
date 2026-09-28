import type { CustomField, CustomFieldType, CustomFieldValue } from '../types';
import { formatDate } from './dates';

export const FIELD_TYPES: { type: CustomFieldType; name: string }[] = [
  { type: 'text', name: 'Texto' },
  { type: 'number', name: 'Número' },
  { type: 'checkbox', name: 'Casilla' },
  { type: 'date', name: 'Fecha' },
  { type: 'select', name: 'Desplegable' },
];

export function fieldTypeName(type: CustomFieldType): string {
  return FIELD_TYPES.find((t) => t.type === type)?.name ?? type;
}

/** Human readable value, or null when the card has no value for the field. */
export function formatFieldValue(field: CustomField, value: CustomFieldValue | undefined): string | null {
  if (value === undefined || value === '') return null;
  switch (field.type) {
    case 'checkbox':
      return value === true ? field.name : null;
    case 'date':
      return formatDate(String(value));
    case 'number':
      return Number(value).toLocaleString('es-ES');
    case 'select':
      return field.options.find((o) => o.id === value)?.name ?? null;
    default:
      return String(value);
  }
}

/** Sort key for table columns. */
export function fieldSortValue(field: CustomField, value: CustomFieldValue | undefined): number | string {
  if (value === undefined) return field.type === 'number' ? Infinity : '￿';
  if (field.type === 'number') return Number(value);
  if (field.type === 'checkbox') return value ? 0 : 1;
  if (field.type === 'select') {
    const index = field.options.findIndex((o) => o.id === value);
    return index < 0 ? Infinity : index;
  }
  return String(value).toLocaleLowerCase('es');
}
