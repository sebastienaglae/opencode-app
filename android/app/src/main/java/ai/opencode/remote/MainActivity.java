package ai.opencode.remote;

import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SessionWidgetPlugin.class);
        super.onCreate(savedInstanceState);

        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    // The bridge may serve HTTPS/WSS with a self-signed certificate.
                    // Accept it only for private/LAN hosts (never for public hosts).
                    String host = error.getUrl() != null ? Uri.parse(error.getUrl()).getHost() : null;
                    if (isPrivateHost(host)) {
                        handler.proceed();
                    } else {
                        super.onReceivedSslError(view, handler, error);
                    }
                }
            });
        }
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
