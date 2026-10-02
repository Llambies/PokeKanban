import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { usePersist } from '../../store/persistence';
import { toast } from '../../store/ui';
import { uploadFile } from '../../lib/upload';
import { BOARD_BACKGROUNDS, getBoardBackground } from '../../lib/colors';
import { createBoard } from '../../store/store';

function BackgroundImage({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [url, setUrl] = useState(value.startsWith('image:') ? value.slice(6) : '');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploads = usePersist((s) => s.mode === 'server');
  return (
    <div className="bg-image">
      <div className="field-label">Imagen de fondo</div>
      {/* Not a <form>: this may live inside the "create board" form. */}
      <div className="inline-form">
        <input
          className="input input--sm"
          type="url"
          placeholder="https://…/foto.jpg"
          aria-label="URL de la imagen de fondo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (url.trim()) onChange(`image:${url.trim()}`);
            }
          }}
        />
        <button type="button" className="btn btn--sm" disabled={!url.trim()} onClick={() => onChange(`image:${url.trim()}`)}>
          Usar
        </button>
        {uploads && (
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => fileInput.current?.click()} title="Subir imagen">
            <Upload size={14} />
          </button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const up = await uploadFile(file);
            setUrl(up.url);
            onChange(`image:${up.url}`);
          } catch (err) {
            toast(err instanceof Error ? err.message : 'No se pudo subir la imagen');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function BackgroundGrid({ value, onChange, allowImage = false }: { value: string; onChange: (key: string) => void; allowImage?: boolean }) {
  const custom = value.startsWith('custom:') ? value.slice(7) : '#0c66e4';
  return (
    <>
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
    {allowImage && <BackgroundImage value={value} onChange={onChange} />}
    </>
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
      <BackgroundGrid value={background} onChange={setBackground} allowImage />
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
