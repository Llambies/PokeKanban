package com.llambies.pokekanban;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** An alarm went off: show the reminder. */
public class ReminderReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        Reminders.deliver(
            ctx,
            intent.getStringExtra("id"),
            intent.getStringExtra("title"),
            intent.getStringExtra("body"),
            intent.getStringExtra("url"),
            intent.getStringExtra("icon")
        );
    }
}
