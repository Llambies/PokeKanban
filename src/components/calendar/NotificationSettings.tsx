import { useEffect } from 'react';
import { BellOff, BellRing, Send } from 'lucide-react';
import { disablePush, enablePush, needsHomeScreen, refreshPush, testPush, usePush } from '../../lib/push';
import { toast } from '../../store/ui';

export function NotificationSettings() {
  const { status, devices, error } = usePush();
  useEffect(() => {
    void refreshPush();
  }, []);

  return (
    <div className="notif-settings">
      <div className="field-label">Notificaciones en este dispositivo</div>
      {status === 'unsupported' && (
        <p className="small muted">
          {needsHomeScreen()
            ? 'En iPhone/iPad, primero añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde allí.'
            : 'Este navegador no admite notificaciones push (necesitan HTTPS).'}
        </p>
      )}
      {status === 'unavailable' && <p className="small muted">Los avisos los envía el servidor: no están disponibles en la versión sin servidor.</p>}
      {status === 'denied' && (
        <p className="small muted">
          Has bloqueado las notificaciones para esta web. Actívalas en los ajustes del navegador (icono del candado junto a la dirección →
          Notificaciones) y vuelve aquí.
        </p>
      )}
      {(status === 'off' || status === 'busy') && (
        <>
          <p className="small muted">Recibe los avisos de eventos, cumpleaños y fechas límite aunque la app esté cerrada.</p>
          <button type="button" className="btn btn--primary btn--block" disabled={status === 'busy'} onClick={() => void enablePush()}>
            <BellRing size={15} /> {status === 'busy' ? 'Activando…' : 'Activar notificaciones'}
          </button>
        </>
      )}
      {status === 'on' && (
        <>
          <p className="small notif-settings__on">
            <BellRing size={14} /> Activadas en este dispositivo
          </p>
          <div className="notif-settings__actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={async () => toast((await testPush()) ? 'Notificación de prueba enviada' : 'No se pudo enviar la prueba')}
            >
              <Send size={14} /> Enviar prueba
            </button>
            <button type="button" className="btn btn--sm btn--subtle" onClick={() => void disablePush()}>
              <BellOff size={14} /> Desactivar
            </button>
          </div>
        </>
      )}
      {error && <p className="small login__error">{error}</p>}
      {devices.length > 0 && (
        <p className="small muted">
          Dispositivos con avisos: {devices.join(', ')}
        </p>
      )}
    </div>
  );
}
