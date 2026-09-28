import { TriangleAlert } from 'lucide-react';
import { resolveConflict, usePersist } from '../../store/persistence';

export function ConflictBanner() {
  const status = usePersist((s) => s.status);
  if (status !== 'conflict') return null;
  return (
    <div className="banner banner--warning" role="alert">
      <TriangleAlert size={18} />
      <span>
        Los datos se han modificado desde otra pestaña o dispositivo. ¿Qué versión quieres conservar?
      </span>
      <button type="button" className="btn btn--sm" onClick={() => resolveConflict('server')}>
        Cargar la del servidor
      </button>
      <button type="button" className="btn btn--sm btn--danger" onClick={() => resolveConflict('mine')}>
        Sobrescribir con la mía
      </button>
    </div>
  );
}
