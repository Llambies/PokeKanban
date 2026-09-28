package com.llambies.pokekanban;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** What the native side remembers between runs (agenda, reminders, session cookie…). */
final class Store {

    private static final String PREFS = "pokekanban";
    private static final int MAX_DELIVERED = 300;

    private Store() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String baseUrl(Context ctx) {
        String url = prefs(ctx).getString("baseUrl", null);
        if (url == null || url.isEmpty()) url = ctx.getString(R.string.server_url);
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    static void setBaseUrl(Context ctx, String url) {
        if (url != null && url.startsWith("http")) prefs(ctx).edit().putString("baseUrl", url).apply();
    }

    static String cookie(Context ctx) {
        return prefs(ctx).getString("cookie", null);
    }

    static void setCookie(Context ctx, String cookie) {
        if (cookie != null && !cookie.isEmpty()) prefs(ctx).edit().putString("cookie", cookie).apply();
    }

    /** Agenda as sent by the app or /api/agenda: { today, items: [...] }. */
    static JSONObject agenda(Context ctx) {
        try {
            return new JSONObject(prefs(ctx).getString("agenda", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void saveAgenda(Context ctx, String json) {
        prefs(ctx).edit().putString("agenda", json).putLong("agendaAt", System.currentTimeMillis()).apply();
    }

    /** Upcoming reminders: [{ at, id, title, body, url }]. */
    static JSONArray reminders(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString("reminders", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void saveReminders(Context ctx, String json) {
        prefs(ctx).edit().putString("reminders", json).apply();
    }

    static boolean needsLogin(Context ctx) {
        return prefs(ctx).getBoolean("needsLogin", false);
    }

    static void setNeedsLogin(Context ctx, boolean value) {
        prefs(ctx).edit().putBoolean("needsLogin", value).apply();
    }

    static List<String> scheduledIds(Context ctx) {
        return split(prefs(ctx).getString("scheduled", ""));
    }

    static void setScheduledIds(Context ctx, List<String> ids) {
        prefs(ctx).edit().putString("scheduled", String.join("\n", ids)).apply();
    }

    static synchronized boolean wasDelivered(Context ctx, String id) {
        return split(prefs(ctx).getString("delivered", "")).contains(id);
    }

    static synchronized void markDelivered(Context ctx, String id) {
        Set<String> ids = new LinkedHashSet<>(split(prefs(ctx).getString("delivered", "")));
        ids.add(id);
        List<String> list = new ArrayList<>(ids);
        if (list.size() > MAX_DELIVERED) list = list.subList(list.size() - MAX_DELIVERED, list.size());
        prefs(ctx).edit().putString("delivered", String.join("\n", list)).apply();
    }

    private static List<String> split(String text) {
        if (text == null || text.isEmpty()) return new ArrayList<>();
        return new ArrayList<>(Arrays.asList(text.split("\n")));
    }
}
