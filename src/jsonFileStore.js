import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

/**
 * @template T
 * @typedef {Object} JsonFileStore
 * @property {() => Promise<T>} load Ensures the store is loaded and returns the live reference.
 * @property {(mutator: (state: T) => void) => Promise<T>} update Mutates the store and optionally flushes to disk.
 * @property {() => Promise<void>} flush Forces the current snapshot to be written to disk.
 * @property {() => Promise<T>} snapshot Returns a deep copy of the current state.
 */

/**
 * Creates a small JSON-backed store with optional automatic flushing.
 * @template T
 * @param {object} options
 * @param {string} options.filePath Absolute file path to persist.
 * @param {() => T} options.defaultData Factory that returns the default state.
 * @param {boolean} [options.autoFlush=true] Whether to flush after each update.
 * @returns {JsonFileStore<T>}
 */
const createJsonFileStore = ({ filePath, defaultData, autoFlush = true }) => {
  let cachedState;
  let loadPromise;

  const ensureDirectory = async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
  };

  const writeAtomically = async (payload) => {
    const directory = path.dirname(filePath);
    const temporaryPath = path.join(
      directory,
      `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
    );
    await writeFile(temporaryPath, payload, "utf8");
    await rename(temporaryPath, filePath);
  };

  const normalise = (value) => {
    const base = defaultData();
    if (!value || typeof value !== "object") {
      return base;
    }
    return { ...base, ...value };
  };

  const load = async () => {
    if (cachedState) {
      return cachedState;
    }
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const raw = await readFile(filePath, "utf8");
          const parsed = JSON.parse(raw);
          cachedState = normalise(parsed);
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
          cachedState = defaultData();
        }
        return cachedState;
      })();
    }
    return loadPromise;
  };

  const flush = async () => {
    if (!cachedState) return;
    await ensureDirectory();
    const payload = `${JSON.stringify(cachedState, null, 2)}\n`;
    await writeAtomically(payload);
  };

  const update = async (mutator) => {
    const state = await load();
    mutator(state);
    if (autoFlush) {
      await flush();
    }
    return state;
  };

  const snapshot = async () => {
    const state = await load();
    return structuredClone(state);
  };

  return {
    load,
    update,
    flush,
    snapshot,
  };
};

export default createJsonFileStore;
