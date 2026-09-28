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
- 17 fondos de tablero (degradados y colores), color personalizado o imagen propia.

**Sub-checklists**
- Checklists con **subtareas anidadas hasta 5 niveles**.
- Tab / Mayús+Tab para cambiar de nivel mientras escribes, Enter para crear el siguiente, Alt+↑/↓ para mover.
- Marcar un padre marca todas sus subtareas; el progreso cuenta las subtareas finales.
- Arrastrar y soltar elementos (también entre checklists de la misma tarjeta), plegar/desplegar ramas.
- Fecha por elemento (aparece en el calendario), «convertir en tarjeta», ocultar completados, copiar un checklist de otra tarjeta.

**Campos personalizados** (de pago en Trello)
- Texto, número, casilla, fecha y desplegable con colores, definidos por tablero.
- Se editan en la tarjeta, se muestran como insignias, tienen columna en la vista de tabla y
  los desplegables/casillas se cambian desde el clic derecho.

**Adjuntos**
- Enlaces y archivos de hasta 25 MB (con el servidor): elige archivos, **pega imágenes con Ctrl+V** o
  **suéltalas sobre la tarjeta**. La primera imagen se usa como portada.

**Y además**
- Arrastrar y soltar tarjetas y listas (ratón y teclado), desplazar el tablero arrastrando el fondo.
- Vistas de **Tablero**, **Tabla** (ordenable) y **Calendario** (arrastra tarjetas a un día para ponerles fecha).
- Fechas de inicio y vencimiento con hora opcional, prioridad, descripción en Markdown, enlaces, notas.
- **Deshacer / rehacer** cualquier cambio (Ctrl+Z / Ctrl+Y).
- Filtros por texto, etiquetas, fechas y prioridad. Búsqueda global (/ o Ctrl+K).
- Plantillas de tarjeta, archivo con restauración, favoritos, duplicar tableros.
- Atajos de teclado estilo Trello sobre la tarjeta bajo el ratón (Enter, T, 1…9, D, C, Supr). Pulsa `?` para verlos todos.
- Tema claro / oscuro / automático.
- Instalable como aplicación (PWA): en Chrome/Edge, «Instalar PokeKanban» desde la barra de direcciones.
- **Importar desde Trello** (JSON exportado desde *Menú → Imprimir, exportar y compartir → Exportar como JSON*):
  listas, tarjetas, etiquetas, checklists, fechas, portadas, comentarios, enlaces y campos personalizados.
  También exportar/importar copias de seguridad completas y tableros sueltos.

## Puesta en marcha

Requiere Node.js 20.19 o superior.

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

Los datos se guardan en `data/pokekanban.json`. Antes del primer cambio de cada hora se guarda una copia del estado
anterior en `data/backups/` (se conservan todas las de las últimas 48 horas y una por día durante 30 días).
Los archivos adjuntos van a `data/uploads/`. Para hacer una copia completa basta con copiar la carpeta `data/`.

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
| `POKEKANBAN_PASSWORD` | _(vacía)_ | Si se define, la app pide esta contraseña (pantalla de login, sesión de 90 días). Recomendado si lo expones fuera de casa, siempre detrás de HTTPS |

### Docker

```bash
docker build -t pokekanban .
docker run -d -p 3000:3000 -v pokekanban-data:/data --name pokekanban pokekanban
```

### Cloudflare (recomendado para usarlo desde varios dispositivos)

Un Worker sirve la app y guarda los tableros en la nube de tu cuenta (un Durable Object con SQLite,
incluido en el plan gratuito), con login, copias de seguridad por hora y archivos adjuntos.
Lo que hagas en el móvil aparece en el ordenador y al revés.

1. En el panel de Cloudflare: **Workers & Pages → Crear → Importar un repositorio**, elige este
   repositorio y la rama. Deja el nombre del proyecto como `pokekanban` (debe coincidir con `wrangler.jsonc`).
2. Comando de compilación: `npm run build`. Comando de despliegue: `npx wrangler deploy`.
3. Cuando termine: **pokekanban → Ajustes → Variables y secretos → Añadir**, de tipo *secreto*,
   nombre `POKEKANBAN_PASSWORD` y tu contraseña. Sin ella la app no guarda nada (y te lo indica).
4. Abre la dirección `*.workers.dev` que te da Cloudflare y entra con esa contraseña.
5. Dominio propio: el Worker responde en `kanban.llambies.com` (declarado en `routes` de `wrangler.jsonc`;
   requiere que el dominio esté en la misma cuenta de Cloudflare). Para usar otro, cambia ese valor o quítalo.

Cada push a la rama vuelve a desplegar. Cambiar la contraseña cierra la sesión en todos los dispositivos.
Desde la terminal: `npx wrangler secret put POKEKANBAN_PASSWORD` y `npm run deploy:cloudflare`.
Para probar el Worker en local: crea `.dev.vars` con `POKEKANBAN_PASSWORD=...` y ejecuta `npm run dev:worker`.

Si solo quieres una versión sin servidor (cada navegador guarda sus propios datos), compila con
`npm run build:static` y publica `dist/` en cualquier hosting estático.

### Sin servidor

`dist/` también funciona como web estática (GitHub Pages, un NAS, abrirlo localmente con cualquier servidor estático).
En ese caso los datos se guardan en el `localStorage` del navegador (sin subida de archivos; los enlaces sí funcionan):
exporta copias de seguridad de vez en cuando.

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
server/          núcleo de la API (compartido por Node y Cloudflare), servidor Node y almacenamiento en disco
worker/          Worker de Cloudflare (Durable Object para los datos)
src/types.ts     modelo de datos
src/store/       estado (zustand + immer, con historial para deshacer), persistencia, normalización
src/lib/         utilidades: colores, iconos, fechas, árbol de checklists, filtros, importador de Trello…
src/components/  interfaz (menú contextual, tablero, tarjeta, vistas, diálogos)
```
