import { contextBridge, ipcRenderer } from "electron";
import os from "node:os";

contextBridge.exposeInMainWorld("hermesDesktop", {
  platform: process.platform,
  shell: "electron",
  homeDirectory: os.homedir(),
  hostname: os.hostname(),
  getDesktopPaths: () => ipcRenderer.invoke("hermes:getDesktopPaths"),
  inspectLocalEnvironment: () => ipcRenderer.invoke("hermes:inspectLocalEnvironment"),
  inspectRemoteEnvironment: (input) => ipcRenderer.invoke("hermes:inspectRemoteEnvironment", input),
  suggestLocalSshKeyPath: () => ipcRenderer.invoke("hermes:suggestLocalSshKeyPath"),
  runHermesCommand: (args, options) => ipcRenderer.invoke("hermes:runHermesCommand", args, options),
  completeHermesUninstall: (input) => ipcRenderer.invoke("hermes:completeHermesUninstall", input),
  runDockerCommand: (args, options) => ipcRenderer.invoke("hermes:runDockerCommand", args, options),
  openPath: (targetPath) => ipcRenderer.invoke("hermes:openPath", targetPath),
  pickPath: (options) => ipcRenderer.invoke("hermes:pickPath", options),
  listInstances: () => ipcRenderer.invoke("hermes:listInstances"),
  getInstance: (instanceId) => ipcRenderer.invoke("hermes:getInstance", instanceId),
  listInstanceStates: () => ipcRenderer.invoke("hermes:listInstanceStates"),
  getInstanceState: (instanceId) => ipcRenderer.invoke("hermes:getInstanceState", instanceId),
  getInstanceOfficialState: (instanceId, options) => ipcRenderer.invoke("hermes:getInstanceOfficialState", instanceId, options),
  createInstanceProfile: (instanceId, input) => ipcRenderer.invoke("hermes:createInstanceProfile", instanceId, input),
  renameInstanceProfile: (instanceId, input) => ipcRenderer.invoke("hermes:renameInstanceProfile", instanceId, input),
  setDefaultInstanceProfile: (instanceId, input) => ipcRenderer.invoke("hermes:setDefaultInstanceProfile", instanceId, input),
  deleteInstanceProfile: (instanceId, input) => ipcRenderer.invoke("hermes:deleteInstanceProfile", instanceId, input),
  exportInstanceProfile: (instanceId, input) => ipcRenderer.invoke("hermes:exportInstanceProfile", instanceId, input),
  importInstanceProfile: (instanceId, input) => ipcRenderer.invoke("hermes:importInstanceProfile", instanceId, input),
  updateInstanceProviderConfig: (instanceId, input) => ipcRenderer.invoke("hermes:updateInstanceProviderConfig", instanceId, input),
  authenticateInstanceProvider: (instanceId, input) => ipcRenderer.invoke("hermes:authenticateInstanceProvider", instanceId, input),
  approveInstanceMessagingPairing: (instanceId, input) => ipcRenderer.invoke("hermes:approveInstanceMessagingPairing", instanceId, input),
  updateInstanceIntegrationConfig: (instanceId, input) => ipcRenderer.invoke("hermes:updateInstanceIntegrationConfig", instanceId, input),
  startInstanceWeixinQrLogin: (instanceId, input) => ipcRenderer.invoke("hermes:startInstanceWeixinQrLogin", instanceId, input),
  pollInstanceWeixinQrLogin: (instanceId, input) => ipcRenderer.invoke("hermes:pollInstanceWeixinQrLogin", instanceId, input),
  cancelInstanceWeixinQrLogin: (instanceId, input) => ipcRenderer.invoke("hermes:cancelInstanceWeixinQrLogin", instanceId, input),
  listInstanceProviderTests: (instanceId, options) => ipcRenderer.invoke("hermes:listInstanceProviderTests", instanceId, options),
  testInstanceProvider: (instanceId, input) => ipcRenderer.invoke("hermes:testInstanceProvider", instanceId, input),
  startInstanceGateway: (instanceId) => ipcRenderer.invoke("hermes:startInstanceGateway", instanceId),
  stopInstanceGateway: (instanceId) => ipcRenderer.invoke("hermes:stopInstanceGateway", instanceId),
  restartInstanceGateway: (instanceId) => ipcRenderer.invoke("hermes:restartInstanceGateway", instanceId),
  startInstance: (instanceId) => ipcRenderer.invoke("hermes:startInstance", instanceId),
  stopInstance: (instanceId) => ipcRenderer.invoke("hermes:stopInstance", instanceId),
  createLocalDockerInstance: (input) => ipcRenderer.invoke("hermes:createLocalDockerInstance", input),
  createLocalNativeInstance: (input) => ipcRenderer.invoke("hermes:createLocalNativeInstance", input),
  onNativeInstallProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hermes:nativeInstallProgress", listener);
    return () => ipcRenderer.removeListener("hermes:nativeInstallProgress", listener);
  },
  onInstallProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hermes:installProgress", listener);
    return () => ipcRenderer.removeListener("hermes:installProgress", listener);
  },
  createRemoteDockerInstance: (input) => ipcRenderer.invoke("hermes:createRemoteDockerInstance", input),
  importExistingLocalInstance: (input) => ipcRenderer.invoke("hermes:importExistingLocalInstance", input),
  scanImportableRemoteInstances: (input) => ipcRenderer.invoke("hermes:scanImportableRemoteInstances", input),
  importExistingRemoteInstance: (input) => ipcRenderer.invoke("hermes:importExistingRemoteInstance", input),
  getInstanceLogs: (instanceId, options) => ipcRenderer.invoke("hermes:getInstanceLogs", instanceId, options),
  getInstanceDiagnostics: (instanceId) => ipcRenderer.invoke("hermes:getInstanceDiagnostics", instanceId),
  listInstanceBackups: (instanceId) => ipcRenderer.invoke("hermes:listInstanceBackups", instanceId),
  createInstanceBackup: (instanceId, options) => ipcRenderer.invoke("hermes:createInstanceBackup", instanceId, options),
  importInstanceBackup: (instanceId, input) => ipcRenderer.invoke("hermes:importInstanceBackup", instanceId, input),
  restoreInstanceBackup: (instanceId, backupId) => ipcRenderer.invoke("hermes:restoreInstanceBackup", instanceId, backupId),
  deleteInstanceBackup: (instanceId, backupId) => ipcRenderer.invoke("hermes:deleteInstanceBackup", instanceId, backupId),
  clearInstanceBackups: (instanceId) => ipcRenderer.invoke("hermes:clearInstanceBackups", instanceId),
  destroyInstance: (instanceId) => ipcRenderer.invoke("hermes:destroyInstance", instanceId),
  listInstanceWorkspaceSessions: (instanceId, options) => ipcRenderer.invoke("hermes:listInstanceWorkspaceSessions", instanceId, options),
  getInstanceWorkspaceSession: (instanceId, sessionId, options) =>
    ipcRenderer.invoke("hermes:getInstanceWorkspaceSession", instanceId, sessionId, options),
  getInstanceWorkspaceState: (instanceId, options) => ipcRenderer.invoke("hermes:getInstanceWorkspaceState", instanceId, options),
  runInstanceWorkspaceChat: (instanceId, input, options) =>
    ipcRenderer.invoke("hermes:runInstanceWorkspaceChat", instanceId, input, options),
  renameInstanceWorkspaceSession: (instanceId, sessionId, input) =>
    ipcRenderer.invoke("hermes:renameInstanceWorkspaceSession", instanceId, sessionId, input),
  deleteInstanceWorkspaceSession: (instanceId, sessionId, options) =>
    ipcRenderer.invoke("hermes:deleteInstanceWorkspaceSession", instanceId, sessionId, options),
});
