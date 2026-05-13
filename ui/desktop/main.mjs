import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDesktopPaths, inspectLocalEnvironment } from "./services/environment.mjs";
import { runDockerCommand } from "./services/docker-runtime.mjs";
import { runHermesCommand } from "./services/hermes-cli.mjs";
import { completeHermesUninstall } from "./services/hermes-uninstall.mjs";
import { getRegisteredInstance, listRegisteredInstances } from "./services/instance-registry.mjs";
import { createLocalDockerInstance, createLocalNativeInstance } from "./services/local-instance.mjs";
import { createRemoteDockerInstance } from "./services/remote-instance.mjs";
import { importExistingLocalInstance } from "./services/import-existing-instance.mjs";
import { importExistingRemoteInstance, scanImportableRemoteInstances } from "./services/import-existing-remote-instance.mjs";
import { getInstanceState, listInstanceStates, startInstance, stopInstance } from "./services/instance-state.mjs";
import { getInstanceOfficialState } from "./services/hermes-official-state.mjs";
import {
  authenticateInstanceProvider,
  approveInstanceMessagingPairing,
  cancelInstanceWeixinQrLogin,
  createInstanceProfile,
  deleteInstanceProfile,
  exportInstanceProfile,
  importInstanceProfile,
  pollInstanceWeixinQrLogin,
  renameInstanceProfile,
  restartInstanceGateway,
  setDefaultInstanceProfile,
  startInstanceGateway,
  startInstanceWeixinQrLogin,
  stopInstanceGateway,
  updateInstanceIntegrationConfig,
  updateInstanceProviderConfig,
} from "./services/hermes-official-actions.mjs";
import { listInstanceProviderTests, testInstanceProvider } from "./services/provider-tests.mjs";
import { inspectRemoteEnvironment } from "./services/remote-environment.mjs";
import { suggestLocalSshKeyPath } from "./services/ssh-runtime.mjs";
import {
  createInstanceBackup,
  clearInstanceBackups,
  destroyInstance,
  deleteInstanceBackup,
  getInstanceDiagnostics,
  getInstanceLogs,
  importInstanceBackup,
  listInstanceBackups,
  restoreInstanceBackup,
} from "./services/instance-runtime.mjs";
import {
  deleteInstanceWorkspaceSession,
  getInstanceWorkspaceSession,
  getInstanceWorkspaceState,
  listInstanceWorkspaceSessions,
  renameInstanceWorkspaceSession,
  runInstanceWorkspaceChat,
} from "./services/workspace-state.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const appDisplayName = "Hermes Console";
const appIconPngPath = path.join(__dirname, "assets", "hermes-console-icon.png");
let handlersRegistered = false;
let mainWindow = null;

app.setName(appDisplayName);

function applyDesktopBranding() {
  if (process.platform === "darwin" && app.dock && existsSync(appIconPngPath)) {
    app.dock.setIcon(appIconPngPath);
  }

  app.setAboutPanelOptions({
    applicationName: appDisplayName,
    applicationVersion: app.getVersion(),
    iconPath: existsSync(appIconPngPath) ? appIconPngPath : undefined,
  });
}

function emitNativeInstallProgress(webContents, payload) {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.send("hermes:nativeInstallProgress", payload);
}

function emitInstallProgress(webContents, payload) {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.send("hermes:installProgress", payload);
  webContents.send("hermes:nativeInstallProgress", payload);
}

function registerIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("hermes:getDesktopPaths", async () => {
    return getDesktopPaths(app.getPath("userData"));
  });

  ipcMain.handle("hermes:inspectLocalEnvironment", async () => {
    return inspectLocalEnvironment({ userDataPath: app.getPath("userData") });
  });

  ipcMain.handle("hermes:inspectRemoteEnvironment", async (_event, input) => {
    return inspectRemoteEnvironment(input);
  });

  ipcMain.handle("hermes:suggestLocalSshKeyPath", async () => {
    return suggestLocalSshKeyPath();
  });

  ipcMain.handle("hermes:runHermesCommand", async (_event, args, options) => {
    return runHermesCommand(args, options);
  });

  ipcMain.handle("hermes:completeHermesUninstall", async (_event, input) => {
    return completeHermesUninstall({
      userDataPath: app.getPath("userData"),
      input,
    });
  });

  ipcMain.handle("hermes:runDockerCommand", async (_event, args, options) => {
    return runDockerCommand(args, options);
  });

  ipcMain.handle("hermes:openPath", async (_event, targetPath) => {
    const openResult = await shell.openPath(targetPath);
    return {
      ok: !openResult,
      data: {
        path: targetPath,
      },
      error: openResult
        ? {
            code: "OPEN_PATH_FAILED",
            message: "打开路径失败。",
            detail: openResult,
            recoverable: true,
          }
        : undefined,
    };
  });

  ipcMain.handle("hermes:pickPath", async (_event, options = {}) => {
    const browserWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(browserWindow, {
      title: options.title || "选择路径",
      properties: [options.type === "directory" ? "openDirectory" : "openFile"],
      filters: Array.isArray(options.filters) ? options.filters : undefined,
    });

    return {
      ok: !result.canceled && Boolean(result.filePaths[0]),
      data: result.canceled ? undefined : { path: result.filePaths[0] },
      error: result.canceled
        ? {
            code: "PICK_PATH_CANCELLED",
            message: "已取消选择。",
            detail: "用户取消了路径选择。",
            recoverable: true,
          }
        : undefined,
    };
  });

  ipcMain.handle("hermes:listInstances", async () => {
    return listRegisteredInstances(app.getPath("userData"));
  });

  ipcMain.handle("hermes:getInstance", async (_event, instanceId) => {
    return getRegisteredInstance(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:listInstanceStates", async () => {
    return listInstanceStates(app.getPath("userData"));
  });

  ipcMain.handle("hermes:getInstanceState", async (_event, instanceId) => {
    return getInstanceState(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:getInstanceOfficialState", async (_event, instanceId, options) => {
    return getInstanceOfficialState(app.getPath("userData"), instanceId, options);
  });

  ipcMain.handle("hermes:createInstanceProfile", async (_event, instanceId, input) => {
    return createInstanceProfile(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:renameInstanceProfile", async (_event, instanceId, input) => {
    return renameInstanceProfile(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:setDefaultInstanceProfile", async (_event, instanceId, input) => {
    return setDefaultInstanceProfile(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:deleteInstanceProfile", async (_event, instanceId, input) => {
    return deleteInstanceProfile(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:exportInstanceProfile", async (_event, instanceId, input) => {
    return exportInstanceProfile(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:importInstanceProfile", async (_event, instanceId, input) => {
    return importInstanceProfile(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:updateInstanceProviderConfig", async (_event, instanceId, input) => {
    return updateInstanceProviderConfig(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:authenticateInstanceProvider", async (_event, instanceId, input) => {
    return authenticateInstanceProvider(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:approveInstanceMessagingPairing", async (_event, instanceId, input) => {
    return approveInstanceMessagingPairing(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:updateInstanceIntegrationConfig", async (_event, instanceId, input) => {
    return updateInstanceIntegrationConfig(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:startInstanceWeixinQrLogin", async (_event, instanceId, input) => {
    return startInstanceWeixinQrLogin(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:pollInstanceWeixinQrLogin", async (_event, instanceId, input) => {
    return pollInstanceWeixinQrLogin(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:cancelInstanceWeixinQrLogin", async (_event, instanceId, input) => {
    return cancelInstanceWeixinQrLogin(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:listInstanceProviderTests", async (_event, instanceId, options) => {
    return listInstanceProviderTests(app.getPath("userData"), instanceId, options);
  });

  ipcMain.handle("hermes:testInstanceProvider", async (_event, instanceId, input) => {
    return testInstanceProvider(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:startInstanceGateway", async (_event, instanceId) => {
    return startInstanceGateway(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:stopInstanceGateway", async (_event, instanceId) => {
    return stopInstanceGateway(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:restartInstanceGateway", async (_event, instanceId) => {
    return restartInstanceGateway(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:startInstance", async (_event, instanceId) => {
    return startInstance(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:stopInstance", async (_event, instanceId) => {
    return stopInstance(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:createLocalDockerInstance", async (_event, input) => {
    return createLocalDockerInstance({
      userDataPath: app.getPath("userData"),
      input,
      onProgress: (payload) => emitInstallProgress(_event.sender, payload),
    });
  });

  ipcMain.handle("hermes:createLocalNativeInstance", async (event, input) => {
    return createLocalNativeInstance({
      userDataPath: app.getPath("userData"),
      input,
      onProgress: (payload) => emitInstallProgress(event.sender, payload),
    });
  });

  ipcMain.handle("hermes:createRemoteDockerInstance", async (_event, input) => {
    return createRemoteDockerInstance({
      userDataPath: app.getPath("userData"),
      input,
    });
  });

  ipcMain.handle("hermes:importExistingLocalInstance", async (_event, input) => {
    return importExistingLocalInstance({
      userDataPath: app.getPath("userData"),
      input,
    });
  });

  ipcMain.handle("hermes:scanImportableRemoteInstances", async (_event, input) => {
    return scanImportableRemoteInstances({ input });
  });

  ipcMain.handle("hermes:importExistingRemoteInstance", async (_event, input) => {
    return importExistingRemoteInstance({
      userDataPath: app.getPath("userData"),
      input,
    });
  });

  ipcMain.handle("hermes:getInstanceLogs", async (_event, instanceId, options) => {
    return getInstanceLogs(app.getPath("userData"), instanceId, options);
  });

  ipcMain.handle("hermes:getInstanceDiagnostics", async (_event, instanceId) => {
    return getInstanceDiagnostics(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:listInstanceBackups", async (_event, instanceId) => {
    return listInstanceBackups(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:createInstanceBackup", async (_event, instanceId, options) => {
    return createInstanceBackup(app.getPath("userData"), instanceId, options);
  });

  ipcMain.handle("hermes:importInstanceBackup", async (_event, instanceId, input) => {
    return importInstanceBackup(app.getPath("userData"), instanceId, input);
  });

  ipcMain.handle("hermes:restoreInstanceBackup", async (_event, instanceId, backupId) => {
    return restoreInstanceBackup(app.getPath("userData"), instanceId, backupId);
  });

  ipcMain.handle("hermes:deleteInstanceBackup", async (_event, instanceId, backupId) => {
    return deleteInstanceBackup(app.getPath("userData"), instanceId, backupId);
  });

  ipcMain.handle("hermes:clearInstanceBackups", async (_event, instanceId) => {
    return clearInstanceBackups(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:destroyInstance", async (_event, instanceId) => {
    return destroyInstance(app.getPath("userData"), instanceId);
  });

  ipcMain.handle("hermes:listInstanceWorkspaceSessions", async (_event, instanceId, options) => {
    return listInstanceWorkspaceSessions(app.getPath("userData"), instanceId, options);
  });

  ipcMain.handle("hermes:getInstanceWorkspaceSession", async (_event, instanceId, sessionId, options) => {
    return getInstanceWorkspaceSession(app.getPath("userData"), instanceId, sessionId, options);
  });

  ipcMain.handle("hermes:getInstanceWorkspaceState", async (_event, instanceId, options) => {
    return getInstanceWorkspaceState(app.getPath("userData"), instanceId, options);
  });

  ipcMain.handle("hermes:runInstanceWorkspaceChat", async (_event, instanceId, input, options) => {
    return runInstanceWorkspaceChat(app.getPath("userData"), instanceId, input, options);
  });

  ipcMain.handle("hermes:renameInstanceWorkspaceSession", async (_event, instanceId, sessionId, input) => {
    return renameInstanceWorkspaceSession(app.getPath("userData"), instanceId, sessionId, input);
  });

  ipcMain.handle("hermes:deleteInstanceWorkspaceSession", async (_event, instanceId, sessionId, options) => {
    return deleteInstanceWorkspaceSession(app.getPath("userData"), instanceId, sessionId, options);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f6f4ef",
    autoHideMenuBar: true,
    title: appDisplayName,
    icon: appIconPngPath,
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  applyDesktopBranding();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (!mainWindow) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
