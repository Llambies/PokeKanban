package com.llambies.pokekanban;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Rows of the agenda widget. */
public class AgendaWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static final class Factory implements RemoteViewsFactory {

        private final Context ctx;
        private List<Agenda.Row> rows = new ArrayList<>();

        Factory(Context ctx) {
            this.ctx = ctx;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            rows = Agenda.rows(ctx);
        }

        @Override
        public void onDestroy() {}

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position >= rows.size()) return null;
            Agenda.Row row = rows.get(position);
            if (row.header != null) {
                RemoteViews header = new RemoteViews(ctx.getPackageName(), R.layout.widget_day);
                header.setTextViewText(R.id.day_label, row.header);
                header.setTextColor(R.id.day_label, row.header.equals("Pendiente") ? 0xFFE5484D : ctx.getColor(R.color.widget_accent));
                return header;
            }
            JSONObject item = row.item;
            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_item);
            String time = item.optString("time", "");
            boolean overdue = item.optBoolean("overdue");
            views.setTextViewText(R.id.item_time, time.isEmpty() ? "Todo el día" : time);
            views.setTextColor(R.id.item_time, overdue ? 0xFFE5484D : ctx.getColor(R.color.widget_muted));
            views.setTextViewText(R.id.item_title, item.optString("title", ""));
            showIcon(views, item);

            String detail = item.optString("detail", "");
            if (overdue) detail = detail.isEmpty() ? "Pendiente" : "Pendiente · " + detail;
            views.setTextViewText(R.id.item_detail, detail);
            views.setViewVisibility(R.id.item_detail, detail.isEmpty() ? View.GONE : View.VISIBLE);

            int color = ctx.getColor(R.color.widget_muted);
            try {
                String hex = item.optString("color", "");
                if (hex.startsWith("#")) color = Color.parseColor(hex);
            } catch (IllegalArgumentException ignored) {
                // Keep the default color.
            }
            views.setInt(R.id.item_bar, "setColorFilter", color);

            Intent fill = new Intent();
            fill.setData(Uri.parse("pokekanban://widget/item/" + position));
            fill.putExtra(MainActivity.EXTRA_ROUTE, item.optString("url", "#/calendar"));
            views.setOnClickFillInIntent(R.id.item_root, fill);
            return views;
        }

        /** Same icon as in the app: its Lucide icon, or the emoji picked for the event. */
        private void showIcon(RemoteViews views, JSONObject item) {
            String icon = item.optString("icon", "");
            if (icon.equals("null")) icon = "";
            String poke = PokeSprites.keyOf(icon);
            if (poke != null) {
                int size = Math.round(18 * ctx.getResources().getDisplayMetrics().density);
                Bitmap sprite = PokeSprites.bitmap(ctx, poke, size);
                if (sprite == null && PokeSprites.fetch(ctx, poke)) sprite = PokeSprites.bitmap(ctx, poke, size);
                if (sprite != null) {
                    views.setImageViewBitmap(R.id.item_icon, sprite);
                    views.setInt(R.id.item_icon, "setColorFilter", 0);
                    views.setViewVisibility(R.id.item_icon, View.VISIBLE);
                    views.setViewVisibility(R.id.item_emoji, View.GONE);
                    return;
                }
                icon = "";
            }
            int drawable = LucideIcons.drawableFor(icon);
            if (drawable == 0 && !icon.isEmpty() && !icon.startsWith("lucide:")) {
                views.setTextViewText(R.id.item_emoji, icon);
                views.setViewVisibility(R.id.item_emoji, View.VISIBLE);
                views.setViewVisibility(R.id.item_icon, View.GONE);
                return;
            }
            if (drawable == 0) drawable = LucideIcons.drawableFor(defaultIcon(item.optString("kind", "event")));
            views.setViewVisibility(R.id.item_emoji, View.GONE);
            views.setViewVisibility(R.id.item_icon, drawable == 0 ? View.GONE : View.VISIBLE);
            if (drawable != 0) {
                views.setImageViewResource(R.id.item_icon, drawable);
                views.setInt(R.id.item_icon, "setColorFilter", ctx.getColor(R.color.widget_muted));
            }
        }

        /** Kind icons (as in the app) for agendas saved before items carried their icon. */
        private static String defaultIcon(String kind) {
            switch (kind) {
                case "birthday":
                    return "lucide:CakeSlice";
                case "anniversary":
                    return "lucide:Heart";
                case "deadline":
                    return "lucide:Flag";
                case "reminder":
                    return "lucide:Bell";
                case "card":
                    return "lucide:ClipboardList";
                default:
                    return "lucide:Calendar";
            }
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 2;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
