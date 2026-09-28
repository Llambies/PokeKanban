package com.llambies.pokekanban;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Schedules the stored reminders as exact alarms (they survive with the app closed). */
final class Reminders {

    private static final long HORIZON = 8L * 24 * 3600 * 1000;
    private static final long MAX_LATE = 10L * 60 * 1000;
    private static final int MAX_ALARMS = 150;

    private Reminders() {}

    static boolean canExact(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return ctx.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    private static PendingIntent alarmIntent(Context ctx, String id, JSONObject reminder, int flags) {
        Intent intent = new Intent(ctx, ReminderReceiver.class);
        intent.setData(Uri.parse("pokekanban://reminder/" + Uri.encode(id)));
        if (reminder != null) {
            intent.putExtra("id", id);
            intent.putExtra("title", reminder.optString("title", "PokeKanban"));
            intent.putExtra("body", reminder.optString("body", ""));
            intent.putExtra("url", reminder.optString("url", "#/calendar"));
        }
        return PendingIntent.getBroadcast(ctx, 0, intent, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static synchronized void schedule(Context ctx) {
        AlarmManager alarms = ctx.getSystemService(AlarmManager.class);
        for (String id : Store.scheduledIds(ctx)) {
            PendingIntent old = alarmIntent(ctx, id, null, PendingIntent.FLAG_NO_CREATE);
            if (old != null) {
                alarms.cancel(old);
                old.cancel();
            }
        }
        long now = System.currentTimeMillis();
        boolean exact = canExact(ctx);
        JSONArray list = Store.reminders(ctx);
        List<String> scheduled = new ArrayList<>();
        for (int i = 0; i < list.length() && scheduled.size() < MAX_ALARMS; i++) {
            JSONObject reminder = list.optJSONObject(i);
            if (reminder == null) continue;
            String id = reminder.optString("id", "");
            long at = reminder.optLong("at", 0);
            if (id.isEmpty() || at < now - MAX_LATE || at > now + HORIZON || Store.wasDelivered(ctx, id)) continue;
            PendingIntent pending = alarmIntent(ctx, id, reminder, PendingIntent.FLAG_UPDATE_CURRENT);
            long when = Math.max(at, now + 1000);
            try {
                if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
                else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
            } catch (SecurityException e) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
            }
            scheduled.add(id);
        }
        Store.setScheduledIds(ctx, scheduled);
    }
}
