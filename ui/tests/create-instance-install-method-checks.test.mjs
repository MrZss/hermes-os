import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const createInstance = fs.readFileSync(path.join(root, "src/app/pages/CreateInstance.tsx"), "utf8");

assert.match(
  createInstance,
  /getLocalRuntimeSummary\(localEnvironmentInspection, installType\)/,
  "Local environment summary should render the selected install method instead of always using Docker status",
);

assert.match(
  createInstance,
  /getLocalEnvironmentAnnouncement\(inspection, installType\)/,
  "Retry environment hint should announce the selected install method instead of hardcoding Docker detail",
);

assert.match(
  createInstance,
  /installType === "native"[\s\S]*name: "Hermes CLI"[\s\S]*:\s*\[[\s\S]*name: "运行服务"/,
  "Local checks should branch by install method so Native checks Hermes CLI and the hidden container path checks runtime service readiness",
);

assert.match(
  createInstance,
  /installType === "docker" && Boolean\(localEnvironmentInspection\?\.docker\.daemonRunning\)/,
  "Local Docker deployment should require Docker daemon readiness before enabling deploy",
);

assert.match(
  createInstance,
  /installType === "native" && Boolean\(localEnvironmentInspection\)/,
  "Local Native deployment should remain selectable after uninstall so the app can install Hermes CLI",
);

assert.match(
  createInstance,
  /installHermesIfMissing:\s*targetType === "local" && installType === "native" && !localEnvironmentInspection\?\.hermes\.available/,
  "Local Native create payload should explicitly request official Hermes install when CLI is missing",
);

assert.match(
  createInstance,
  /安装 Hermes 并创建实例/,
  "Final Native CTA should explain that missing CLI will be installed instead of saying the path is unavailable",
);

assert.match(
  createInstance,
  /const isLocalNativeDeploy = targetType === "local" && installType === "native"/,
  "Deploy loading copy should know when the local Native path is selected",
);

assert.match(
  createInstance,
  /Hermes Gateway/,
  "Native deploy loading state should mention Hermes Gateway instead of docker-only wording",
);


assert.match(
  createInstance,
  /运行服务未启动/,
  "Hidden container-path unavailable CTA should explain that the runtime service is not running instead of showing a generic deployment-path error",
);

assert.match(
  createInstance,
  /deployUnavailableReason/,
  "Create instance page should derive a precise unavailable reason for the selected deployment path",
);

assert.doesNotMatch(
  createInstance,
  /canDeployCurrentSelection \? deployButtonLabel : "当前部署路径不可用"/,
  "Final deploy CTA should not collapse Docker daemon failures into a generic path unavailable label",
);

assert.doesNotMatch(
  createInstance,
  /点击部署会返回真实错误/,
  "Docker daemon failures should be blocked before deploy instead of creating a failed instance just to surface the error",
);

const instancesService = fs.readFileSync(path.join(root, "desktop/services/local-instance.mjs"), "utf8");
assert.match(
  instancesService,
  /installHermesIfMissing/,
  "Desktop Native instance creation should accept an explicit installHermesIfMissing flag",
);
assert.match(
  instancesService,
  /installHermesCli/,
  "Desktop Native instance creation should run the official installer when Hermes CLI is missing and the flag is present",
);
assert.match(
  instancesService,
  /onProgress:\s*input\?\.operationId/,
  "Desktop Native instance creation should pass operation-scoped progress callbacks to the installer",
);


assert.match(
  instancesService,
  /function buildHermesCliConfig\(\{ providerId, model \} = \{\}\)/,
  "Instance bootstrap should build config.yaml from the provider and model chosen in the create-instance wizard",
);
assert.match(
  instancesService,
  /bootstrapHermesHome\(hermesHome, \{\s*providerId: input\?\.providerId,\s*model: input\?\.model,\s*\}\)/,
  "Local instance creation should pass selected provider/model into CLI config bootstrap",
);

const remoteInstanceService = fs.readFileSync(path.join(root, "desktop/services/remote-instance.mjs"), "utf8");
assert.match(
  remoteInstanceService,
  /function buildHermesCliConfig\(\{ providerId, model \} = \{\}\)/,
  "Remote bootstrap should build config.yaml from the provider and model chosen in the create-instance wizard",
);
assert.match(
  remoteInstanceService,
  /providerId: input\?\.providerId,[\s\S]*model: input\?\.model,[\s\S]*deploymentMetadata: bootstrapMetadata/,
  "Remote instance creation should pass selected provider/model into CLI config bootstrap",
);


assert.match(
  instancesService,
  /ensureDockerDaemonRunning/,
  "Desktop Docker instance creation should try to repair Docker daemon availability before failing",
);
assert.match(
  instancesService,
  /autoStartDockerDesktop:\s*input\?\.autoStartDockerDesktop !== false/,
  "Local Docker creation should auto-start Docker Desktop by default unless explicitly disabled",
);
assert.match(
  instancesService,
  /autoInstallDockerDesktop:\s*input\?\.autoInstallDockerDesktop !== false/,
  "Local Docker creation should try to install Docker Desktop by default when Docker is missing",
);
assert.match(
  instancesService,
  /await ensureDockerDaemonRunning\(\{ autoStart:[\s\S]*autoInstall:/,
  "Local Docker creation should repair missing or stopped Docker before continuing",
);

const dockerRuntimeService = fs.readFileSync(path.join(root, "desktop/services/docker-runtime.mjs"), "utf8");
assert.match(
  dockerRuntimeService,
  /export async function ensureDockerDaemonRunning/,
  "Docker runtime service should expose a daemon repair helper",
);
assert.match(
  dockerRuntimeService,
  /export async function installDockerDesktop/,
  "Docker runtime service should expose a Docker Desktop install helper",
);
assert.match(
  dockerRuntimeService,
  /brew["']?,\s*\["install",\s*"--cask",\s*"docker"\]/,
  "Docker install helper should install Docker Desktop through Homebrew when possible",
);
assert.match(
  dockerRuntimeService,
  /process\.platform === "win32"[\s\S]*winget[\s\S]*Docker\.DockerDesktop/,
  "Docker install helper should detect Windows and use winget for Docker Desktop when possible",
);
assert.match(
  dockerRuntimeService,
  /process\.platform === "linux"[\s\S]*DOCKER_OFFICIAL_INSTALL_SCRIPT_URL/,
  "Docker install helper should detect Linux and use Docker official engine install path when possible",
);
assert.match(
  dockerRuntimeService,
  /systemctl[\s\S]*docker/,
  "Docker daemon repair should try to start the Linux docker service",
);
assert.match(
  dockerRuntimeService,
  /platformLabel/,
  "Docker environment checks should expose detected operating system information",
);
assert.match(
  dockerRuntimeService,
  /open["']?,\s*\["-a",\s*"Docker"\]/,
  "Daemon repair helper should open Docker Desktop on macOS",
);
assert.match(
  dockerRuntimeService,
  /runProcess\(dockerCommand,\s*\["info"\]/,
  "Daemon repair helper should poll docker info until the daemon is ready",
);
assert.match(
  dockerRuntimeService,
  /export async function ensureDockerImageAvailable/,
  "Docker runtime should expose an image pull self-repair helper",
);
assert.match(
  dockerRuntimeService,
  /DEFAULT_DOCKER_PULL_TIMEOUT_MS\s*=\s*600_000/,
  "Docker image pull should allow large first-time image downloads instead of timing out at 120 seconds",
);
assert.match(
  dockerRuntimeService,
  /DEFAULT_DOCKER_PULL_ATTEMPTS\s*=\s*3/,
  "Docker image pull should retry so partially downloaded layers can resume",
);
assert.match(
  dockerRuntimeService,
  /\["image",\s*"inspect",\s*image\]/,
  "Docker image helper should inspect whether the image is already available before pulling",
);
assert.match(
  dockerRuntimeService,
  /\["pull",\s*image\]/,
  "Docker image helper should pull the image explicitly before docker run",
);
assert.match(
  instancesService,
  /ensureDockerImageAvailable\(DEFAULT_DOCKER_IMAGE/,
  "Local Docker create should pre-pull the Hermes image before starting the container",
);
assert.match(
  remoteInstanceService,
  /ensureRemoteDockerImageAvailable\(connection, DEFAULT_DOCKER_IMAGE/,
  "Remote Docker create should pre-pull the Hermes image before starting the container",
);
const instanceStateService = fs.readFileSync(path.join(root, "desktop/services/instance-state.mjs"), "utf8");
assert.match(
  instanceStateService,
  /ensureDockerImageAvailable\(instance\.docker\.image\)/,
  "Local Docker redeploy should pre-pull the image before running the container",
);
assert.match(
  instanceStateService,
  /ensureRemoteDockerImageAvailable\(connection, instance\.docker\.image\)/,
  "Remote Docker redeploy should pre-pull the image before running the container",
);
assert.doesNotMatch(
  instancesService + remoteInstanceService + instanceStateService,
  /"--pull"/,
  "Docker run should not rely on implicit --pull timeouts after the image pre-pull helper is added",
);

const installerService = fs.readFileSync(path.join(root, "desktop/services/hermes-installer.mjs"), "utf8");
assert.ok(
  installerService.includes("https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh"),
  "Hermes installer service should use the official NousResearch install script URL",
);
assert.match(
  installerService,
  /onProgress\?\.\(\{[\s\S]*stage:\s*"run"[\s\S]*stream:\s*"stdout"/,
  "Hermes installer should stream stdout progress while the install script runs",
);
assert.match(
  installerService,
  /onProgress\?\.\(\{[\s\S]*stage:\s*"run"[\s\S]*stream:\s*"stderr"/,
  "Hermes installer should stream stderr progress while the install script runs",
);
assert.match(
  installerService,
  /runProcess\("bash", \[scriptPath, "--skip-setup"\]/,
  "Hermes installer should skip the interactive setup wizard so import prompts cannot block the desktop install flow",
);

const main = fs.readFileSync(path.join(root, "desktop/main.mjs"), "utf8");
const preload = fs.readFileSync(path.join(root, "desktop/preload.mjs"), "utf8");
const dts = fs.readFileSync(path.join(root, "src/hermes-desktop.d.ts"), "utf8");
assert.match(main, /hermes:nativeInstallProgress/, "Main process should emit native install progress events");
assert.match(preload, /onNativeInstallProgress/, "Preload should expose a native install progress subscription");
assert.match(preload, /removeListener\("hermes:nativeInstallProgress"/, "Preload progress subscription should be removable");
assert.match(dts, /interface HermesNativeInstallProgressEvent/, "Desktop bridge types should include native install progress events");
assert.match(dts, /operationId\?: string/, "Native install input should accept an operationId for progress correlation");
assert.match(
  createInstance,
  /deployProgressEvents/,
  "Create instance page should store deployment progress events",
);
assert.match(
  createInstance,
  /onInstallProgress \?\? window\.hermesDesktop\?\.onNativeInstallProgress/,
  "Create instance page should subscribe to the unified install progress channel and fall back to native-only progress",
);
assert.match(
  createInstance,
  /安装进度/,
  "Create instance loading state should render an install progress section",
);
assert.match(
  createInstance,
  /operationId:\s*deployOperationId/,
  "Create instance page should pass an operationId into local deploy actions so progress events can be correlated",
);
assert.match(
  createInstance,
  /const dockerWillShowProgress = targetType === "local" && installType === "docker"/,
  "Local Docker deploy should also expose staged progress information",
);
assert.match(
  createInstance,
  /shouldShowInstallProgress = nativeWillInstallHermes \|\| dockerWillShowProgress/,
  "Install progress card should show for both native installer runs and local Docker setup",
);
assert.match(
  createInstance,
  /阶段详情/,
  "Docker setup should show staged progress details when there is no raw installer stdout/stderr stream",
);
assert.match(
  createInstance,
  /安装器原始输出/,
  "Create instance loading state should keep raw installer output available in technical details",
);

assert.match(
  fs.readFileSync(path.join(root, "src/app/services/instances.ts"), "utf8"),
  /autoStartDockerDesktop\?: boolean[\s\S]*autoInstallDockerDesktop\?: boolean[\s\S]*operationId\?: string/,
  "Renderer instance service types should expose Docker auto-repair and operationId options",
);

assert.match(main, /hermes:installProgress/, "Main process should emit unified install progress events");
assert.match(preload, /onInstallProgress/, "Preload should expose a unified install progress subscription");
assert.match(preload, /removeListener\("hermes:installProgress"/, "Unified install progress subscription should be removable");
assert.match(
  dockerRuntimeService,
  /stage:\s*"docker-image-pull"/,
  "Docker runtime should emit docker-image-pull progress stages",
);
assert.match(
  dockerRuntimeService,
  /stage:\s*"docker-ready"/,
  "Docker runtime should emit docker-ready progress stages once the daemon is healthy",
);
assert.match(
  instancesService,
  /emitInstallEvent\(input, onProgress, \{/,
  "Local Docker instance creation should forward staged progress events back to the renderer",
);

console.log("create instance install-method checks passed");
