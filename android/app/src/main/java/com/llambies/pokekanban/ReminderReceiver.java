package com.llambies.pokekanban;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** An alarm went off: show the reminder (once, even if it was scheduled twice). */
public class ReminderReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra("id");
        if (id == null || Store.wasDelivered(ctx, id)) return;
        Store.markDelivered(ctx, id);
        Notifications.show(ctx, id, intent.getStringExtra("title"), intent.getStringExtra("body"), intent.getStringExtra("url"));
    }
}
