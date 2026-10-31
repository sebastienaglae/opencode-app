package ai.opencode.remote;

import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private int safeTop = 0;
    private int safeBottom = 0;
    private int safeLeft = 0;
    private int safeRight = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SessionWidgetPlugin.class);
        registerPlugin(SpeechPlugin.class);
        super.onCreate(savedInstanceState);

        final Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        // 1) Expose the system-bar insets to the web layer as CSS variables so each
        //    element can pad itself (no global WebView padding side effects).
        ViewCompat.setOnApplyWindowInsetsListener(bridge.getWebView(), (view, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            safeTop = bars.top;
            safeBottom = bars.bottom;
            safeLeft = bars.left;
            safeRight = bars.right;
            injectInsets(bridge.getWebView());
            return insets;
        });
        bridge.getWebView().requestApplyInsets();

        // 2) The bridge may serve HTTPS/WSS with a self-signed certificate.
        //    Accept it only for private/LAN hosts (never for public hosts).
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                String host = error.getUrl() != null ? Uri.parse(error.getUrl()).getHost() : null;
                if (isPrivateHost(host)) {
                    handler.proceed();
                } else {
                    super.onReceivedSslError(view, handler, error);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectInsets(view);
            }
        });
    }

    private void injectInsets(WebView view) {
        if (view == null) return;
        String js =
            "(function(){var r=window.devicePixelRatio||1;" +
            "document.documentElement.style.setProperty('--safe-top',(" + safeTop + "/r)+'px');" +
            "document.documentElement.style.setProperty('--safe-bottom',(" + safeBottom + "/r)+'px');" +
            "document.documentElement.style.setProperty('--safe-left',(" + safeLeft + "/r)+'px');" +
            "document.documentElement.style.setProperty('--safe-right',(" + safeRight + "/r)+'px');})();";
        view.evaluateJavascript(js, null);
    }

    private static boolean isPrivateHost(String host) {
        if (host == null) return false;
        if (host.equals("localhost") || host.equals("127.0.0.1") || host.endsWith(".local")) return true;
        if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return true;
        if (host.startsWith("172.")) {
            try {
                int second = Integer.parseInt(host.split("\\.")[1]);
                return second >= 16 && second <= 31;
            } catch (NumberFormatException e) {
                return false;
            }
        }
        return false;
    }
}
