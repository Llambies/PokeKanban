import { useState } from 'react';
import { getBoardBackground } from '../../lib/backgrounds';
import { BackgroundPicker } from '../common/BackgroundPicker';
import { createBoard } from '../../store/store';

export function CreateBoardForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [background, setBackground] = useState('ocean');
  const [withLists, setWithLists] = useState(true);
  return (
    <form
      className="create-board"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onCreated(createBoard(title, background, withLists));
      }}
    >
      <div className="create-board__preview" style={{ background: getBoardBackground(background).css }}>
        <span />
        <span />
        <span />
      </div>
      <div className="field-label">Fondo</div>
      <BackgroundPicker value={background} onChange={setBackground} allowImage />
      <label className="field-label" htmlFor="new-board-title">
        Título del tablero
      </label>
      <input id="new-board-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Ej.: Proyectos personales" />
      <label className="checkbox-row">
        <input type="checkbox" checked={withLists} onChange={(e) => setWithLists(e.target.checked)} />
        Empezar con listas Pendiente / En curso / Hecho
      </label>
      <button type="submit" className="btn btn--primary btn--block" disabled={!title.trim()}>
        Crear tablero
      </button>
    </form>
  );
}
