package com.llambies.pokekanban;

import android.content.Context;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Turns the stored agenda into widget rows: day headers followed by that day's items. */
final class Agenda {

    private static final String[] WEEKDAYS = { "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado" };
    private static final String[] MONTHS = {
        "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    };
    private static final int MAX_ROWS = 80;

    static final class Row {
        final String header;
        final JSONObject item;

        Row(String header, JSONObject item) {
            this.header = header;
            this.item = item;
        }
    }

    private Agenda() {}

    static String todayKey() {
        return key(Calendar.getInstance());
    }

    private static String key(Calendar c) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    private static Calendar parse(String key) {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(Integer.parseInt(key.substring(0, 4)), Integer.parseInt(key.substring(5, 7)) - 1, Integer.parseInt(key.substring(8, 10)));
        return c;
    }

    private static String capitalize(String text) {
        return text.isEmpty() ? text : text.substring(0, 1).toUpperCase(Locale.ROOT) + text.substring(1);
    }

    /** "lunes, 28 de septiembre". */
    static String longDate(String key) {
        Calendar c = parse(key);
        return WEEKDAYS[c.get(Calendar.DAY_OF_WEEK) - 1] + ", " + c.get(Calendar.DAY_OF_MONTH) + " de " + MONTHS[c.get(Calendar.MONTH)];
    }

    /** "Hoy", "Mañana", "Miércoles 30 de septiembre". */
    static String dayLabel(String key, String today) {
        Calendar day = parse(key);
        Calendar now = parse(today);
        long diff = Math.round((day.getTimeInMillis() - now.getTimeInMillis()) / 86400000.0);
        if (diff == 0) return "Hoy";
        if (diff == 1) return "Mañana";
        return capitalize(WEEKDAYS[day.get(Calendar.DAY_OF_WEEK) - 1] + " " + day.get(Calendar.DAY_OF_MONTH) + " de " + MONTHS[day.get(Calendar.MONTH)]);
    }

    static List<Row> rows(Context ctx) {
        List<Row> rows = new ArrayList<>();
        JSONArray items = Store.agenda(ctx).optJSONArray("items");
        if (items == null) return rows;
        String today = todayKey();
        List<JSONObject> late = new ArrayList<>();
        List<JSONObject> upcoming = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || item.optBoolean("done")) continue;
            String date = item.optString("date", "");
            if (date.length() < 10) continue;
            String end = item.optString("endDate", "");
            if (date.compareTo(today) < 0) {
                if (item.optBoolean("overdue")) late.add(item);
                // Multi-day events that are still going on show up today.
                else if (end.length() >= 10 && end.compareTo(today) >= 0) upcoming.add(0, item);
            } else {
                upcoming.add(item);
            }
        }
        if (!late.isEmpty()) {
            rows.add(new Row("Pendiente", null));
            for (JSONObject item : late) rows.add(new Row(null, item));
        }
        String current = null;
        for (JSONObject item : upcoming) {
            if (rows.size() >= MAX_ROWS) break;
            String date = item.optString("date");
            if (date.compareTo(today) < 0) date = today;
            if (!date.equals(current)) {
                current = date;
                rows.add(new Row(dayLabel(date, today), null));
            }
            rows.add(new Row(null, item));
        }
        return rows;
    }
}
