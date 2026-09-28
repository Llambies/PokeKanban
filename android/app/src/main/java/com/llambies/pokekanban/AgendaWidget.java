package com.llambies.pokekanban;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** Home-screen widget with the upcoming events, birthdays, deadlines and cards. */
public class AgendaWidget extends AppWidgetProvider {

    static final String ACTION_REFRESH = "com.llambies.pokekanban.WIDGET_REFRESH";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(ctx, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    @Override
    public void onEnabled(Context ctx) {
        SyncWorker.schedulePeriodic(ctx);
        SyncWorker.runNow(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            refreshAll(ctx);
            SyncWorker.runNow(ctx);
        }
    }

    static int count(Context ctx) {
        return AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, AgendaWidget.class)).length;
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, AgendaWidget.class));
        if (ids.length == 0) return;
        for (int id : ids) manager.updateAppWidget(id, build(ctx, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    private static PendingIntent open(Context ctx, String route, String key) {
        return PendingIntent.getActivity(
            ctx,
            0,
            Notifications.openIntent(ctx, route, "widget-" + key),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    @SuppressWarnings("deprecation")
    private static RemoteViews build(Context ctx, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_agenda);
        String today = Agenda.todayKey();
        views.setTextViewText(R.id.widget_title, "Hoy");
        views.setTextViewText(R.id.widget_date, Agenda.longDate(today));
        views.setTextViewText(
            R.id.widget_empty,
            Store.needsLogin(ctx) ? "Abre la app para volver a iniciar sesión" : "Nada en los próximos días. Toca + para añadir."
        );

        Intent service = new Intent(ctx, AgendaWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, service);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // Each row fills in its own route (see AgendaWidgetService).
        Intent template = new Intent(ctx, MainActivity.class);
        template.setAction(Intent.ACTION_VIEW);
        template.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        views.setPendingIntentTemplate(
            R.id.widget_list,
            PendingIntent.getActivity(ctx, 1, template, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE)
        );

        views.setOnClickPendingIntent(R.id.widget_header, open(ctx, "#/calendar", "calendar"));
        views.setOnClickPendingIntent(R.id.widget_empty, open(ctx, "#/calendar", "calendar"));
        views.setOnClickPendingIntent(R.id.widget_add, open(ctx, "#/calendar?new=event", "new"));
        Intent refresh = new Intent(ctx, AgendaWidget.class).setAction(ACTION_REFRESH);
        views.setOnClickPendingIntent(
            R.id.widget_refresh,
            PendingIntent.getBroadcast(ctx, 0, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
        );
        return views;
    }
}
