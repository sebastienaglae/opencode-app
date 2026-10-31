package ai.opencode.remote;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * On-device dictation for the composer (Android SpeechRecognizer).
 *
 * start() resolves immediately and streams results as events so the web layer
 * can render partial transcripts while the user is still speaking:
 *   - partial { text }
 *   - result  { text }
 *   - state   { listening }
 *   - error   { code, message }
 */
@CapacitorPlugin(
    name = "Speech",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class SpeechPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("unavailable");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermissionCallback");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micPermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("denied");
        }
    }

    private void begin(PluginCall call) {
        final String language = call.getString("language");
        final Boolean offline = call.getBoolean("offline", false);
        main.post(() -> {
            destroyRecognizer();
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {
                    JSObject data = new JSObject();
                    data.put("listening", true);
                    notifyListeners("state", data);
                }

                @Override public void onBeginningOfSpeech() { }

                @Override public void onRmsChanged(float rmsdB) {
                    JSObject data = new JSObject();
                    data.put("rms", (double) rmsdB);
                    notifyListeners("level", data);
                }

                @Override public void onBufferReceived(byte[] buffer) { }

                @Override public void onEndOfSpeech() { }

                @Override public void onError(int error) {
                    JSObject data = new JSObject();
                    data.put("code", error);
                    data.put("message", errorMessage(error));
                    notifyListeners("error", data);
                    JSObject state = new JSObject();
                    state.put("listening", false);
                    notifyListeners("state", state);
                }

                @Override public void onResults(Bundle results) {
                    JSObject data = new JSObject();
                    data.put("text", firstResult(results));
                    notifyListeners("result", data);
                    JSObject state = new JSObject();
                    state.put("listening", false);
                    notifyListeners("state", state);
                }

                @Override public void onPartialResults(Bundle partialResults) {
                    String text = firstResult(partialResults);
                    if (text.isEmpty()) return;
                    JSObject data = new JSObject();
                    data.put("text", text);
                    notifyListeners("partial", data);
                }

                @Override public void onEvent(int eventType, Bundle params) { }
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            if (language != null && !language.isEmpty()) {
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
            }
            if (Boolean.TRUE.equals(offline)) {
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            }

            try {
                recognizer.startListening(intent);
            } catch (Exception err) {
                call.reject(err.getMessage() == null ? "start-failed" : err.getMessage());
                return;
            }

            JSObject ret = new JSObject();
            ret.put("listening", true);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            if (recognizer != null) {
                try {
                    recognizer.stopListening();
                } catch (Exception ignored) { }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        main.post(() -> {
            if (recognizer != null) {
                try {
                    recognizer.cancel();
                } catch (Exception ignored) { }
            }
            destroyRecognizer();
            JSObject state = new JSObject();
            state.put("listening", false);
            notifyListeners("state", state);
            call.resolve();
        });
    }

    private void destroyRecognizer() {
        if (recognizer == null) return;
        try {
            recognizer.destroy();
        } catch (Exception ignored) { }
        recognizer = null;
    }

    private static String firstResult(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return "";
        String first = matches.get(0);
        return first == null ? "" : first;
    }

    private static String errorMessage(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_AUDIO: return "audio";
            case SpeechRecognizer.ERROR_CLIENT: return "client";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "permissions";
            case SpeechRecognizer.ERROR_NETWORK: return "network";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "network timeout";
            case SpeechRecognizer.ERROR_NO_MATCH: return "no match";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "busy";
            case SpeechRecognizer.ERROR_SERVER: return "server";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "no speech";
            default: return "error " + code;
        }
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::destroyRecognizer);
        super.handleOnDestroy();
    }
}
