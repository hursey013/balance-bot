import createJsonFileStore from "./jsonFileStore.js";

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
  const store = createJsonFileStore({
    filePath,
    defaultData: /** @returns {BalanceState} */ () => defaultState(),
    autoFlush: false,
  });

  const getLastBalance = async (accountId) => {
    const state = await store.load();
    const entry = state.accounts[accountId];
    return typeof entry?.lastBalance === "number" ? entry.lastBalance : null;
  };

  const setLastBalance = async (accountId, balance) => {
    await store.update((state) => {
      state.accounts[accountId] = { lastBalance: balance };
    });
    await store.flush();
  };

  const save = async () => {
    await store.flush();
  };

  return { save, getLastBalance, setLastBalance };
};

export default createStore;
