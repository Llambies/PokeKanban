package com.llambies.pokekanban;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms are lost on reboot or update: schedule them again and refresh the agenda. */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        Reminders.schedule(ctx);
        AgendaWidget.refreshAll(ctx);
        SyncWorker.schedulePeriodic(ctx);
        SyncWorker.runNow(ctx);
    }
}
