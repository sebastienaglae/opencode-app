import { useEffect } from "react";
import { IonApp, IonIcon } from "@ionic/react";
import { App as CapacitorApp } from "@capacitor/app";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { chatbubblesOutline, cubeOutline, folderOutline, settingsOutline, terminalOutline } from "ionicons/icons";

import { useConnection } from "./core/store/connection";
import { useSettings } from "./core/store/settings";
import { useNotifications } from "./hooks/useNotifications";
import { useSessionWidget } from "./hooks/useSessionWidget";
import { setNavigator } from "./core/navigation";
import { useT } from "./core/i18n";
import { Toaster } from "./components/Toaster";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { Onboarding } from "./components/Onboarding";
import { toast } from "./core/store/toast";
import ProjectsScreen from "./screens/ProjectsScreen";
import ProjectSessionsScreen from "./screens/ProjectSessionsScreen";
import ConversationScreen from "./screens/ConversationScreen";
import FilesScreen from "./screens/FilesScreen";
import ModelsScreen from "./screens/ModelsScreen";
import CommandsScreen from "./screens/CommandsScreen";
import ConsoleScreen from "./screens/ConsoleScreen";
import SettingsScreen from "./screens/SettingsScreen";

function RouterBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    setNavigator((to) => navigate(to));
  }, [navigate]);
  return null;
}

function TabBar() {
  const t = useT();
  const { pathname } = useLocation();
  if (pathname.startsWith("/session/") || pathname.startsWith("/console")) return null;
  const tabs = [
    { to: "/projects", label: t("projects.title"), icon: chatbubblesOutline },
    { to: "/files", label: t("tab.files"), icon: folderOutline },
    { to: "/models", label: t("tab.models"), icon: cubeOutline },
    { to: "/commands", label: t("tab.commands"), icon: terminalOutline },
    { to: "/settings", label: t("tab.settings"), icon: settingsOutline },
  ];
  return (
    <nav className="flex border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-semibold transition-colors ${
              isActive ? "text-accent" : "text-faint"
            }`
          }
        >
          <IonIcon icon={tab.icon} className="text-[21px]" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const t = useT();
  useNotifications();
  useSessionWidget();
  useEffect(() => {
    void useConnection.getState().connect();
    const sub = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive && useSettings.getState().hydrated) void useConnection.getState().connect();
    });
    const backSub = CapacitorApp.addListener("backButton", () => {
      if (window.history.length > 1) window.history.back();
      else void CapacitorApp.exitApp();
    });
    const urlSub = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      try {
        const u = new URL(url);
        const host = u.searchParams.get("host");
        const port = Number(u.searchParams.get("port"));
        const token = u.searchParams.get("token");
        const secure = u.searchParams.get("secure");
        const patch: { host?: string; port?: number; token?: string; secure?: boolean } = {};
        if (host) patch.host = host;
        if (port) patch.port = port;
        if (token) patch.token = token;
        if (secure) patch.secure = secure === "1" || secure === "true";
        if (Object.keys(patch).length > 0) {
          useSettings.getState().update(patch);
          toast.success(t("toast.paired"));
          void useConnection.getState().connect();
        }
      } catch {
        /* ignore malformed pairing link */
      }
    });
    return () => {
      void sub.then((handle) => handle.remove());
      void backSub.then((handle) => handle.remove());
      void urlSub.then((handle) => handle.remove());
    };
  }, [t]);

  return (
    <IonApp>
      <HashRouter>
        <RouterBridge />
        <div className="flex h-full flex-col bg-bg text-fg">
          <Toaster />
          <ConnectionBanner />
          <div className="relative min-h-0 flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects" element={<ProjectsScreen />} />
              <Route path="/project/:id" element={<ProjectSessionsScreen />} />
              <Route path="/sessions" element={<Navigate to="/projects" replace />} />
              <Route path="/session/:id" element={<ConversationScreen />} />
              <Route path="/files" element={<FilesScreen />} />
              <Route path="/models" element={<ModelsScreen />} />
              <Route path="/commands" element={<CommandsScreen />} />
              <Route path="/console" element={<ConsoleScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </div>
          <TabBar />
        </div>
        <Onboarding />
      </HashRouter>
    </IonApp>
  );
}
