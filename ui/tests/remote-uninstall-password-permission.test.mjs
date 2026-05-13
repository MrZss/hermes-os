import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sshRuntimeModule = await import(path.join(root, "desktop/services/ssh-runtime.mjs"));
const instanceRuntime = fs.readFileSync(path.join(root, "desktop/services/instance-runtime.mjs"), "utf8");
const sshRuntimeSource = fs.readFileSync(path.join(root, "desktop/services/ssh-runtime.mjs"), "utf8");

assert.equal(
  typeof sshRuntimeModule.mapSshFailure,
  "function",
  "SSH runtime should expose mapSshFailure for regression coverage of command-vs-auth failures.",
);

const workspacePermissionDenied = sshRuntimeModule.mapSshFailure(
  {
    ok: false,
    timedOut: false,
    exitCode: 1,
    stdout: "",
    stderr: "deploy@192.0.2.10's password:\r\nrm: cannot remove '/var/services/homes/hermes/hermes/5555/home': Permission denied",
  },
  "password",
);

assert.equal(
  workspacePermissionDenied.error?.code,
  "SSH_COMMAND_FAILED",
  "Remote cleanup filesystem Permission denied must stay a command failure, not be misreported as SSH_PASSWORD_REJECTED.",
);
assert.doesNotMatch(
  workspacePermissionDenied.error?.detail ?? "",
  /password:/i,
  "Remote command failures should strip SSH password prompt noise from user-facing details.",
);

const rejectedCredential = sshRuntimeModule.mapSshFailure(
  {
    ok: false,
    timedOut: false,
    exitCode: 255,
    stdout: "",
    stderr: "Permission denied (password,keyboard-interactive).\nAuthentications that can continue: password",
  },
  "password",
);

assert.equal(
  rejectedCredential.error?.code,
  "SSH_PASSWORD_REJECTED",
  "Authentication-style Permission denied output should still be reported as rejected SSH credentials.",
);

assert.doesNotMatch(
  sshRuntimeSource,
  /-re \{\(\?i\)\(permission denied\|authentication failed\|access denied\)\}/,
  "Password expect loop must not consume generic remote command Permission denied output as an SSH credential rejection.",
);

assert.match(
  sshRuntimeSource,
  /permission denied \\\(\.\*\\\)|permission denied, please try again/,
  "Password expect loop should only mark authentication-style Permission denied output as credential rejection.",
);

assert.match(
  instanceRuntime,
  /async function removeRemoteDockerWorkspaceContents/,
  "Remote Docker uninstall should have a dedicated workspace cleanup step for bind-mounted files owned by the container user.",
);

assert.match(
  instanceRuntime,
  /runRemoteDockerCommand\(\s*connection,\s*\[[\s\S]*"run",[\s\S]*"--rm",[\s\S]*"-v",[\s\S]*`\$\{workspaceDir\}:\/target`,[\s\S]*"rm -rf \/target\/\* \/target\/\.\[!\.\]\* \/target\/\.\.\?\*"/,
  "Remote Docker uninstall should use a temporary root container to remove bind-mounted workspace contents before host rm -rf.",
);

assert.match(
  instanceRuntime,
  /await removeRemoteContainer\(connection,\s*instance\.docker\?\.containerName\);[\s\S]{0,180}await removeRemoteDockerWorkspaceContents\(connection,\s*instance\);/,
  "Remote Docker uninstall should remove the managed container, clean root-owned bind-mount contents, then remove the workspace directory.",
);

console.log("remote uninstall password permission assertions passed");
