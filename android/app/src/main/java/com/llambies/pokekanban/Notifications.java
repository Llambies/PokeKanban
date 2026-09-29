package com.llambies.pokekanban;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

final class Notifications {

    static final String CHANNEL = "reminders";

    private Notifications() {}

    static void createChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Avisos del calendario", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Eventos, cumpleaños, fechas límite y recordatorios");
        channel.enableVibration(true);
        ctx.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    static boolean allowed(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    /** Intent that opens the app on a route ("#/calendar?e=…"); `key` keeps PendingIntents apart. */
    static Intent openIntent(Context ctx, String route, String key) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("pokekanban://open/" + Uri.encode(key)));
        intent.putExtra(MainActivity.EXTRA_ROUTE, route);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    static void show(Context ctx, String id, String title, String body, String route) {
        show(ctx, id, title, body, route, null);
    }

    static void show(Context ctx, String id, String title, String body, String route, String icon) {
        if (!allowed(ctx)) return;
        createChannel(ctx);
        PendingIntent open = PendingIntent.getActivity(
            ctx,
            0,
            openIntent(ctx, route == null ? "#/calendar" : route, id),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_pokekanban)
            .setColor(0xFFEF4444)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(open);
        // An event with a Pokémon as its icon shows it (if already cached: no network here).
        int poke = PokeSprites.idOf(icon);
        if (poke > 0) {
            Bitmap sprite = PokeSprites.bitmap(ctx, poke, Math.round(64 * ctx.getResources().getDisplayMetrics().density));
            if (sprite != null) builder.setLargeIcon(sprite);
        }
        try {
            NotificationManagerCompat.from(ctx).notify(id.hashCode(), builder.build());
        } catch (SecurityException ignored) {
            // Permission revoked in the meantime.
        }
    }
}
