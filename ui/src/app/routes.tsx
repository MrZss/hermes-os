import { createBrowserRouter } from "react-router";
import type { ComponentType } from "react";
import { RootLayout } from "./layout/RootLayout";
import { InstanceSetupGate } from "./components/console/InstanceSetupGate";
import { Dashboard } from "./pages/Dashboard";
import { CreateInstance } from "./pages/CreateInstance";
import { Onboarding } from "./pages/Onboarding";
import { Settings } from "./pages/Settings";
import { Overview } from "./pages/instance/Overview";
import { Chat } from "./pages/instance/Chat";
import { Profiles } from "./pages/instance/Profiles";
import { Providers } from "./pages/instance/Providers";
import { Integrations } from "./pages/instance/Integrations";
import { Logs } from "./pages/instance/Logs";
import { Backups } from "./pages/instance/Backups";
import { Environment } from "./pages/instance/Environment";
import { Deployment } from "./pages/instance/Deployment";
import { Diagnostics } from "./pages/instance/Diagnostics";

function withInstanceSetupGate(Component: ComponentType) {
  return function GatedInstanceUsagePage() {
    return (
      <InstanceSetupGate>
        <Component />
      </InstanceSetupGate>
    );
  };
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "welcome", Component: Onboarding },
      { path: "create", Component: CreateInstance },
      { path: "settings", Component: Settings },
      {
        path: "instance/:id",
        children: [
          { index: true, Component: withInstanceSetupGate(Overview) },
          { path: "chat", Component: withInstanceSetupGate(Chat) },
          { path: "profiles", Component: withInstanceSetupGate(Profiles) },
          { path: "providers", Component: Providers },
          { path: "integrations", Component: Integrations },
          { path: "logs", Component: withInstanceSetupGate(Logs) },
          { path: "backups", Component: withInstanceSetupGate(Backups) },
          { path: "environment", Component: Environment },
          { path: "deployment", Component: Deployment },
          { path: "diagnostics", Component: Diagnostics },
        ],
      },
    ],
  },
]);
