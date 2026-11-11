package com.llambies.pokekanban;

import android.content.Context;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Downloads the agenda and the upcoming reminders from the server (changes made on other devices),
 * then refreshes the widget and the scheduled alarms. The server asks for it with a push when
 * something changes (PushReceiver); every half hour it runs anyway, in case a push got lost.
 */
public class SyncWorker extends Worker {

    private static final String PERIODIC = "pokekanban-sync";
    private static final String ONCE = "pokekanban-sync-now";

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    private static Constraints online() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    static void schedulePeriodic(Context ctx) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(SyncWorker.class, 30, TimeUnit.MINUTES)
            .setConstraints(online())
            .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    static void runNow(Context ctx) {
        runSoon(ctx, 0);
    }

    static void runSoon(Context ctx, long delaySeconds) {
        OneTimeWorkRequest.Builder request = new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(online());
        // "Now" also means now on a sleeping phone (expedited work; older Androids would need a foreground service).
        if (delaySeconds > 0) request.setInitialDelay(delaySeconds, TimeUnit.SECONDS);
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) request.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
        WorkManager.getInstance(ctx).enqueueUniqueWork(ONCE, ExistingWorkPolicy.REPLACE, request.build());
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        if (!sync(ctx, 15000, 20000)) return Result.retry();
        sprites(ctx);
        return Result.success();
    }

    /**
     * Fetches the agenda and reminders, schedules the alarms and refreshes the widget.
     * False: it did not work this time (no connection, server error) and is worth another try.
     */
    static boolean sync(Context ctx, int connectTimeout, int readTimeout) {
        String cookie = Store.cookie(ctx);
        if (cookie == null) return true;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(Store.baseUrl(ctx) + "/api/agenda?days=21&reminders=1").openConnection();
            conn.setConnectTimeout(connectTimeout);
            conn.setReadTimeout(readTimeout);
            conn.setRequestProperty("Cookie", cookie);
            conn.setRequestProperty("Accept", "application/json");
            int status = conn.getResponseCode();
            if (status == 401) {
                Store.setNeedsLogin(ctx, true);
                AgendaWidget.refreshAll(ctx);
                return true;
            }
            if (status != 200) return false;
            keepRenewedSession(ctx, conn);
            JSONObject body = new JSONObject(read(conn.getInputStream()));
            JSONArray reminders = body.optJSONArray("reminders");
            body.remove("reminders");
            Store.saveAgenda(ctx, body.toString());
            if (reminders != null) Store.saveReminders(ctx, reminders.toString());
            Store.setNeedsLogin(ctx, false);
            Reminders.schedule(ctx);
            AgendaWidget.refreshAll(ctx);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Pokémon icons: download the new ones so the widget and notifications have them offline. */
    static void sprites(Context ctx) {
        PokeSprites.prefetch(ctx, Store.agenda(ctx).optJSONArray("items"), Store.reminders(ctx));
        AgendaWidget.refreshAll(ctx);
    }

    /** The server renews the session cookie now and then; keep the new one. */
    private static void keepRenewedSession(Context ctx, HttpURLConnection conn) {
        for (Map.Entry<String, List<String>> header : conn.getHeaderFields().entrySet()) {
            if (header.getKey() == null || !header.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String value : header.getValue()) {
                String pair = value.split(";", 2)[0];
                if (pair.startsWith("pk_session=") && pair.length() > "pk_session=".length()) Store.setCookie(ctx, pair);
            }
        }
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream stream = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = stream.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
