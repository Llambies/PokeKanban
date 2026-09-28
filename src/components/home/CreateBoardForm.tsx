import { useState } from 'react';
import { BOARD_BACKGROUNDS, getBoardBackground } from '../../lib/colors';
import { createBoard } from '../../store/store';

export function BackgroundGrid({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const custom = value.startsWith('custom:') ? value.slice(7) : '#0c66e4';
  return (
    <div className="bg-grid">
      {BOARD_BACKGROUNDS.map((bg) => (
        <button
          key={bg.key}
          type="button"
          className={`bg-swatch ${value === bg.key ? 'is-selected' : ''}`}
          style={{ background: bg.css }}
          title={bg.name}
          aria-label={bg.name}
          aria-pressed={value === bg.key}
          onClick={() => onChange(bg.key)}
        />
      ))}
      <label className={`bg-swatch bg-swatch--custom ${value.startsWith('custom:') ? 'is-selected' : ''}`} title="Color personalizado" style={{ background: value.startsWith('custom:') ? custom : undefined }}>
        <input type="color" value={custom} onChange={(e) => onChange(`custom:${e.target.value}`)} aria-label="Color personalizado" />
        <span>+</span>
      </label>
    </div>
  );
}

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
      <BackgroundGrid value={background} onChange={setBackground} />
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
