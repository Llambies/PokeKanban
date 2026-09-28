package com.llambies.pokekanban;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import org.json.JSONObject;

/**
 * The app is the web app (kanban.llambies.com) inside a WebView, plus native pieces: exact
 * reminders, the home-screen widget and background sync. Taps on a notification or on the widget
 * arrive here with the route to show (for example "#/calendar?e=…").
 */
public class MainActivity extends BridgeActivity {

    public static final String EXTRA_ROUTE = "com.llambies.pokekanban.ROUTE";

    private boolean pageLoaded = false;
    private String pendingRoute = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PokeKanbanPlugin.class);
        super.onCreate(savedInstanceState);
        Notifications.createChannel(this);
        SyncWorker.schedulePeriodic(this);
        if (getBridge() == null) return;
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                pageLoaded = true;
                if (pendingRoute != null) {
                    showRoute(pendingRoute);
                    pendingRoute = null;
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null) return;
        String route = intent.getStringExtra(EXTRA_ROUTE);
        if (route == null || !route.startsWith("#")) return;
        intent.removeExtra(EXTRA_ROUTE);
        if (pageLoaded) showRoute(route);
        else pendingRoute = route;
    }

    @Override
    public void onPause() {
        super.onPause();
        // The app already sent its agenda; a later sync also picks up the saved state from the server.
        SyncWorker.runSoon(this, 30);
    }

    private void showRoute(String route) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        webView.post(() -> webView.evaluateJavascript("window.location.hash = " + JSONObject.quote(route) + ";", null));
    }
}
