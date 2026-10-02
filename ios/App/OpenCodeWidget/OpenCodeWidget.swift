// OpenCode Remote — iOS home-screen widget (WidgetKit).
//
// This file is provided as a scaffold: add a "Widget Extension" target in Xcode
// named "OpenCodeWidget" and include this file. The app writes the session state
// into the shared App Group (see SessionWidgetPlugin.swift). See docs/ios.md.

import WidgetKit
import SwiftUI

struct SessionState {
    var running: Int = 0
    var finished: Int = 0
    var project: String = ""
    var startedAt: Double = 0
}

struct SessionEntry: TimelineEntry {
    let date: Date
    let state: SessionState
}

struct Provider: TimelineProvider {
    let groupId = "group.ai.opencode.remote"

    func read() -> SessionState {
        let defaults = UserDefaults(suiteName: groupId)
        return SessionState(
            running: defaults?.integer(forKey: "running") ?? 0,
            finished: defaults?.integer(forKey: "finished") ?? 0,
            project: defaults?.string(forKey: "project") ?? "",
            startedAt: defaults?.double(forKey: "startedAt") ?? 0
        )
    }

    func placeholder(in context: Context) -> SessionEntry {
        SessionEntry(date: Date(), state: SessionState(running: 1, finished: 2, project: "my-project", startedAt: Date().timeIntervalSince1970 - 120))
    }

    func getSnapshot(in context: Context, completion: @escaping (SessionEntry) -> Void) {
        completion(SessionEntry(date: Date(), state: read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SessionEntry>) -> Void) {
        let entry = SessionEntry(date: Date(), state: read())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60))))
    }
}

struct OpenCodeWidgetEntryView: View {
    var entry: SessionEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if entry.state.running >= 2 {
                Text("\(entry.state.running) sessions running").font(.headline)
            } else if entry.state.running == 1 {
                Text(entry.state.project.isEmpty ? "1 session running" : entry.state.project).font(.headline)
            } else {
                Text(entry.state.finished > 0 ? "\(entry.state.finished) finished" : "No session").font(.headline)
            }
            if entry.state.running == 1 && entry.state.startedAt > 0 {
                Text(Date(timeIntervalSince1970: entry.state.startedAt), style: .timer)
                    .font(.caption)
                    .foregroundColor(.accentColor)
            }
            Text("\(entry.state.finished) finished").font(.caption2).foregroundColor(.secondary)
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

@main
struct OpenCodeWidget: Widget {
    let kind = "OpenCodeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            OpenCodeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("OpenCode")
        .description("Status of your OpenCode sessions.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
