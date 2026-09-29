// End-to-end smoke test: builds nothing, expects `dist/` (run `npm run build` first).
// Starts the production server on a free port with a temporary data dir and drives
// the app with Playwright's Chromium.
//
//   npm run build && npm run test:e2e
//
// Set CHROMIUM_PATH if Chromium is not at the default Playwright location.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokekanban-e2e-'));
const shotsDir = process.env.SHOTS_DIR;

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined;
  const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  return dir ? path.join(base, dir, 'chrome-linux', 'chrome') : undefined;
}

let failures = 0;
function check(cond, message) {
  if (cond) console.log(`  ✓ ${message}`);
  else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

const port = await freePort();
const server = spawn(process.execPath, [path.join(root, 'server/index.mjs')], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', POKEKANBAN_DATA_DIR: dataDir },
  stdio: 'pipe',
});
await new Promise((resolve) => server.stdout.once('data', resolve));
const base = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = async (name) => shotsDir && page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
const apiRev = async () => (await (await fetch(`${base}api/meta`)).json()).rev;
const waitSaved = () => page.waitForSelector('.save-status--saved', { timeout: 5000 });

try {
  console.log('Inicio');
  await page.goto(base);
  await page.waitForSelector('.board-tile');
  check((await page.locator('.board-grid .board-tile').count()) >= 1, 'muestra el tablero de ejemplo');
  await waitSaved();
  check((await apiRev()) >= 1, 'el servidor guarda los datos iniciales');

  console.log('Tablero');
  await page.locator('.board-tile', { hasText: 'Mi primer tablero' }).first().click();
  await page.waitForSelector('.list');
  check((await page.locator('.list').count()) === 3, 'tiene 3 listas');

  // Add a card with the composer.
  const todo = page.locator('.list', { hasText: 'Pendiente' });
  await todo.locator('.list__add-btn').click();
  await page.keyboard.type('Tarjeta de prueba');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const newCard = page.locator('.card-tile', { hasText: 'Tarjeta de prueba' });
  check((await newCard.count()) === 1, 'añade una tarjeta con el compositor');

  // Right click -> labels submenu -> toggle "Urgente".
  await newCard.click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Etiquetas' }).hover();
  await page.locator('.ctx-menu').nth(1).locator('.ctx-item', { hasText: 'Urgente' }).click();
  await page.keyboard.press('Escape');
  check((await newCard.locator('.label-chip', { hasText: 'Urgente' }).count()) === 1, 'clic derecho → etiqueta aplicada');

  // Right click -> priority.
  await newCard.click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Prioridad' }).hover();
  await page.locator('.ctx-menu').nth(1).locator('.ctx-item', { hasText: 'Urgente' }).click();
  check((await newCard.locator('.badge--priority', { hasText: 'Urgente' }).count()) === 1, 'clic derecho → prioridad');

  // Right click -> cover color (custom swatch item).
  await newCard.click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Portada' }).hover();
  await page.locator('.ctx-menu').nth(1).locator('.swatch[aria-label="Morado"]').click();
  await page.keyboard.press('Escape');
  check((await newCard.locator('.card-tile__cover').count()) === 1, 'clic derecho → portada de color');

  // Keyboard shortcut on hovered card: "2" toggles the 2nd label.
  await newCard.hover();
  await page.keyboard.press('2');
  check((await newCard.locator('.label-chip', { hasText: 'Importante' }).count()) === 1, 'atajo numérico pone etiqueta');

  // List header color via context menu.
  const doneList = page.locator('.list', { hasText: 'Hecho' });
  await doneList.locator('.list__header').click({ button: 'right', position: { x: 120, y: 12 } });
  await page.locator('.ctx-item', { hasText: 'Color de cabecera' }).hover();
  await page.locator('.ctx-menu').nth(1).locator('.swatch[aria-label="Rojo oscuro"]').click();
  await page.keyboard.press('Escape');
  const headerBg = await doneList.locator('.list__header').evaluate((el) => getComputedStyle(el).backgroundColor);
  check(headerBg === 'rgb(201, 55, 44)', `cabecera de lista coloreada (${headerBg})`);

  // Undo restores the previous header color.
  await page.mouse.click(1300, 700);
  await page.keyboard.press('Control+z');
  const undone = await doneList.locator('.list__header').evaluate((el) => getComputedStyle(el).backgroundColor);
  check(undone !== 'rgb(201, 55, 44)', 'Ctrl+Z deshace el cambio');
  await page.keyboard.press('Control+y');

  // Keyboard drag & drop: move the new card to "En curso".
  await newCard.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const doing = page.locator('.list', { hasText: 'En curso' });
  check((await doing.locator('.card-tile', { hasText: 'Tarjeta de prueba' }).count()) === 1, 'arrastrar tarjeta a otra lista');
  await shot('board');

  console.log('Tarjeta');
  await page.locator('.card-tile', { hasText: 'Tarjeta de prueba' }).click();
  await page.waitForSelector('.card-modal');
  await page.locator('.side-btn', { hasText: 'Checklist' }).click();
  await page.locator('.add-checklist button[type=submit]').click();
  const composer = page.locator('.cl-composer__input');
  await composer.waitFor();
  await page.keyboard.type('Padre');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Hijo 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hijo 2');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Nieto');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('Otro padre');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  // Wait for the save and read the structure back from the server.
  await waitSaved();
  const doc = await (await fetch(`${base}api/data`)).json();
  const saved = Object.values(doc.data.cards).find((c) => c.title === 'Tarjeta de prueba');
  const items = saved?.checklists[0]?.items ?? [];
  check(items.length === 2 && items[0].text === 'Padre' && items[1].text === 'Otro padre', 'dos elementos de primer nivel');
  check(items[0]?.children.map((c) => c.text).join(',') === 'Hijo 1,Hijo 2', 'subtareas con Tab');
  check(items[0]?.children[1]?.children[0]?.text === 'Nieto', 'sub-subtarea (3 niveles)');

  // Checking the parent checks every descendant.
  await page.locator('.cl-item', { hasText: 'Padre' }).first().locator('.cl-item__check').click();
  const checked = await page.locator('.cl-item.is-done').count();
  check(checked === 4, `marcar el padre marca sus subtareas (${checked})`);
  // Unchecking one leaf unchecks its ancestors.
  await page.locator('.cl-item', { hasText: 'Nieto' }).locator('.cl-item__check').click();
  const afterLeaf = await page.locator('.cl-item.is-done').count();
  check(afterLeaf === 1, `desmarcar una hoja desmarca los padres (${afterLeaf})`);
  // Upload an image: becomes an attachment and the card cover.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNgYGD4z8DAwMDAxMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.locator('.side-btn', { hasText: 'Adjunto' }).click();
  await page.locator('.attachment-form input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.attachment__thumb');
  check((await page.locator('.attachment', { hasText: 'foto.png' }).count()) === 1, 'sube un archivo adjunto');
  // The card already has a color cover, so the image doesn't replace it automatically.
  await page.locator('.attachment__cover-btn').click();
  check((await page.locator('.card-modal__cover.has-image').count()) === 1, 'imagen adjunta como portada');
  const src = await page.locator('.attachment__thumb').getAttribute('href');
  const fileRes = await fetch(base + src);
  check(fileRes.ok && (fileRes.headers.get('content-security-policy') ?? '').includes('sandbox'), 'el archivo se sirve aislado (CSP sandbox)');
  await shot('card');

  // Checklist item context menu -> convert to card.
  await page.locator('.cl-item', { hasText: 'Otro padre' }).click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Convertir en tarjeta' }).click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-modal', { state: 'detached' });
  check((await page.locator('.card-tile', { hasText: 'Otro padre' }).count()) === 1, 'elemento de checklist → tarjeta');

  console.log('Campos personalizados');
  check((await page.locator('.card-tile', { hasText: 'Planificar vacaciones' }).locator('.badge--option', { hasText: 'Grande' }).count()) === 1, 'el ejemplo muestra un campo desplegable');
  await page.click('button[aria-label="Menú del tablero"]');
  await page.locator('.menu-list__item', { hasText: 'Campos personalizados' }).click();
  await page.locator('.side-panel .btn', { hasText: 'Nuevo campo' }).click();
  await page.locator('#field-name').fill('Cliente');
  await page.locator('.field-editor button[type=submit]').click();
  check((await page.locator('.fields-manager__name', { hasText: 'Cliente' }).count()) === 1, 'crea un campo de texto');
  await page.keyboard.press('Escape');
  await page.locator('.card-tile', { hasText: 'Tarjeta de prueba' }).click();
  await page.waitForSelector('.card-modal');
  await page.locator('.custom-field', { hasText: 'Cliente' }).locator('input').fill('ACME');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-modal', { state: 'detached' });
  check((await page.locator('.card-tile', { hasText: 'Tarjeta de prueba' }).locator('.badge--field', { hasText: 'ACME' }).count()) === 1, 'el valor del campo aparece en la tarjeta');

  console.log('Regresiones de la revisión');
  await page.locator('.card-tile', { hasText: 'Tarjeta de prueba' }).click();
  await page.waitForSelector('.card-modal');
  const datesBtn = page.locator('.side-btn', { hasText: 'Fechas' });
  await datesBtn.click();
  const popBox = await page.locator('.popover').boundingBox();
  const btnBox = await datesBtn.boundingBox();
  check(Math.abs(popBox.y - (btnBox.y + btnBox.height + 6)) < 4 || popBox.y + popBox.height <= btnBox.y, `el popover se ancla al botón (${Math.round(popBox.x)},${Math.round(popBox.y)})`);
  await page.mouse.click(30, 700); // backdrop, outside the modal
  await page.waitForTimeout(100);
  check((await page.locator('.popover').count()) === 0 && (await page.locator('.card-modal').count()) === 1, 'clic fuera cierra el popover pero no la tarjeta');
  const item = page.locator('.cl-item', { hasText: 'Hijo 2' });
  await item.click({ button: 'right' });
  await page.waitForSelector('.ctx-menu');
  check(await page.evaluate(() => !!document.activeElement?.closest('.ctx-menu')), 'el menú contextual recibe el foco');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check((await page.locator('.cl-item.is-done', { hasText: 'Hijo 2' }).count()) === 1, 'flechas + Enter activan la opción del menú');
  await item.click({ button: 'right' });
  await page.keyboard.press('Escape');
  check((await page.locator('.ctx-menu').count()) === 0 && (await page.locator('.card-modal').count()) === 1, 'Esc cierra el menú sin cerrar la tarjeta');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-modal', { state: 'detached' });
  // The toast's "Deshacer" must not undo an unrelated later change.
  const victim = page.locator('.card-tile', { hasText: 'Arreglar la bici' });
  await victim.click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Archivar' }).click();
  await page.locator('.card-tile', { hasText: 'Otro padre' }).hover();
  await page.keyboard.press('3');
  await page.locator('.toast', { hasText: 'Tarjeta archivada' }).locator('.toast__action').click();
  check(
    (await page.locator('.card-tile', { hasText: 'Otro padre' }).locator('.label-chip', { hasText: 'Idea' }).count()) === 1,
    'el «Deshacer» de un aviso no deshace otro cambio posterior',
  );
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  check((await page.locator('.card-tile', { hasText: 'Arreglar la bici' }).count()) === 1, 'Ctrl+Z paso a paso recupera la tarjeta');

  console.log('Vistas');
  await page.locator('.board-header__btn', { hasText: 'Tabla' }).click();
  await page.waitForSelector('.data-table');
  check((await page.locator('.data-table tbody tr').count()) >= 5, 'vista de tabla');
  check((await page.locator('.data-table th', { hasText: 'Cliente' }).count()) === 1, 'la tabla muestra columnas de campos');
  await shot('table');
  await page.locator('.board-header__btn', { hasText: 'Calendario' }).click();
  await page.waitForSelector('.calendar__grid');
  check((await page.locator('.calendar__day').count()) === 42, 'vista de calendario');
  await shot('calendar');
  await page.locator('.board-header__btn', { hasText: 'Tablero' }).click();

  console.log('Filtros');
  await page.keyboard.press('f');
  await page.locator('#filter-text').fill('prueba');
  await page.waitForTimeout(100);
  check((await page.locator('.card-tile').count()) === 1, 'el filtro oculta tarjetas');
  await page.keyboard.press('Escape');
  await page.keyboard.press('x');
  check((await page.locator('.card-tile').count()) > 1, 'X quita los filtros');

  console.log('Seguridad API');
  const foreign = await fetch(`${base}api/data`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ baseRev: 0, data: {}, force: true }),
  });
  check(foreign.status === 403, `rechaza escrituras de otro origen (${foreign.status})`);
  const textPlain = await fetch(`${base}api/data`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ baseRev: 0, data: {}, force: true }),
  });
  check(textPlain.status === 415, `rechaza cuerpos que no son JSON (${textPlain.status})`);
  const post = await fetch(`${base}api/data`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check(post.status === 405, `solo PUT modifica los datos (${post.status})`);

  console.log('Persistencia');
  await waitSaved();
  await page.reload();
  await page.waitForSelector('.list');
  check((await page.locator('.card-tile', { hasText: 'Tarjeta de prueba' }).count()) === 1, 'los cambios sobreviven a recargar');
  check(fs.existsSync(path.join(dataDir, 'backups')), 'se crean copias de seguridad diarias');

  console.log('Calendario');
  await page.locator('.header-btn', { hasText: 'Calendario' }).click();
  await page.waitForSelector('.cal-page');
  await page.locator('.cal-toolbar__views button', { hasText: 'Mes' }).click();
  check((await page.locator('.cal-chip', { hasText: 'Gimnasio' }).count()) >= 2, 'el evento semanal de ejemplo aparece varias veces');
  // New weekly event.
  await page.locator('.cal-toolbar__actions .btn--primary').click();
  await page.locator('.ctx-item', { hasText: 'Evento' }).click();
  await page.fill('#event-title', 'Clase de inglés');
  await page.locator('.ev-repeat select').selectOption('weekly');
  await page.locator('.event-modal__foot button', { hasText: 'Crear' }).click();
  await page.waitForTimeout(200);
  const weekly = page.locator('.cal-chip', { hasText: 'Clase de inglés' });
  const weeklyCount = await weekly.count();
  check(weeklyCount >= 2, `crea un evento semanal (${weeklyCount} en la vista del mes)`);
  // Edit only one occurrence.
  await weekly.nth(1).click();
  await page.fill('#event-title', 'Clase de inglés (examen)');
  await page.locator('.event-modal__foot button', { hasText: 'Guardar' }).click();
  await page.locator('.choice', { hasText: 'Solo este' }).click();
  await page.waitForTimeout(200);
  check((await page.locator('.cal-chip', { hasText: 'Clase de inglés (examen)' }).count()) === 1, 'cambia solo una repetición');
  check((await page.locator('.cal-chip', { hasText: /Clase de inglés$/ }).count()) === weeklyCount - 1, 'las demás siguen igual');
  // Birthday from the day menu, with age.
  await page.locator('.cal-toolbar__views button', { hasText: 'Agenda' }).click();
  await page.waitForSelector('.cal-agenda');
  check((await page.locator('.agenda-row', { hasText: /Ana \(\d+\)/ }).count()) === 1, 'la agenda muestra el cumpleaños con la edad');
  await shot('calendar-agenda');
  // Delete the whole series from the context menu.
  await page.locator('.cal-toolbar__views button', { hasText: 'Mes' }).click();
  await page.locator('.cal-chip', { hasText: /Clase de inglés$/ }).first().click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Eliminar' }).click();
  await page.locator('.ctx-item', { hasText: 'Toda la serie' }).click();
  await page.waitForTimeout(200);
  check((await page.locator('.cal-chip', { hasText: /Clase de inglés$/ }).count()) === 0, 'elimina la serie desde el menú contextual');
  await waitSaved();
  const agendaApi = await (await fetch(`${base}api/agenda?days=14`)).json();
  check(Array.isArray(agendaApi.items) && agendaApi.items.some((i) => i.title === 'Gimnasio'), 'la API de agenda (widget) devuelve los eventos');
  // Android back button (the app calls window.pokekanbanBack): closes the innermost thing first.
  await page.locator('.cal-chip', { hasText: 'Gimnasio' }).first().click();
  await page.waitForSelector('.event-modal');
  check(await page.evaluate(() => window.pokekanbanBack()), 'atrás cierra el evento abierto');
  await page.waitForTimeout(200);
  check((await page.locator('.event-modal').count()) === 0 && page.url().includes('#/calendar'), 'y se queda en el calendario');
  check(await page.evaluate(() => window.pokekanbanBack()), 'atrás desde el calendario vuelve al inicio');
  await page.waitForSelector('.home-upcoming');
  check((await page.evaluate(() => window.pokekanbanBack())) === false, 'en el inicio, atrás deja salir de la app');
  await page.goto(base);
  await page.waitForSelector('.home-upcoming');
  check((await page.locator('.home-upcoming .agenda-row').count()) > 0, 'el inicio muestra los próximos días');

  console.log('Tema oscuro');
  await page.locator('button[aria-label="Ajustes"]').click();
  await page.locator('.ctx-item', { hasText: 'Oscuro' }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'cambia a tema oscuro');
  await shot('dark');

  console.log('Login con contraseña');
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokekanban-e2e-auth-'));
  const authPort = await freePort();
  const authServer = spawn(process.execPath, [path.join(root, 'server/index.mjs')], {
    env: { ...process.env, PORT: String(authPort), HOST: '127.0.0.1', POKEKANBAN_DATA_DIR: authDir, POKEKANBAN_PASSWORD: 'clave-e2e' },
    stdio: 'pipe',
  });
  await new Promise((resolve) => authServer.stdout.once('data', resolve));
  const authBase = `http://127.0.0.1:${authPort}/`;
  try {
    check((await fetch(`${authBase}api/data`)).status === 401, 'sin sesión la API responde 401');
    const authPage = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    authPage.on('pageerror', (e) => errors.push(e.message));
    await authPage.goto(authBase);
    await authPage.waitForSelector('#login-password');
    check((await authPage.locator('.board-tile').count()) === 0, 'muestra la pantalla de login');
    await authPage.fill('#login-password', 'mala');
    await authPage.keyboard.press('Enter');
    await authPage.waitForSelector('.login__error');
    check((await authPage.locator('.login__error').textContent()).includes('incorrecta'), 'contraseña incorrecta rechazada');
    await authPage.fill('#login-password', 'clave-e2e');
    await authPage.keyboard.press('Enter');
    await authPage.waitForSelector('.board-tile');
    check(true, 'entra con la contraseña correcta');
    await authPage.waitForSelector('.save-status--saved');
    await authPage.reload();
    await authPage.waitForSelector('.board-tile');
    check((await authPage.locator('#login-password').count()) === 0, 'la sesión se mantiene al recargar');
    await authPage.locator('button[aria-label="Ajustes"]').click();
    await authPage.locator('.ctx-item', { hasText: 'Cerrar sesión' }).click();
    await authPage.waitForSelector('#login-password');
    check(true, 'cerrar sesión vuelve al login');
    if (shotsDir) await authPage.screenshot({ path: path.join(shotsDir, 'login.png') });
    await authPage.close();
  } finally {
    authServer.kill();
    fs.rmSync(authDir, { recursive: true, force: true });
  }

  check(errors.length === 0, `sin errores en consola${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (err) {
  failures++;
  console.error(err);
  await shot('failure');
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodo OK');
process.exit(failures ? 1 : 0);
