# PokeKanban

Tablero Kanban **personal** al estilo Trello, pensado para una sola persona y **sin límites**:
tableros, listas, tarjetas, etiquetas, checklists y vistas ilimitadas, sin cuentas ni colaboración.
Los datos son tuyos: se guardan en un archivo JSON en tu máquina (o en el navegador).

## Funciones

**Clic derecho en todas partes (ajustes rápidos)**
- **Tarjeta**: etiquetas (con casillas), portada de color o imagen, fechas rápidas (hoy, mañana, lunes, +1 semana…),
  prioridad, mover a otra lista o tablero, duplicar, convertir en separador, usar como plantilla, copiar enlace, archivar, eliminar.
- **Lista**: color de cabecera (solo cabecera o columna completa), límite WIP, contraer, ordenar tarjetas,
  mover todas las tarjetas, archivar todas, copiar, mover a otro tablero, archivar, eliminar.
- **Fondo del tablero**: añadir lista, fondo, etiquetas, filtros, archivados, vista, contraer todas, etiquetas compactas, exportar.
- **Elemento de checklist**: subtarea, sangría, mover, fecha, convertir en tarjeta, eliminar.
- Mayús + clic derecho abre el menú normal del navegador. En móvil, mantén pulsado o usa el botón «…».

**Etiquetas y colores**
- Etiquetas ilimitadas con **30 colores** (claro / normal / oscuro) e **icono** (130+ iconos o cualquier emoji).
- **Cabeceras de lista de color**, con opción de teñir toda la columna.
- **Portadas** de tarjeta (franja o tarjeta completa, color o imagen por URL).
- **Separadores**: tarjetas que se muestran como cabeceras de color dentro de una lista.
- 17 fondos de tablero (degradados y colores) + color personalizado.

**Sub-checklists**
- Checklists con **subtareas anidadas hasta 5 niveles**.
- Tab / Mayús+Tab para cambiar de nivel mientras escribes, Enter para crear el siguiente, Alt+↑/↓ para mover.
- Marcar un padre marca todas sus subtareas; el progreso cuenta las subtareas finales.
- Arrastrar y soltar elementos (también entre checklists de la misma tarjeta), plegar/desplegar ramas.
- Fecha por elemento (aparece en el calendario), «convertir en tarjeta», ocultar completados, copiar un checklist de otra tarjeta.

**Y además**
- Arrastrar y soltar tarjetas y listas (ratón y teclado), desplazar el tablero arrastrando el fondo.
- Vistas de **Tablero**, **Tabla** (ordenable) y **Calendario** (arrastra tarjetas a un día para ponerles fecha).
- Fechas de inicio y vencimiento con hora opcional, prioridad, descripción en Markdown, enlaces, notas.
- **Deshacer / rehacer** cualquier cambio (Ctrl+Z / Ctrl+Y).
- Filtros por texto, etiquetas, fechas y prioridad. Búsqueda global (/ o Ctrl+K).
- Plantillas de tarjeta, archivo con restauración, favoritos, duplicar tableros.
- Atajos de teclado estilo Trello sobre la tarjeta bajo el ratón (Enter, T, 1…9, D, C, Supr). Pulsa `?` para verlos todos.
- Tema claro / oscuro / automático.
- **Importar desde Trello** (JSON exportado desde *Menú → Imprimir, exportar y compartir → Exportar como JSON*),
  exportar/importar copias de seguridad y tableros sueltos.

## Puesta en marcha

Requiere Node.js 20.19 o superior.

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

Los datos se guardan en `data/pokekanban.json`, con una copia diaria en `data/backups/` (se conservan 30 días).

Para desarrollo (recarga en caliente, mismo almacenamiento en `data/`):

```bash
npm run dev        # http://localhost:5173
```

### Variables de entorno

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3000` | Puerto del servidor |
| `HOST` | `127.0.0.1` | Usa `0.0.0.0` para acceder desde otros dispositivos de tu red |
| `POKEKANBAN_DATA_DIR` | `./data` | Carpeta de datos y copias de seguridad |
| `POKEKANBAN_PASSWORD` | _(vacía)_ | Si se define, pide contraseña (HTTP Basic, cualquier usuario). Recomendado si lo expones fuera de casa, siempre detrás de HTTPS |

### Docker

```bash
docker build -t pokekanban .
docker run -d -p 3000:3000 -v pokekanban-data:/data --name pokekanban pokekanban
```

### Sin servidor

`dist/` también funciona como web estática (GitHub Pages, un NAS, abrirlo localmente con cualquier servidor estático).
En ese caso los datos se guardan en el `localStorage` del navegador: exporta copias de seguridad de vez en cuando.

## Sincronización entre dispositivos

Con el servidor, cada guardado lleva un número de revisión. Si cambias datos desde dos dispositivos a la vez,
la app te avisa y te deja elegir qué versión conservar en vez de sobrescribir en silencio. Al volver a una pestaña
se cargan automáticamente los cambios hechos desde otro dispositivo.

## Tests

```bash
npm test                          # tests unitarios (vitest)
npm run build && npm run test:e2e # test de extremo a extremo con Chromium (playwright-core)
```

## Estructura

```
server/          servidor Node sin dependencias (estáticos + API JSON) y API compartida con Vite
src/types.ts     modelo de datos
src/store/       estado (zustand + immer, con historial para deshacer), persistencia, normalización
src/lib/         utilidades: colores, iconos, fechas, árbol de checklists, filtros, importador de Trello…
src/components/  interfaz (menú contextual, tablero, tarjeta, vistas, diálogos)
```
