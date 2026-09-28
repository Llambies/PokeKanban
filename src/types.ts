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

export interface AppData {
  version: 1;
  boardOrder: ID[];
  boards: Record<ID, Board>;
  lists: Record<ID, List>;
  cards: Record<ID, Card>;
}

export type BoardView = 'kanban' | 'table' | 'calendar';
