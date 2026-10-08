# PokeKanban

Tablero Kanban **personal** al estilo Trello, pensado para una sola persona y **sin límites**:
tableros, listas, tarjetas, etiquetas, checklists y vistas ilimitadas, sin cuentas ni colaboración.
Incluye un **calendario** con eventos periódicos, cumpleaños y fechas límite con **notificaciones**,
y una **app Android** con widget de agenda.
Los datos son tuyos: se guardan en un archivo JSON en tu máquina, en tu cuenta de Cloudflare o en el navegador.

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
- Etiquetas ilimitadas con **30 colores** (claro / normal / oscuro) e **icono**: 130+ iconos, cualquier emoji o
  **cualquiera de los 1025 Pokémon y sus ~490 formas** (regionales de Alola, Galar, Hisui y Paldea, megaevoluciones,
  Gigamax, Unown, Vivillon, Alcremie…), con iconos de [PokeAPI](https://pokeapi.co), búsqueda por nombre o número,
  atajos por región o tipo de forma, uno al azar y botón ✨ para elegir su **versión shiny**.
  Los mismos iconos sirven para los eventos del calendario, el widget de Android y sus notificaciones.
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

**Calendario** (botón «Calendario» de la cabecera)
- Tipos: **evento** (con hora de inicio y fin o todo el día, varios días, ubicación), **cumpleaños** y
  **aniversario** (cada año, muestran la edad), **fecha límite** y **recordatorio** (se marcan como hechos).
- **Repeticiones**: cada día, días laborables, cada semana (uno o varios días), cada 2 semanas, cada mes
  (el día 15, el segundo martes o el último viernes), cada año o personalizada (cada N días/semanas/meses/años),
  con fin en una fecha o tras N veces. Al editar un evento periódico eliges: solo este, este y los siguientes o todos.
- **Colores, iconos y etiquetas** propias del calendario (Personal, Trabajo, Familia, Salud, Pagos… editables).
- **Avisos** por evento (a la hora, 5 min, 1 h, 1 día, 1 semana antes o personalizados) y, si quieres, de las
  tarjetas con fecha de vencimiento.
- Vistas **Mes** (con panel del día), **Semana** (rejilla por horas) y **Agenda**; las tarjetas con fecha de
  los tableros también aparecen. Arrastra para cambiar de día u hora; en la semana se ve la hora nueva antes
  de soltar, los bordes de arriba y abajo de un evento cambian cuándo empieza y termina, y arrastrar en un
  hueco crea un evento con esa duración (con ratón). Zoom fluido de las horas con Ctrl + rueda, pellizcando
  (pantalla táctil o touchpad), las lupas de la esquina o − / +: del día completo (de 00 a 24 sin scroll) a
  horas bien altas. Clic derecho para cambiar color, icono,
  etiquetas, avisos, moverlo o borrarlo. Filtros por tipo, etiqueta y texto. «Próximos días» en el inicio.
- **Notificaciones**: *Calendario → Ajustes → Activar notificaciones* en cada dispositivo (Chrome, Edge,
  Firefox, Android; en iPhone hay que añadir antes la web a la pantalla de inicio). El servidor las envía a su
  hora aunque la app esté cerrada.

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

## App Android

La app para Android es la misma web dentro de una app (Capacitor, carpeta `android/`), con extras nativos:

- **Widget «Agenda de PokeKanban»** para la pantalla de inicio: próximos eventos, cumpleaños, fechas límite y
  tarjetas por días (los pendientes vencidos arriba). Tocar un elemento lo abre; `+` crea un evento.
- **Avisos a la hora exacta** con alarmas del sistema, incluso sin conexión y tras reiniciar el móvil.
  En *Calendario → Ajustes* se dan los permisos y se envía una notificación de prueba.
- Se sincroniza cada 30 minutos para recoger lo que cambies desde otros dispositivos.

**Instalarla**: abre en el móvil
[github.com/Llambies/PokeKanban/releases/download/android/PokeKanban.apk](https://github.com/Llambies/PokeKanban/releases/download/android/PokeKanban.apk),
instala el APK (Android pedirá permitir apps de origen desconocido), ábrela e inicia sesión. Para el widget:
mantén pulsada la pantalla de inicio → *Widgets* → *PokeKanban*.

Como la app carga `https://kanban.llambies.com`, los cambios de la web no necesitan un APK nuevo. El APK se
compila con GitHub Actions (`.github/workflows/android.yml`) cuando cambia la parte nativa, o a mano desde
*Actions → App Android → Run workflow*. Para usar otro dominio, cambia `server.url` en `capacitor.config.json`
y `server_url` en `android/app/src/main/res/values/strings.xml`.

Firma: todas las versiones se firman con la misma clave para que se instalen encima de la anterior. Por defecto
es `android/app/pokekanban.keystore` (incluida en el repositorio, por lo que no es secreta). Para usar una clave
privada, añade en GitHub *Settings → Secrets and variables → Actions* los secretos `POKEKANBAN_KEYSTORE_BASE64`
(el archivo `.keystore` en base64), `POKEKANBAN_KEYSTORE_PASSWORD` y `POKEKANBAN_KEY_ALIAS` (al cambiar de clave
hay que desinstalar la versión anterior una vez).

El widget usa los mismos iconos que la app: `npm run android:icons` convierte los iconos de Lucide que ofrece
el selector (`src/lib/icons.tsx`) en vectores de Android (`android/app/src/main/res/drawable/lucide_*.xml`).
Vuelve a ejecutarlo si añades iconos al selector. La lista de Pokémon y formas (nombres en español y recorte de cada
icono, `shared/pokemon-data.js`) se genera con `npm run pokemon:data` a partir de los datos de PokeAPI; ejecútalo
cuando salgan Pokémon nuevos.

Pokémon y sus nombres son marcas de Nintendo, Game Freak y The Pokémon Company; los iconos proceden del
repositorio de sprites de PokeAPI y se usan solo como iconos personales.

Para compilarla en tu ordenador (Android Studio o SDK de Android y JDK 21):

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease   # android/app/build/outputs/apk/release/app-release.apk
```

## Sincronización entre dispositivos

Con el servidor, cada guardado lleva un número de revisión. Si cambias datos desde dos dispositivos a la vez,
la app te avisa y te deja elegir qué versión conservar en vez de sobrescribir en silencio. Al volver a una pestaña
se cargan automáticamente los cambios hechos desde otro dispositivo (y cada 30 segundos con la pestaña visible).

## Agentes (Claude Code, Codex…)

El servidor incluye un servidor **MCP** (`/api/mcp`) con un CRUD completo de tableros, listas, etiquetas, tarjetas
(checklists, comentarios, campos personalizados, archivar, mover) y eventos del calendario (repeticiones, avisos,
marcar como hechos). Las claves se gestionan desde la web: *Ajustes → Claves de API (agentes)*. Al crear una se muestra
una sola vez, junto con el comando listo para copiar; en el servidor solo se guarda su hash y se puede revocar en cualquier momento.
Cada clave es de **lectura y escritura** o de **solo lectura**.

```bash
# Claude Code
claude mcp add --transport http pokekanban https://kanban.llambies.com/api/mcp --header "Authorization: Bearer pk_…"
# Codex
export POKEKANBAN_API_KEY=pk_…
codex mcp add pokekanban --url https://kanban.llambies.com/api/mcp --bearer-token-env-var POKEKANBAN_API_KEY
```

Las mismas herramientas están disponibles como JSON simple: `GET /api/agent` las lista y
`POST /api/agent/<herramienta>` con los argumentos en el cuerpo ejecuta una (cabecera `Authorization: Bearer pk_…`).
Los cambios se guardan como cualquier otro (con copias horarias) y la web los recoge sola. Las herramientas están en `server/agent.mjs`.

## Tests

```bash
npm test                          # tests unitarios (vitest)
npm run build && npm run test:e2e # test de extremo a extremo con Chromium (playwright-core)
```

## Estructura

```
server/          núcleo de la API (compartido por Node y Cloudflare), herramientas MCP para agentes, servidor Node, disco y Web Push
worker/          Worker de Cloudflare (Durable Object para los datos y alarmas para los avisos)
shared/          motor del calendario (repeticiones, avisos, agenda) usado por la web, el servidor y el widget
android/         app Android (Capacitor): widget, alarmas y sincronización en segundo plano
src/types.ts     modelo de datos
src/store/       estado (zustand + immer, con historial para deshacer), persistencia, normalización
src/lib/         utilidades: colores, iconos, fechas, árbol de checklists, filtros, importador de Trello…
src/components/  interfaz (menú contextual, tablero, tarjeta, vistas, diálogos)
```
