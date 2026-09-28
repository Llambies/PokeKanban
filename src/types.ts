export type ID = string;

/** Key into the palette defined in lib/colors.ts (e.g. "green", "green_bold"). */
export type ColorKey = string;

export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export interface Label {
  id: ID;
  name: string;
  color: ColorKey | null;
  /** "lucide:<IconName>" or a raw emoji. */
  icon: string | null;
}

export interface ChecklistItem {
  id: ID;
  text: string;
  done: boolean;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (local time). */
  due: string | null;
  collapsed?: boolean;
  children: ChecklistItem[];
}

export interface Checklist {
  id: ID;
  title: string;
  items: ChecklistItem[];
  hideDone?: boolean;
}

export interface Attachment {
  id: ID;
  name: string;
  url: string;
  createdAt: number;
  /** 'file' = uploaded to the server (url is relative: api/uploads/...). */
  kind?: 'link' | 'file';
  size?: number;
  mime?: string;
}

export interface Comment {
  id: ID;
  text: string;
  createdAt: number;
  editedAt?: number;
}

export interface CardCover {
  color: ColorKey | null;
  image: string | null;
  size: 'strip' | 'full';
}

export type CardKind = 'card' | 'separator';

export type CustomFieldType = 'text' | 'number' | 'checkbox' | 'date' | 'select';

export interface CustomFieldOption {
  id: ID;
  name: string;
  color: ColorKey | null;
}

export interface CustomField {
  id: ID;
  name: string;
  type: CustomFieldType;
  /** Only for 'select'. */
  options: CustomFieldOption[];
  /** Show the value as a badge on the card tile. */
  showOnCard: boolean;
}

/** text -> string, number -> number, checkbox -> true, date -> "YYYY-MM-DD", select -> option id. */
export type CustomFieldValue = string | number | boolean;

export interface Card {
  id: ID;
  boardId: ID;
  listId: ID;
  kind: CardKind;
  title: string;
  description: string;
  labelIds: ID[];
  cover: CardCover | null;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (local time). */
  start: string | null;
  due: string | null;
  dueDone: boolean;
  priority: Priority | null;
  checklists: Checklist[];
  attachments: Attachment[];
  comments: Comment[];
  /** Values of the board's custom fields, by field id. */
  fields: Record<ID, CustomFieldValue>;
  isTemplate: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ListColorMode = 'header' | 'full';

export interface List {
  id: ID;
  boardId: ID;
  title: string;
  /** Order of the (non archived) cards in this list. */
  cardIds: ID[];
  color: ColorKey | null;
  colorMode: ListColorMode;
  collapsed: boolean;
  wipLimit: number | null;
  archived: boolean;
  createdAt: number;
}

export interface Board {
  id: ID;
  title: string;
  /** Key into BOARD_BACKGROUNDS or "custom:#rrggbb". */
  background: string;
  starred: boolean;
  /** Order of the (non archived) lists in this board. */
  listIds: ID[];
  labels: Label[];
  fields: CustomField[];
  createdAt: number;
  updatedAt: number;
}

/* ---------------------------------------------------------------- calendar */

/**
 * event: appointment (optional end) · birthday / anniversary: yearly, shows the age ·
 * deadline / reminder: can be marked as done (per occurrence).
 */
export type EventKind = 'event' | 'birthday' | 'anniversary' | 'deadline' | 'reminder';

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: RecurrenceFreq;
  /** Every N days / weeks / months / years. */
  interval: number;
  /** Weekly: ISO weekdays (1 = Monday … 7 = Sunday). Empty = the start's weekday. */
  byWeekday: number[];
  /** Monthly: same day number, same nth weekday ("2nd Tuesday") or last weekday ("last Friday"). */
  monthlyBy: 'day' | 'weekday' | 'last-weekday';
  /** Last possible occurrence day ("YYYY-MM-DD", inclusive). */
  until: string | null;
  /** Maximum number of occurrences. */
  count: number | null;
}

export interface CalendarEvent {
  id: ID;
  kind: EventKind;
  title: string;
  notes: string;
  location: string;
  color: ColorKey | null;
  /** "lucide:<IconName>" or a raw emoji. */
  icon: string | null;
  labelIds: ID[];
  /** "YYYY-MM-DD" (all day) or "YYYY-MM-DDTHH:mm" (local time). First occurrence. */
  start: string;
  /** Same format as start. All-day ends are inclusive. */
  end: string | null;
  recurrence: Recurrence | null;
  /** Occurrences removed from the series (their "YYYY-MM-DD"). */
  exdates: string[];
  /** Minutes before the start to notify (all-day events count from settings.allDayTime). */
  reminders: number[];
  /** Completed occurrences ("YYYY-MM-DD"), for deadlines and reminders. */
  done: string[];
  /** Birthdays / anniversaries: year it all started, to show the age. */
  sinceYear: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  /** IANA zone used by the server to send reminders at the right local time. */
  timeZone: string;
  /** Time ("HH:mm") at which reminders of all-day events and cards are sent. */
  allDayTime: string;
  /** Reminders for cards with a due date (minutes before), empty = none. */
  cardReminders: number[];
  /** Show board cards with due dates in the calendar. */
  showCards: boolean;
}

export interface AppData {
  version: 1;
  boardOrder: ID[];
  boards: Record<ID, Board>;
  lists: Record<ID, List>;
  cards: Record<ID, Card>;
  events: Record<ID, CalendarEvent>;
  eventLabels: Label[];
  settings: AppSettings;
}

export type BoardView = 'kanban' | 'table' | 'calendar';

export type CalendarView = 'month' | 'week' | 'agenda';
