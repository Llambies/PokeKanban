import { X } from 'lucide-react';
import { useUI } from '../../store/ui';
import { Modal } from '../common/Modal';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'General',
    items: [
      ['Ctrl + Z', 'Deshacer'],
      ['Ctrl + Y / Ctrl + Mayús + Z', 'Rehacer'],
      ['/ o Ctrl + K', 'Buscar'],
      ['?', 'Mostrar esta ayuda'],
      ['Esc', 'Cerrar ventana o menú'],
      ['Mayús + clic derecho', 'Menú nativo del navegador'],
    ],
  },
  {
    title: 'Tablero',
    items: [
      ['F', 'Abrir filtros'],
      ['X', 'Quitar filtros'],
      ['N', 'Nueva tarjeta (en la lista bajo el ratón)'],
      ['Clic derecho', 'Ajustes rápidos de tarjeta, lista o tablero'],
    ],
  },
  {
    title: 'Tarjeta bajo el ratón',
    items: [
      ['Enter / E', 'Abrir'],
      ['T', 'Editar título'],
      ['1 … 9', 'Poner / quitar etiqueta'],
      ['D', 'Duplicar'],
      ['C', 'Archivar'],
      ['Supr', 'Eliminar'],
    ],
  },
  {
    title: 'Checklists',
    items: [
      ['Enter', 'Guardar y crear otro elemento'],
      ['Tab / Mayús + Tab', 'Aumentar / reducir sangría'],
      ['Alt + ↑ / ↓', 'Mover elemento'],
      ['Ctrl + Enter', 'Guardar descripción o nota'],
    ],
  },
];

export function ShortcutsHelp() {
  const open = useUI((s) => s.shortcutsOpen);
  if (!open) return null;
  const close = () => useUI.setState({ shortcutsOpen: false });
  return (
    <Modal onClose={close} className="modal--small" labelledBy="shortcuts-title">
      <div className="modal__header">
        <h2 id="shortcuts-title">Atajos de teclado</h2>
        <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
          <X size={18} />
        </button>
      </div>
      <div className="shortcuts">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.items.map(([k, v]) => (
                <div key={k} className="shortcuts__row">
                  <dt>
                    {k.split(' / ').map((part, i) => (
                      <span key={part}>
                        {i > 0 && ' / '}
                        <kbd>{part}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
