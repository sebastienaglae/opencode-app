package ai.opencode.remote;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Home-screen / lock-screen widget showing OpenCode session status.
 *  Responsive: shows a single session with a live timer when compact, and a
 *  list of running sessions when there is room. */
public class SessionWidgetProvider extends AppWidgetProvider {

    public static final String PREFS = "opencode_widget";

    public static void save(Context context, int running, int finished, String project, long startedAt, String sessions) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt("running", running)
            .putInt("finished", finished)
            .putString("project", project == null ? "" : project)
            .putLong("startedAt", startedAt)
            .putString("sessions", sessions == null ? "[]" : sessions)
            .apply();
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SessionWidgetProvider.class));
        for (int id : ids) {
            update(context, manager, id);
        }
    }

    private static void update(Context context, AppWidgetManager manager, int id) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int running = prefs.getInt("running", 0);
        int finished = prefs.getInt("finished", 0);
        String project = prefs.getString("project", "");
        long startedAt = prefs.getLong("startedAt", 0L);
        String sessionsJson = prefs.getString("sessions", "[]");

        Bundle options = manager.getAppWidgetOptions(id);
        int minWidth = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180) : 180;
        int maxRows = minWidth < 180 ? 0 : minWidth < 280 ? 3 : 6;

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.session_widget);
        views.setViewVisibility(R.id.widget_chronometer, View.GONE);
        views.removeAllViews(R.id.widget_rows);

        if (running == 0) {
            views.setTextViewText(
                R.id.widget_title,
                finished > 0 ? context.getString(R.string.widget_finished_only, finished) : context.getString(R.string.widget_none)
            );
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_app));
        } else if (maxRows == 0 || running == 1) {
            views.setTextViewText(
                R.id.widget_title,
                running == 1
                    ? (project.isEmpty() ? context.getString(R.string.widget_running_one) : project)
                    : context.getString(R.string.widget_running_many, running)
            );
            if (running == 1 && startedAt > 0) {
                long base = SystemClock.elapsedRealtime() - Math.max(0L, System.currentTimeMillis() - startedAt);
                views.setChronometer(R.id.widget_chronometer, base, null, true);
                views.setViewVisibility(R.id.widget_chronometer, View.VISIBLE);
            }
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_finished, finished));
        } else {
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_running_many, running));
            SimpleDateFormat fmt = new SimpleDateFormat("HH:mm", Locale.getDefault());
            try {
                JSONArray arr = new JSONArray(sessionsJson);
                int shown = Math.min(arr.length(), maxRows);
                for (int i = 0; i < shown; i++) {
                    JSONObject o = arr.getJSONObject(i);
                    RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.session_widget_row);
                    row.setTextViewText(R.id.row_project, o.optString("project", ""));
                    long st = o.optLong("startedAt", 0L);
                    row.setTextViewText(R.id.row_time, st > 0 ? fmt.format(new Date(st)) : "");
                    views.addView(R.id.widget_rows, row);
                }
                if (arr.length() > shown) {
                    RemoteViews more = new RemoteViews(context.getPackageName(), R.layout.session_widget_row);
                    more.setTextViewText(R.id.row_project, "+" + (arr.length() - shown));
                    more.setTextViewText(R.id.row_time, "");
                    views.addView(R.id.widget_rows, more);
                }
            } catch (Exception ignored) {
                /* malformed sessions */
            }
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_finished, finished));
        }

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            PendingIntent pending = PendingIntent.getActivity(
                context,
                0,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pending);
        }

        manager.updateAppWidget(id, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            update(context, manager, id);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle newOptions) {
        update(context, manager, id);
    }
}
