# PokeKanban: notas para Claude

La app, los textos de la interfaz y los mensajes de commit van en español. El README explica
las funciones, la puesta en marcha y la estructura del proyecto.

## Antes de hacer commit

- `npm run check` (typecheck + tests unitarios). Si cambia la lógica, añade o ajusta tests en `tests/unit/`.
- `npm run build` si tocas la interfaz o los estilos, para asegurarte de que compila.
- Test e2e: `npm run build && npm run test:e2e`. Necesita Chromium (lo busca en `CHROMIUM_PATH` o en
  `/opt/pw-browsers`). Si no hay ninguno, no lo instales: dilo en el resumen.
- Si git no tiene `user.name`/`user.email`, no los configures tú: deja los cambios preparados y pídeselo al usuario.

## Commit y push

- Se trabaja directamente en `claude/modest-lovelace-4v2v51`, que es la rama principal: no hay pull request.
- Mensaje de commit como los anteriores: un título en español y una lista con lo que cambia para el usuario.
- Cada push a esa rama despliega la web en Cloudflare (Workers Builds, worker `pokekanban`).

## Después del push: comprobar el despliegue

1. **Build de Cloudflare**: mira el check run del commit en GitHub (espera y repite si aún está en curso):
   ```bash
   gh api repos/Llambies/PokeKanban/commits/<sha>/check-runs \
     --jq '.check_runs[] | [.name, .status, .conclusion, .completed_at] | @tsv'
   ```
   Debe aparecer `Workers Builds: pokekanban` con `completed` y `success`. Si falla, el `details_url`
   lleva al log en el panel de Cloudflare.
2. **Web en producción**: compara los ficheros que sirve https://kanban.llambies.com con los de un
   `npm run build` local; los nombres llevan hash, así que deben coincidir:
   ```bash
   ls dist/assets
   curl -s https://kanban.llambies.com/ | grep -oE 'assets/[^"]+\.(js|css)'
   ```
   Para más seguridad, busca con `curl … | grep` algo propio del cambio (una clase CSS, un texto) en esos ficheros.
3. **App Android**: el workflow `App Android` (`.github/workflows/android.yml`) solo se ejecuta si cambian
   `android/**`, `capacitor.config.json`, `src/lib/native.ts` o el propio workflow, y publica el APK en la
   release `android`. La app carga kanban.llambies.com, así que los cambios web no necesitan APK nuevo.
   Si el cambio sí le afecta: `gh run list --workflow android.yml --limit 3`.

En el resumen final di el resultado de cada paso: build de Cloudflare, si la web ya sirve la versión nueva
y si hacía falta (y salió bien) el APK.
