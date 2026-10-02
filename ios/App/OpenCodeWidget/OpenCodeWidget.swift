// OpenCode Remote — iOS home-screen / lock-screen widget (WidgetKit).
//
// Scaffold: add a "Widget Extension" target named "OpenCodeWidget" in Xcode and
// include this file. The app writes the session state into the shared App Group
// (see SessionWidgetPlugin.swift). See docs/ios.md.

import WidgetKit
import SwiftUI

struct WidgetSession: Decodable {
    let project: String
    let startedAt: Double
}

struct SessionState {
    var running: Int = 0
    var finished: Int = 0
    var project: String = ""
    var startedAt: Double = 0
    var sessions: [WidgetSession] = []
}

struct SessionEntry: TimelineEntry {
    let date: Date
    let state: SessionState
}

struct Provider: TimelineProvider {
    let groupId = "group.ai.opencode.remote"

    func read() -> SessionState {
        let defaults = UserDefaults(suiteName: groupId)
        var state = SessionState(
            running: defaults?.integer(forKey: "running") ?? 0,
            finished: defaults?.integer(forKey: "finished") ?? 0,
            project: defaults?.string(forKey: "project") ?? "",
            startedAt: defaults?.double(forKey: "startedAt") ?? 0
        )
        if let json = defaults?.string(forKey: "sessions"), let data = json.data(using: .utf8) {
            state.sessions = (try? JSONDecoder().decode([WidgetSession].self, from: data)) ?? []
        }
        return state
    }

    func placeholder(in context: Context) -> SessionEntry {
        SessionEntry(date: Date(), state: SessionState(running: 2, finished: 3, project: "my-project", startedAt: Date().timeIntervalSince1970 - 120,
            sessions: [WidgetSession(project: "my-project", startedAt: Date().timeIntervalSince1970 - 120),
                       WidgetSession(project: "backend-api", startedAt: Date().timeIntervalSince1970 - 600)]))
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
    @Environment(\.widgetFamily) var family
    var entry: SessionEntry

    var maxRows: Int {
        switch family {
        case .systemSmall: return 0
        case .systemMedium: return 3
        default: return 6
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if entry.state.running == 0 {
                Text(entry.state.finished > 0 ? "\(entry.state.finished) finished" : "No session").font(.headline)
            } else if maxRows == 0 || entry.state.running == 1 {
                Text(entry.state.running == 1
                     ? (entry.state.project.isEmpty ? "1 session running" : entry.state.project)
                     : "\(entry.state.running) sessions running").font(.headline)
                if entry.state.running == 1 && entry.state.startedAt > 0 {
                    Text(Date(timeIntervalSince1970: entry.state.startedAt), style: .timer)
                        .font(.caption).foregroundColor(.accentColor)
                }
            } else {
                Text("\(entry.state.running) sessions running").font(.headline)
                ForEach(Array(entry.state.sessions.prefix(maxRows).enumerated()), id: \.offset) { _, s in
                    HStack(spacing: 6) {
                        Circle().fill(Color.green).frame(width: 6, height: 6)
                        Text(s.project).font(.caption).lineLimit(1)
                        Spacer()
                        if s.startedAt > 0 {
                            Text(Date(timeIntervalSince1970: s.startedAt), style: .time).font(.caption2).foregroundColor(.secondary)
                        }
                    }
                }
            }
            Text("\(entry.state.finished) finished").font(.caption2).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
