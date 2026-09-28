import { useEffect, useState } from 'react';
import { AlarmClock, BellOff, BellRing, Send } from 'lucide-react';
import { disablePush, enablePush, needsHomeScreen, refreshPush, testPush, usePush } from '../../lib/push';
import { isNativeApp, Native, type NativeStatus } from '../../lib/native';
import { toast } from '../../store/ui';

/** Inside the Android app: native notifications with exact alarms. */
function NativeNotificationSettings() {
  const [status, setStatus] = useState<NativeStatus | null>(null);
  useEffect(() => {
    const refresh = () => void Native.status().then(setStatus).catch(() => {});
    refresh();
    // Coming back from the system settings screen.
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);
  if (!status) return null;
  return (
    <div className="notif-settings">
      <div className="field-label">Notificaciones de la app</div>
      {status.notifications ? (
        <p className="small notif-settings__on">
          <BellRing size={14} /> Activadas en este móvil
        </p>
      ) : (
        <>
          <p className="small muted">Permite las notificaciones para recibir los avisos aunque la app esté cerrada.</p>
          <button type="button" className="btn btn--primary btn--block" onClick={() => void Native.requestNotifications().then(setStatus)}>
            <BellRing size={15} /> Permitir notificaciones
          </button>
        </>
      )}
      {status.notifications && !status.exactAlarms && (
        <>
          <p className="small muted">Para que lleguen a la hora exacta, permite «Alarmas y recordatorios».</p>
          <button type="button" className="btn btn--sm" onClick={() => void Native.openExactAlarmSettings()}>
            <AlarmClock size={14} /> Abrir el ajuste
          </button>
        </>
      )}
      {status.notifications && (
        <div className="notif-settings__actions">
          <button type="button" className="btn btn--sm" onClick={() => void Native.test().then(() => toast('Notificación de prueba enviada'))}>
            <Send size={14} /> Enviar prueba
          </button>
        </div>
      )}
      <p className="small muted">
        {status.widgets > 0
          ? `Widget en la pantalla de inicio: ${status.widgets}.`
          : 'Añade el widget «Agenda de PokeKanban» manteniendo pulsada la pantalla de inicio → Widgets.'}
      </p>
    </div>
  );
}

export function NotificationSettings() {
  return isNativeApp() ? <NativeNotificationSettings /> : <WebNotificationSettings />;
}

function WebNotificationSettings() {
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
