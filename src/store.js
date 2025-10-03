import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const defaultState = () => ({ accounts: {} });

const readStateFile = async (filePath) => {
  try {
    const contents = await readFile(filePath, "utf8");
    const parsed = JSON.parse(contents);
    if (parsed && typeof parsed === "object") {
      if (!parsed.accounts || typeof parsed.accounts !== "object") {
        parsed.accounts = {};
      }
      return parsed;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  return defaultState();
};

const writeStateFile = async (filePath, state) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify(state, null, 2);
  await writeFile(filePath, `${payload}\n`, "utf8");
};

const createStore = (filePath) => {
  let statePromise;
  let state;

  const loadState = async () => {
    if (!statePromise) {
      statePromise = readStateFile(filePath).then((data) => {
        state = data;
        return state;
      });
    }
    if (state) return state;
    return statePromise;
  };

  const save = async () => {
    const current = await loadState();
    await writeStateFile(filePath, current);
  };

  const getLastBalance = async (accountId) => {
    const current = await loadState();
    return current.accounts[accountId]?.lastBalance ?? null;
  };

  const setLastBalance = async (accountId, balance) => {
    const current = await loadState();
    current.accounts[accountId] = { lastBalance: balance };
    await writeStateFile(filePath, current);
  };

  return { save, getLastBalance, setLastBalance };
};

export default createStore;
