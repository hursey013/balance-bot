import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

/**
 * @typedef {{ accounts: Record<string, { lastBalance: number }> }} BalanceState
 */

const defaultState = () => ({ accounts: {} });

/**
 * Creates the persistent state store for account balances.
 * @param {string} filePath
 * @returns {{ save: () => Promise<void>, getLastBalance: (accountId: string) => Promise<number|null>, setLastBalance: (accountId: string, balance: number) => Promise<void> }}
 */
const createStore = (filePath) => {
  const adapter = new JSONFile(filePath);
  const db = new Low(adapter, defaultState());
  let initialized = false;

  const ensureDb = async () => {
    if (!initialized) {
      await db.read();
      db.data ||= defaultState();
      initialized = true;
    }
  };

  const getLastBalance = async (accountId) => {
    await ensureDb();
    const entry = db.data.accounts[accountId];
    return typeof entry?.lastBalance === "number" ? entry.lastBalance : null;
  };

  const setLastBalance = async (accountId, balance) => {
    await ensureDb();
    db.data.accounts[accountId] = { lastBalance: balance };
    await db.write();
  };

  const save = async () => {
    await ensureDb();
    await db.write();
  };

  return { save, getLastBalance, setLastBalance };
};

export default createStore;
