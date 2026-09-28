import { useMemo, useState } from 'react';
import { CalendarDays, Clock, Download, LayoutDashboard, MoreHorizontal, Plus, Star, Upload } from 'lucide-react';
import { updateBoard, useStore } from '../../store/store';
import { navigate } from '../../lib/router';
import { getBoardBackground } from '../../lib/colors';
import { exportAll, importFromFile } from '../../lib/backup';
import { dueStatus } from '../../lib/dates';
import { openContextMenu, openMenuAt } from '../contextmenu/menuStore';
import { boardTileMenu } from '../contextmenu/menus';
import { Popover } from '../common/Popover';
import { CreateBoardForm } from './CreateBoardForm';
import { usePersist } from '../../store/persistence';
import { calendarItems, EMPTY_CAL_FILTER, type CalItem } from '../../lib/calendar';
import { todayKey } from '../../lib/dates';
import { dayToKey, keyToDay } from '../../../shared/calendar.js';
import { AgendaRow } from '../calendar/items';
import { dayTitle } from '../calendar/views';
import { newEvent } from '../calendar/actions';

const UPCOMING_DAYS = 7;
const UPCOMING_MAX = 8;

function Upcoming() {
  const data = useStore((s) => s.data);
  const today = todayKey();
  const rows = useMemo(() => {
    const from = keyToDay(today);
    const now = new Date();
    const past = calendarItems(data, dayToKey(from - 30), dayToKey(from - 1), EMPTY_CAL_FILTER, now);
    const next = calendarItems(data, today, dayToKey(from + UPCOMING_DAYS - 1), EMPTY_CAL_FILTER, now);
    const out: { key: string; header?: string; item?: CalItem }[] = [];
    const late = [...past.values()].flat().filter((it) => it.overdue && it.first);
    if (late.length) out.push({ key: 'late', header: 'Pendiente' }, ...late.map((item) => ({ key: item.key, item })));
    for (let d = from; d < from + UPCOMING_DAYS; d++) {
      const day = dayToKey(d);
      const list = (next.get(day) ?? []).filter((it) => it.first || d === from);
      if (list.length) out.push({ key: day, header: dayTitle(day, today) }, ...list.map((item) => ({ key: item.key, item })));
    }
    return out;
  }, [data, today]);
  const items = rows.filter((r) => r.item).length;
  let shown = 0;
  const visible = rows.filter((r) => {
    if (r.item) return ++shown <= UPCOMING_MAX;
    return shown < UPCOMING_MAX;
  });

  return (
    <section className="home__section home-upcoming">
      <h2>
        <CalendarDays size={18} /> Próximos días
        <button type="button" className="btn btn--sm push-right" onClick={() => navigate({ page: 'calendar' })}>
          Abrir calendario
        </button>
      </h2>
      {items === 0 ? (
        <p className="muted small">
          Nada en los próximos {UPCOMING_DAYS} días.{' '}
          <button type="button" className="link-btn" onClick={() => newEvent('event')}>
            Crear un evento
          </button>
        </p>
      ) : (
        <div className="home-upcoming__list">
          {visible.map((r) => (r.item ? <AgendaRow key={r.key} item={r.item} /> : <h3 key={r.key} className="cal-agenda__day">{r.header}</h3>))}
          {items > UPCOMING_MAX && (
            <button type="button" className="btn btn--subtle btn--block" onClick={() => navigate({ page: 'calendar', calView: 'agenda' })}>
              Ver {items - UPCOMING_MAX} más en la agenda
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function BoardTile({ boardId }: { boardId: string }) {
  const board = useStore((s) => s.data.boards[boardId]);
  const stats = useStore((s) => {
    let cards = 0;
    let overdue = 0;
    for (const listId of s.data.boards[boardId]?.listIds ?? []) {
      for (const cardId of s.data.lists[listId]?.cardIds ?? []) {
        const card = s.data.cards[cardId];
        if (!card || card.kind === 'separator') continue;
        cards++;
        if (dueStatus(card.due, card.dueDone) === 'overdue') overdue++;
      }
    }
    return `${cards}|${overdue}`;
  });
  if (!board) return null;
  const [cards, overdue] = stats.split('|').map(Number);
  return (
    <div
      className="board-tile"
      style={{ background: getBoardBackground(board.background).css }}
      onClick={() => navigate({ boardId })}
      onContextMenu={(e) => openContextMenu(e, () => boardTileMenu(boardId))}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate({ boardId })}
    >
      <span className="board-tile__title">{board.title}</span>
      <span className="board-tile__meta">
        {cards} tarjeta{cards === 1 ? '' : 's'}
        {overdue > 0 && (
          <span className="board-tile__overdue">
            <Clock size={12} /> {overdue} vencida{overdue === 1 ? '' : 's'}
          </span>
        )}
      </span>
      <button
        type="button"
        className={`board-tile__star ${board.starred ? 'is-on' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          updateBoard(boardId, { starred: !board.starred });
        }}
        aria-label={board.starred ? 'Quitar de favoritos' : 'Marcar como favorito'}
        title={board.starred ? 'Quitar de favoritos' : 'Marcar como favorito'}
      >
        <Star size={16} />
      </button>
      <button
        type="button"
        className="board-tile__more"
        onClick={(e) => {
          e.stopPropagation();
          openMenuAt(e.currentTarget, () => boardTileMenu(boardId));
        }}
        aria-label="Opciones del tablero"
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

export function HomePage() {
  const order = useStore((s) => s.data.boardOrder);
  const boards = useStore((s) => s.data.boards);
  const mode = usePersist((s) => s.mode);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const starred = order.filter((id) => boards[id]?.starred);

  return (
    <div className="home">
      <Upcoming />
      {starred.length > 0 && (
        <section className="home__section">
          <h2>
            <Star size={18} /> Favoritos
          </h2>
          <div className="board-grid">
            {starred.map((id) => (
              <BoardTile key={id} boardId={id} />
            ))}
          </div>
        </section>
      )}
      <section className="home__section">
        <h2>
          <LayoutDashboard size={18} /> Tus tableros
        </h2>
        <div className="board-grid">
          {order.map((id) => (
            <BoardTile key={id} boardId={id} />
          ))}
          <button type="button" className="board-tile board-tile--new" onClick={(e) => setAnchor(e.currentTarget)}>
            <Plus size={18} /> Crear tablero
          </button>
        </div>
      </section>
      <section className="home__section home__tools">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const id = await importFromFile();
            if (id) navigate({ boardId: id });
          }}
        >
          <Upload size={16} /> Importar desde Trello o copia
        </button>
        <button type="button" className="btn" onClick={exportAll}>
          <Download size={16} /> Exportar copia de seguridad
        </button>
        <p className="muted small">
          {mode === 'server'
            ? 'Tus datos se guardan en el servidor y se sincronizan entre tus dispositivos, con copias de seguridad automáticas cada hora.'
            : 'Tus datos se guardan en este navegador. Exporta copias de seguridad de vez en cuando.'}{' '}
          Sin límites de tableros, listas, tarjetas ni etiquetas.
        </p>
      </section>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} title="Crear tablero">
          <CreateBoardForm
            onCreated={(id) => {
              setAnchor(null);
              navigate({ boardId: id });
            }}
          />
        </Popover>
      )}
    </div>
  );
}
