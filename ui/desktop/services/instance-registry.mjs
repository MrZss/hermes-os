import fs from "node:fs/promises";
import path from "node:path";

const REGISTRY_FILENAME = "instances.json";
const REGISTRY_VERSION = 1;

function createEmptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    instances: [],
  };
}

function ensureValidRegistry(data) {
  if (!data || typeof data !== "object") {
    return createEmptyRegistry();
  }

  const instances = Array.isArray(data.instances) ? data.instances : [];

  return {
    version: REGISTRY_VERSION,
    instances,
  };
}

export function getRegistryFilePath(userDataPath) {
  return path.join(userDataPath, REGISTRY_FILENAME);
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeRegistryFile(filePath, data) {
  await ensureParentDirectory(filePath);
  const normalized = ensureValidRegistry(data);
  const tempFilePath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tempFilePath, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tempFilePath, filePath);
  return normalized;
}

export async function readInstanceRegistry(userDataPath) {
  const filePath = getRegistryFilePath(userDataPath);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const registry = ensureValidRegistry(parsed);

    if (JSON.stringify(parsed) !== JSON.stringify(registry)) {
      await writeRegistryFile(filePath, registry);
    }

    return {
      ok: true,
      data: {
        filePath,
        registry,
      },
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      const registry = await writeRegistryFile(filePath, createEmptyRegistry());
      return {
        ok: true,
        data: {
          filePath,
          registry,
        },
      };
    }

    const backupPath = `${filePath}.corrupt-${Date.now()}.json`;

    try {
      await ensureParentDirectory(filePath);
      await fs.rename(filePath, backupPath);
    } catch {
      // ignore backup failure, we'll still attempt to recover with a clean file
    }

    const registry = await writeRegistryFile(filePath, createEmptyRegistry());

    return {
      ok: true,
      data: {
        filePath,
        registry,
        recoveredFromCorruption: true,
        backupPath,
      },
    };
  }
}

export async function listRegisteredInstances(userDataPath) {
  const result = await readInstanceRegistry(userDataPath);

  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      filePath: result.data.filePath,
      instances: result.data.registry.instances,
      recoveredFromCorruption: result.data.recoveredFromCorruption ?? false,
      backupPath: result.data.backupPath,
    },
  };
}

export async function getRegisteredInstance(userDataPath, instanceId) {
  const result = await readInstanceRegistry(userDataPath);

  if (!result.ok) return result;

  const instance = result.data.registry.instances.find((item) => item.id === instanceId) ?? null;

  return {
    ok: true,
    data: {
      filePath: result.data.filePath,
      instance,
      recoveredFromCorruption: result.data.recoveredFromCorruption ?? false,
      backupPath: result.data.backupPath,
    },
  };
}

export async function upsertRegisteredInstance(userDataPath, instanceRecord) {
  const result = await readInstanceRegistry(userDataPath);

  if (!result.ok) return result;

  const nextRegistry = ensureValidRegistry(result.data.registry);
  const nextInstances = [...nextRegistry.instances];
  const existingIndex = nextInstances.findIndex((item) => item.id === instanceRecord.id);

  if (existingIndex >= 0) {
    nextInstances[existingIndex] = {
      ...nextInstances[existingIndex],
      ...instanceRecord,
    };
  } else {
    nextInstances.push(instanceRecord);
  }

  const written = await writeRegistryFile(result.data.filePath, {
    ...nextRegistry,
    instances: nextInstances,
  });

  return {
    ok: true,
    data: {
      filePath: result.data.filePath,
      registry: written,
    },
  };
}

export async function removeRegisteredInstance(userDataPath, instanceId) {
  const result = await readInstanceRegistry(userDataPath);

  if (!result.ok) return result;

  const nextRegistry = ensureValidRegistry(result.data.registry);
  const written = await writeRegistryFile(result.data.filePath, {
    ...nextRegistry,
    instances: nextRegistry.instances.filter((item) => item.id !== instanceId),
  });

  return {
    ok: true,
    data: {
      filePath: result.data.filePath,
      registry: written,
    },
  };
}
