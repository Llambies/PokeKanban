package com.llambies.pokekanban;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A push from the server (see Push): the calendar changed on another device or a reminder is due.
 * Fetch the agenda right away, which schedules the new alarms and shows what is due now.
 */
public class PushReceiver extends BroadcastReceiver {

    // A receiver gets about 10 seconds; past this the sync is left to WorkManager.
    private static final long BUDGET = 8000;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"com.google.android.c2dm.intent.RECEIVE".equals(intent.getAction())) return;
        Context ctx = context.getApplicationContext();
        Bundle message = intent.getExtras();
        Push.ack(ctx, message, Push.BROADCAST_ACK);
        if (!Push.subtype(ctx).equals(intent.getStringExtra("subtype"))) return;
        Store.setPushAt(ctx, System.currentTimeMillis());

        PendingResult pending = goAsync();
        AtomicBoolean finished = new AtomicBoolean(false);
        Handler main = new Handler(Looper.getMainLooper());
        Runnable tooSlow = () -> {
            if (!finished.compareAndSet(false, true)) return;
            SyncWorker.runNow(ctx);
            pending.finish();
        };
        main.postDelayed(tooSlow, BUDGET);
        new Thread(() -> {
            boolean synced = SyncWorker.sync(ctx, 3000, 4000);
            if (!finished.compareAndSet(false, true)) return;
            main.removeCallbacks(tooSlow);
            if (!synced) SyncWorker.runNow(ctx);
            Push.ack(ctx, message, Push.RPC_ACK);
            pending.finish();
            // Not urgent, and fine if the system stops the app before it ends.
            if (synced) SyncWorker.sprites(ctx);
        }).start();
    }
}
