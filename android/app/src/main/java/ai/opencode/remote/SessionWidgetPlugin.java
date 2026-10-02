package ai.opencode.remote;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SessionWidget")
public class SessionWidgetPlugin extends Plugin {

    @PluginMethod
    public void updateState(PluginCall call) {
        Integer running = call.getInt("running", 0);
        Integer finished = call.getInt("finished", 0);
        String project = call.getString("project", "");
        Long startedAt = call.getLong("startedAt", 0L);
        String sessions = call.getString("sessions", "[]");

        SessionWidgetProvider.save(
            getContext(),
            running == null ? 0 : running,
            finished == null ? 0 : finished,
            project,
            startedAt == null ? 0L : startedAt,
            sessions
        );
        SessionWidgetProvider.updateAll(getContext());
        call.resolve();
    }
}
