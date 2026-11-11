package com.llambies.pokekanban;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.util.Base64;
import java.math.BigInteger;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;

/**
 * Instant sync. The server already sends Web Push (VAPID) to browsers, and Google Play services
 * gives an app the same kind of subscription without a Firebase project: registering with the
 * server's VAPID key as the sender returns a token, and what the server posts to
 * fcm.googleapis.com/fcm/send/&lt;token&gt; arrives at PushReceiver. It is the protocol Chrome uses for
 * web push, as implemented by UnifiedPush's embedded FCM distributor.
 */
final class Push {

    static final int SEND = 1;
    static final int BROADCAST_ACK = 2;
    static final int RPC_ACK = 3;

    private static final String GMS = "com.google.android.gms";
    private static final String SERVICE = "com.google.android.c2dm.intent.REGISTER";
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/";
    private static final long TIMEOUT = 10_000;
    private static final int MIN_GMS_FOR_RPC_ACK = 233700000;

    private Push() {}

    interface Reply {
        /** `data`: what Play services answered, or null with the reason in `error`. */
        void done(Bundle data, String error);
    }

    interface Registered {
        void done(String endpoint, String error);
    }

    /** The subtype Play services registers this app under and stamps on its messages. */
    static String subtype(Context ctx) {
        return "wp:" + Store.pushChannel(ctx);
    }

    /** Asks for the push endpoint of this app for a server (its VAPID public key, base64url). */
    static void register(Context ctx, String vapid, Registered callback) {
        if (vapid == null || !vapid.matches("[A-Za-z0-9_-]{87}")) {
            callback.done(null, "Clave del servidor inválida");
            return;
        }
        String subtype = subtype(ctx);
        // Play services answers "<kid>:<token>".
        String kid = "0:" + Store.pushChannel(ctx);
        Bundle data = new Bundle();
        data.putString("scope", "GCM");
        data.putString("sender", vapid);
        data.putString("subscription", vapid);
        data.putString("X-subscription", vapid);
        data.putString("subtype", subtype);
        data.putString("X-subtype", subtype);
        data.putString("kid", kid);
        request(ctx, SEND, false, data, (answer, error) -> {
            Bundle result = answer == null ? null : answer.getBundle("data");
            String id = result == null ? null : result.getString("registration_id");
            if (id == null || id.isEmpty()) {
                String reason = error != null ? error : result == null ? null : result.getString("error");
                callback.done(null, reason == null ? "Los servicios de Google Play no han dado un registro" : reason);
                return;
            }
            String endpoint = ENDPOINT + (id.startsWith(kid + ":") ? id.substring(kid.length() + 1) : id);
            Store.setPushEndpoint(ctx, endpoint);
            callback.done(endpoint, null);
        });
    }

    /** Tells Play services a message arrived (BROADCAST_ACK) or was handled (RPC_ACK), as Google's own client does. */
    static void ack(Context ctx, Bundle message, int what) {
        if (message == null) return;
        Bundle data = new Bundle();
        String id = message.getString("google.message_id");
        if (id != null) data.putString("google.message_id", id);
        if (message.containsKey("google.product_id")) data.putInt("google.product_id", message.getInt("google.product_id"));
        if (what == BROADCAST_ACK) data.putBoolean("supports_message_handled", true);
        else if (gmsVersion(ctx) < MIN_GMS_FOR_RPC_ACK) return;
        request(ctx, what, true, data, (answer, error) -> {});
    }

    /**
     * The key pair of a Web Push subscription: { p256dh, auth } in base64url. The server needs them to
     * encrypt, but the app never reads the message (any push means "sync now"), so only the public
     * half is kept.
     */
    static String[] keys(Context ctx) throws Exception {
        String[] stored = Store.pushKeys(ctx);
        if (stored != null) return stored;
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        ECPoint point = ((ECPublicKey) generator.generateKeyPair().getPublic()).getW();
        // Uncompressed point: 0x04, X and Y (32 bytes each).
        byte[] raw = new byte[65];
        raw[0] = 4;
        copy(point.getAffineX(), raw, 1);
        copy(point.getAffineY(), raw, 33);
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        int flags = Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP;
        String[] keys = { Base64.encodeToString(raw, flags), Base64.encodeToString(auth, flags) };
        Store.setPushKeys(ctx, keys[0], keys[1]);
        return keys;
    }

    private static void copy(BigInteger value, byte[] out, int offset) {
        byte[] bytes = value.toByteArray();
        int n = Math.min(bytes.length, 32);
        System.arraycopy(bytes, bytes.length - n, out, offset + 32 - n, n);
    }

    private static int gmsVersion(Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(GMS, 0).versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    /** One request to Play services' messaging service: bind, send, wait for the answer, unbind. */
    private static void request(Context ctx, int what, boolean oneWay, Bundle payload, Reply reply) {
        new Call(ctx.getApplicationContext(), what, oneWay, payload, reply).start();
    }

    private static final class Call implements ServiceConnection {

        private final Context ctx;
        private final int what;
        private final boolean oneWay;
        private final Bundle payload;
        private final Reply reply;
        private final Handler handler;
        private boolean done = false;

        Call(Context ctx, int what, boolean oneWay, Bundle payload, Reply reply) {
            this.ctx = ctx;
            this.what = what;
            this.oneWay = oneWay;
            this.payload = payload;
            this.reply = reply;
            this.handler = new Handler(Looper.getMainLooper(), answer -> {
                Bundle data = answer.getData();
                if (data.getBoolean("unsupported", false)) finish(null, "Los servicios de Google Play no admiten esta petición");
                else finish(data, null);
                return true;
            });
        }

        void start() {
            handler.postDelayed(() -> finish(null, "Los servicios de Google Play no responden"), TIMEOUT);
            boolean bound = false;
            try {
                bound = ctx.bindService(new Intent(SERVICE).setPackage(GMS), this, Context.BIND_AUTO_CREATE);
            } catch (RuntimeException ignored) {
                // Not allowed to bind: same as not having Play services.
            }
            if (!bound) finish(null, "Este móvil no tiene los servicios de Google Play");
        }

        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            Bundle data = new Bundle();
            data.putBoolean("oneWay", oneWay);
            data.putString("pkg", ctx.getPackageName());
            data.putBundle("data", payload);
            Message message = Message.obtain();
            message.what = what;
            message.arg1 = 1;
            message.replyTo = new Messenger(handler);
            message.setData(data);
            try {
                new Messenger(binder).send(message);
            } catch (Exception e) {
                finish(null, "No se pudo hablar con los servicios de Google Play");
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            finish(null, "Se perdió la conexión con los servicios de Google Play");
        }

        @Override
        public void onNullBinding(ComponentName name) {
            finish(null, "Los servicios de Google Play no admiten esta petición");
        }

        private void finish(Bundle data, String error) {
            synchronized (this) {
                if (done) return;
                done = true;
            }
            handler.removeCallbacksAndMessages(null);
            try {
                ctx.unbindService(this);
            } catch (RuntimeException ignored) {
                // Never bound.
            }
            reply.done(data, error);
        }
    }
}
