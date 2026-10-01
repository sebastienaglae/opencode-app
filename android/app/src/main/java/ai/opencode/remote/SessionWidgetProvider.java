package ai.opencode.remote;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

/** Home-screen widget showing the state of the OpenCode sessions. */
public class SessionWidgetProvider extends AppWidgetProvider {

    public static final String PREFS = "opencode_widget";

    public static void save(Context context, int running, int finished, String project, long startedAt) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt("running", running)
            .putInt("finished", finished)
            .putString("project", project == null ? "" : project)
            .putLong("startedAt", startedAt)
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

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.session_widget);
        views.setViewVisibility(R.id.widget_chronometer, View.GONE);

        if (running >= 2) {
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_running_many, running));
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_finished, finished));
        } else if (running == 1) {
            views.setTextViewText(
                R.id.widget_title,
                project == null || project.isEmpty() ? context.getString(R.string.widget_running_one) : project
            );
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_finished, finished));
            views.setViewVisibility(R.id.widget_chronometer, View.VISIBLE);
            if (startedAt > 0) {
                long base = SystemClock.elapsedRealtime() - Math.max(0L, System.currentTimeMillis() - startedAt);
                views.setChronometer(R.id.widget_chronometer, base, null, true);
            }
        } else {
            views.setTextViewText(
                R.id.widget_title,
                finished > 0 ? context.getString(R.string.widget_finished_only, finished) : context.getString(R.string.widget_none)
            );
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_app));
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
}
