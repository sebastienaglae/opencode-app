// OpenCode Remote — iOS Capacitor plugin that writes the session state into the
// shared App Group so the WidgetKit widget can read it.
//
// Add this file to the App target (not the widget target) and register it in
// the bridge (Capacitor auto-discovers @objc(CAPPlugin) plugins). See docs/ios.md.

import Foundation
import Capacitor

@objc(SessionWidgetPlugin)
public class SessionWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionWidgetPlugin"
    public let jsName = "SessionWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateState", returnType: CAPPluginReturnPromise)
    ]

    private let groupId = "group.ai.opencode.remote"

    @objc func updateState(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: groupId)
        defaults?.set(call.getInt("running") ?? 0, forKey: "running")
        defaults?.set(call.getInt("finished") ?? 0, forKey: "finished")
        defaults?.set(call.getString("project") ?? "", forKey: "project")
        defaults?.set(call.getDouble("startedAt") ?? 0, forKey: "startedAt")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}

import WidgetKit
