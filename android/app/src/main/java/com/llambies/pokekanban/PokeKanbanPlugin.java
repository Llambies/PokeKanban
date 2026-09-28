package com.llambies.pokekanban;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.CookieManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Bridge used by the web app (src/lib/native.ts) when it runs inside the Android app. */
@CapacitorPlugin(
    name = "PokeKanban",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class PokeKanbanPlugin extends Plugin {

    @Override
    public void load() {
        Store.setBaseUrl(getContext(), getBridge().getServerUrl());
    }

    /** The app sends its agenda and upcoming reminders whenever the data changes. */
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        try {
            Store.setCookie(ctx, CookieManager.getInstance().getCookie(Store.baseUrl(ctx)));
        } catch (Exception ignored) {
            // Background sync just waits for the next update.
        }
        String agenda = call.getString("agenda");
        String reminders = call.getString("reminders");
        if (agenda != null) Store.saveAgenda(ctx, agenda);
        if (reminders != null) Store.saveReminders(ctx, reminders);
        Store.setNeedsLogin(ctx, false);
        Reminders.schedule(ctx);
        AgendaWidget.refreshAll(ctx);
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notifications", Notifications.allowed(getContext()));
        result.put("exactAlarms", Reminders.canExact(getContext()));
        result.put("widgets", AgendaWidget.count(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsResult");
            return;
        }
        if (!Notifications.allowed(getContext())) openSettings(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        status(call);
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        status(call);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) openSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        call.resolve();
    }

    @PluginMethod
    public void test(PluginCall call) {
        Notifications.show(
            getContext(),
            "test-" + System.currentTimeMillis(),
            "🔔 Notificaciones activadas",
            "Así te avisaré de tus eventos, cumpleaños y fechas límite.",
            "#/calendar"
        );
        call.resolve();
    }

    @PluginMethod
    public void sync(PluginCall call) {
        SyncWorker.runNow(getContext());
        call.resolve();
    }

    private void openSettings(String action) {
        Context ctx = getContext();
        Intent intent = new Intent(action);
        if (Settings.ACTION_APP_NOTIFICATION_SETTINGS.equals(action)) intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        else intent.setData(Uri.parse("package:" + ctx.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
        } catch (Exception ignored) {
            // Settings screen not available on this device.
        }
    }
}
