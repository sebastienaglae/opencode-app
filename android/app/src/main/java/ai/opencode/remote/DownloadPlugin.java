package ai.opencode.remote;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Downloads a bridge file (e.g. a built APK) straight to the public Downloads
 * folder, then optionally opens it with the system viewer.
 *
 * The transfer runs here rather than in the WebView: large binaries never have
 * to cross the JS bridge as base64, and progress is streamed to the UI.
 */
@CapacitorPlugin(name = "Downloader")
public class DownloadPlugin extends Plugin {

    private static final String SUBFOLDER = "OpenCode";
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    private static final class Pending {
        final Uri uri;
        final File file;

        Pending(Uri uri, File file) {
            this.uri = uri;
            this.file = file;
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String token = call.getString("token");
        final String filename = sanitize(call.getString("filename", "download.bin"));
        final String mime = call.getString("mime", "application/octet-stream");
        final Boolean open = call.getBoolean("open", false);

        if (url == null || url.isEmpty()) {
            call.reject("missing url");
            return;
        }

        cancelled.set(false);
        new Thread(() -> {
            HttpURLConnection connection = null;
            Pending pending = null;
            try {
                connection = open(url, token);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("HTTP " + status);
                    return;
                }
                long total = connection.getContentLength();
                pending = createTarget(filename, mime);
                if (pending == null) {
                    call.reject("cannot create the target file");
                    return;
                }

                try (InputStream in = connection.getInputStream(); OutputStream out = openOutput(pending)) {
                    byte[] buffer = new byte[64 * 1024];
                    long received = 0;
                    long lastEmit = 0;
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        if (cancelled.get()) {
                            cleanup(pending);
                            call.reject("cancelled");
                            return;
                        }
                        out.write(buffer, 0, read);
                        received += read;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 200) {
                            lastEmit = now;
                            JSObject progress = new JSObject();
                            progress.put("received", received);
                            progress.put("total", total);
                            notifyListeners("progress", progress);
                        }
                    }
                    out.flush();
                }

                Uri target = finish(pending, filename, mime);
                JSObject result = new JSObject();
                result.put("uri", target.toString());
                result.put("name", filename);
                result.put("path", "Download/" + SUBFOLDER + "/" + filename);
                result.put("size", total);
                call.resolve(result);

                if (Boolean.TRUE.equals(open)) openFile(target, mime);
            } catch (Exception err) {
                if (pending != null) cleanup(pending);
                String message = err.getMessage();
                call.reject(message == null ? err.getClass().getSimpleName() : message);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "opencode-download").start();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled.set(true);
        call.resolve();
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String uri = call.getString("uri");
        String mime = call.getString("mime", "application/octet-stream");
        if (uri == null) {
            call.reject("missing uri");
            return;
        }
        try {
            openFile(Uri.parse(uri), mime);
            call.resolve();
        } catch (Exception err) {
            call.reject(err.getMessage() == null ? "cannot open" : err.getMessage());
        }
    }

    private void openFile(Uri uri, String mime) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, mime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private Pending createTarget(String filename, String mime) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            String relative = Environment.DIRECTORY_DOWNLOADS + "/" + SUBFOLDER + "/";
            // Re-downloading the same build should replace it, not pile up " (1)" copies.
            try {
                ctx.getContentResolver().delete(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?",
                    new String[] { filename, relative }
                );
            } catch (Exception ignored) { }
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, relative);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            return uri == null ? null : new Pending(uri, null);
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), SUBFOLDER);
        if (!dir.exists() && !dir.mkdirs()) return null;
        return new Pending(null, new File(dir, filename));
    }

    private OutputStream openOutput(Pending pending) throws IOException {
        if (pending.uri != null) return getContext().getContentResolver().openOutputStream(pending.uri);
        return new FileOutputStream(pending.file);
    }

    private Uri finish(Pending pending, String filename, String mime) {
        Context ctx = getContext();
        if (pending.uri != null) {
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            ctx.getContentResolver().update(pending.uri, done, null, null);
            return pending.uri;
        }
        MediaScannerConnection.scanFile(ctx, new String[] { pending.file.getAbsolutePath() }, new String[] { mime }, null);
        return FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", pending.file);
    }

    private void cleanup(Pending pending) {
        try {
            if (pending.uri != null) getContext().getContentResolver().delete(pending.uri, null, null);
            else if (pending.file != null) //noinspection ResultOfMethodCallIgnored
                pending.file.delete();
        } catch (Exception ignored) { }
    }

    private HttpURLConnection open(String url, String token) throws Exception {
        URL target = new URL(url);
        HttpURLConnection connection = (HttpURLConnection) target.openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        connection.setInstanceFollowRedirects(true);
        if (token != null && !token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (connection instanceof HttpsURLConnection && isPrivateHost(target.getHost())) {
            HttpsURLConnection https = (HttpsURLConnection) connection;
            https.setSSLSocketFactory(trustAll().getSocketFactory());
            https.setHostnameVerifier((host, session) -> true);
        }
        return connection;
    }

    /** The bridge uses a self-signed certificate on the LAN, like the WebView. */
    private static SSLContext trustAll() throws Exception {
        TrustManager[] trust = new TrustManager[] {
            new X509TrustManager() {
                @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
                @Override public void checkServerTrusted(X509Certificate[] chain, String authType) { }
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            }
        };
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, trust, new SecureRandom());
        return ctx;
    }

    private static boolean isPrivateHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (h.equals("localhost") || h.equals("127.0.0.1") || h.endsWith(".local")) return true;
        if (h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return true;
        if (h.startsWith("172.")) {
            try {
                int second = Integer.parseInt(h.split("\\.")[1]);
                return second >= 16 && second <= 31;
            } catch (NumberFormatException e) {
                return false;
            }
        }
        return false;
    }

    private static String sanitize(String name) {
        String base = name.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) base = base.substring(slash + 1);
        base = base.replaceAll("[\\\\:*?\"<>|]", "_").trim();
        if (base.isEmpty() || base.equals(".") || base.equals("..")) return "download.bin";
        return base;
    }
}
