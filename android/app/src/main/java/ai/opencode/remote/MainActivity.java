package ai.opencode.remote;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SessionWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
