import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, Trash2, X } from 'lucide-react';
import { confirmDialog, toast, useUI } from '../../store/ui';
import { claudeCommand, codexCommands, createKey, listKeys, mcpUrl, revokeKey, type ApiKey, type CreatedKey, type KeyScope } from '../../lib/apiKeys';
import { Modal } from '../common/Modal';

const SCOPES: Record<KeyScope, string> = { write: 'Lectura y escritura', read: 'Solo lectura' };

function when(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca';
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado');
  } catch {
    toast('No se pudo copiar: selecciónalo a mano');
  }
}

function Snippet({ title, text }: { title: string; text: string }) {
  return (
    <div className="api-keys__snippet">
      <div className="api-keys__snippet-head">
        <span className="field-label">{title}</span>
        <button type="button" className="btn btn--sm btn--subtle" onClick={() => void copy(text)}>
          <Copy size={13} /> Copiar
        </button>
      </div>
      <pre tabIndex={0}>{text}</pre>
    </div>
  );
}

function Body() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<KeyScope>('write');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listKeys().then(setKeys).catch((err: Error) => setError(err.message));
  }, []);
  useEffect(refresh, [refresh]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCreated(await createKey(name, scope));
      setName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la clave');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: ApiKey) => {
    const ok = await confirmDialog({
      title: `¿Revocar «${key.name}»?`,
      message: 'Los programas que la usen dejarán de poder entrar. No se puede deshacer.',
      confirmText: 'Revocar',
      danger: true,
    });
    if (!ok) return;
    try {
      await revokeKey(key.id);
      if (created?.id === key.id) setCreated(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revocar la clave');
    }
  };

  return (
    <div className="api-keys">
      <p className="small muted">
        Con una clave, agentes como Claude Code o Codex pueden leer y gestionar tus tableros, tarjetas y eventos por MCP
        (<code>{mcpUrl()}</code>). Guárdala como una contraseña: se muestra una sola vez.
      </p>

      {created && (
        <div className="api-keys__created" role="status">
          <div className="field-label">Clave «{created.name}» creada: cópiala ahora</div>
          <div className="api-keys__secret">
            <code>{created.key}</code>
            <button type="button" className="btn btn--sm" onClick={() => void copy(created.key)}>
              <Copy size={13} /> Copiar
            </button>
          </div>
          <Snippet title="Claude Code" text={claudeCommand(created.key)} />
          <Snippet title="Codex" text={codexCommands(created.key)} />
          <button type="button" className="btn btn--sm btn--subtle" onClick={() => setCreated(null)}>
            Ya la he guardado
          </button>
        </div>
      )}

      <form className="api-keys__form" onSubmit={create}>
        <label className="sr-only" htmlFor="api-key-name">Nombre de la clave</label>
        <input
          id="api-key-name"
          className="input"
          placeholder="Nombre (p. ej. Claude Code del portátil)"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="sr-only" htmlFor="api-key-scope">Permisos</label>
        <select id="api-key-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value as KeyScope)}>
          {Object.entries(SCOPES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
          <Plus size={15} /> Crear clave
        </button>
      </form>
      {error && <p className="small login__error" role="alert">{error}</p>}

      <div className="field-label">Claves activas</div>
      {keys === null && !error && <p className="small muted">Cargando…</p>}
      {keys?.length === 0 && <p className="small muted">Todavía no has creado ninguna clave.</p>}
      <ul className="api-keys__list">
        {keys?.map((key) => (
          <li key={key.id} className="api-keys__item">
            <KeyRound size={16} aria-hidden />
            <div className="api-keys__info">
              <strong>{key.name}</strong>
              <span className="small muted">
                {SCOPES[key.scope]} · <code>{key.prefix}…</code> · creada {when(key.createdAt)} · último uso {when(key.lastUsedAt)}
              </span>
            </div>
            <button type="button" className="btn btn--sm btn--danger-text" onClick={() => void revoke(key)}>
              <Trash2 size={13} /> Revocar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApiKeysDialog() {
  const open = useUI((s) => s.apiKeysOpen);
  if (!open) return null;
  const close = () => useUI.setState({ apiKeysOpen: false });
  return (
    <Modal onClose={close} className="modal--small" labelledBy="api-keys-title">
      <div className="modal__header">
        <h2 id="api-keys-title">Claves de API (agentes)</h2>
        <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>
      <Body />
    </Modal>
  );
}
