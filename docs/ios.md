# iOS

The iOS platform is scaffolded with Capacitor (`npx cap add ios`). Building requires
**macOS + Xcode** (not available on Windows), so this is prepared, not compiled here.

## Build

```bash
npm run build
npx cap sync ios
npx cap open ios          # opens Xcode
```

In Xcode: set your team/bundle id, then Run on a device or simulator.

## Pairing

Same pairing deep link as Android (`ai.opencode.remote://connect?host=…&port=…&token=…`).
Add the URL scheme `ai.opencode.remote` to **Info → URL Types** in Xcode.

## Widget (WidgetKit)

The widget scaffold lives in `ios/App/OpenCodeWidget/`:

1. In Xcode: **File → New → Target… → Widget Extension**, name it `OpenCodeWidget`,
   uncheck "Include Configuration Intent".
2. Add `ios/App/OpenCodeWidget/OpenCodeWidget.swift` to that target.
3. Add a **shared App Group** `group.ai.opencode.remote` to **both** the App and the
   widget target (Signing & Capabilities → App Groups).
4. Add `ios/App/App/SessionWidgetPlugin.swift` to the **App** target (it writes the
   session state into the App Group and reloads the widget timelines).

The JS side already calls `SessionWidget.updateState({ running, finished, project, startedAt })`
through `src/core/widget.ts`; on iOS the plugin above handles it.

## Notifications

`@capacitor/local-notifications` is installed; iOS will prompt for the notification
permission at first launch (the onboarding screen requests it).

## Security

As on Android, keep the bridge inside your VPN. For TLS, run the bridge with
`--tls --cert <pem> --key <pem>` and enable "Encrypted connection (HTTPS/WSS)" in Settings.
