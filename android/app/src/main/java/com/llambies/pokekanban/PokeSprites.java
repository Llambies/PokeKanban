package com.llambies.pokekanban;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Pokémon icons ("poke:25") from the PokeAPI sprites repository, same images as the web app (see
 * shared/pokemon.js). Downloaded once into the cache and cropped to the Pokémon so they read well
 * at widget and notification sizes.
 */
final class PokeSprites {

    private static final String SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
    private static final int MAX_PREFETCH = 60;

    private PokeSprites() {}

    /** Sprite key of an icon value ("poke:25", "poke:10091", "poke:201-b"), or null. */
    static String keyOf(String icon) {
        if (icon == null || !icon.startsWith("poke:")) return null;
        String key = icon.substring(5);
        return key.matches("\\d+(-[a-z0-9-]+)?") ? key : null;
    }

    private static File file(Context ctx, String key) {
        File dir = new File(ctx.getCacheDir(), "pokemon");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, key + ".png");
    }

    /** Makes sure the sprite is cached (network: call it off the main thread). */
    static boolean fetch(Context ctx, String key) {
        File target = file(ctx, key);
        if (target.exists() && target.length() > 0) return true;
        // The menu icon when there is one, otherwise the regular sprite (as the web app does).
        return download(SPRITES + "/versions/generation-viii/icons/" + key + ".png", target)
            || download(SPRITES + "/" + key + ".png", target);
    }

    private static boolean download(String url, File target) {
        HttpURLConnection conn = null;
        File tmp = new File(target.getPath() + ".tmp");
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) return false;
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            }
            return tmp.renameTo(target);
        } catch (Exception e) {
            tmp.delete();
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** The cached sprite cropped to the Pokémon, centered in a square of `size` px, or null. */
    static Bitmap bitmap(Context ctx, String key, int size) {
        File source = file(ctx, key);
        if (!source.exists()) return null;
        Bitmap sprite = BitmapFactory.decodeFile(source.getPath());
        if (sprite == null) return null;
        int w = sprite.getWidth();
        int h = sprite.getHeight();
        int[] pixels = new int[w * h];
        sprite.getPixels(pixels, 0, w, 0, 0, w, h);
        int x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if ((pixels[y * w + x] >>> 24) <= 10) continue;
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x);
                y1 = Math.max(y1, y);
            }
        }
        if (x1 < 0) return null;
        Bitmap cropped = Bitmap.createBitmap(sprite, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        float scale = (float) size / Math.max(cropped.getWidth(), cropped.getHeight());
        // No filtering: pixel art stays crisp.
        Bitmap scaled = Bitmap.createScaledBitmap(
            cropped,
            Math.max(1, Math.round(cropped.getWidth() * scale)),
            Math.max(1, Math.round(cropped.getHeight() * scale)),
            false
        );
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        new Canvas(out).drawBitmap(scaled, (size - scaled.getWidth()) / 2f, (size - scaled.getHeight()) / 2f, null);
        return out;
    }

    /** Caches the sprites used by the agenda and the reminders (network: off the main thread). */
    static void prefetch(Context ctx, JSONArray... lists) {
        int count = 0;
        for (JSONArray list : lists) {
            if (list == null) continue;
            for (int i = 0; i < list.length() && count < MAX_PREFETCH; i++) {
                JSONObject item = list.optJSONObject(i);
                String key = item == null ? null : keyOf(item.optString("icon", ""));
                if (key != null && fetch(ctx, key)) count++;
            }
        }
    }
}
