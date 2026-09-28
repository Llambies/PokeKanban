import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { login } from '../../store/persistence';
import { useStore } from '../../store/store';

export function LoginScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Data already on screen means the session expired mid-use: nothing is lost, it is saved after login.
  const expired = useStore((s) => s.ready);

  return (
    <div className="login">
      <form
        className="login__card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!password || busy) return;
          setBusy(true);
          const message = await login(password);
          setBusy(false);
          if (message) {
            setError(message);
            setPassword('');
          }
        }}
      >
        <div className="login__brand">
          <svg viewBox="0 0 32 32" width="40" height="40" aria-hidden>
            <circle cx="16" cy="16" r="14" fill="#fff" stroke="#1d2125" strokeWidth="1.5" />
            <path d="M2 16a14 14 0 0 1 28 0z" fill="#ef4444" />
            <rect x="2" y="14.5" width="28" height="3" fill="#1d2125" />
            <circle cx="16" cy="16" r="5" fill="#fff" stroke="#1d2125" strokeWidth="3" />
          </svg>
          <h1>PokeKanban</h1>
        </div>
        <p className="login__hint">
          {expired
            ? 'Tu sesión ha caducado. Vuelve a entrar: los cambios pendientes se guardarán en cuanto lo hagas.'
            : 'Introduce tu contraseña para ver tus tableros.'}
        </p>
        <label className="field-label" htmlFor="login-password">
          Contraseña
        </label>
        <input
          id="login-password"
          className="input"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={!password || busy}>
          <LockKeyhole size={16} /> {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted small">La sesión se mantiene 90 días en este dispositivo.</p>
      </form>
    </div>
  );
}
