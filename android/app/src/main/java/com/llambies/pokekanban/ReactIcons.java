package com.llambies.pokekanban;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Iterator;
import org.json.JSONObject;

/**
 * Icons from react-icons ("ri:tb:TbFlame"). The widget can't draw their SVG, so the web app sends them
 * as white PNGs (src/lib/native.ts) and they're kept here; the agenda synced from the server while
 * the app is closed reuses them.
 */
final class ReactIcons {

    private ReactIcons() {}

    private static File file(Context ctx, String icon) {
        File dir = new File(ctx.getFilesDir(), "react-icons");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, icon.replaceAll("[^A-Za-z0-9]", "_") + ".png");
    }

    /** Saves the icons sent by the app: { "ri:tb:TbFlame": "<PNG in base64>" }. */
    static void save(Context ctx, JSONObject icons) {
        Iterator<String> keys = icons.keys();
        while (keys.hasNext()) {
            String icon = keys.next();
            if (!icon.startsWith("ri:")) continue;
            File target = file(ctx, icon);
            if (target.exists() && target.length() > 0) continue;
            File tmp = new File(target.getPath() + ".tmp");
            try (OutputStream out = new FileOutputStream(tmp)) {
                out.write(Base64.decode(icons.optString(icon, ""), Base64.DEFAULT));
            } catch (Exception e) {
                tmp.delete();
                continue;
            }
            if (!tmp.renameTo(target)) tmp.delete();
        }
    }

    /** The saved icon, or null if the app hasn't sent it yet. */
    static Bitmap bitmap(Context ctx, String icon) {
        if (icon == null || !icon.startsWith("ri:")) return null;
        File source = file(ctx, icon);
        return source.exists() ? BitmapFactory.decodeFile(source.getPath()) : null;
    }
}
