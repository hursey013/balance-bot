import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

const createDefaultState = () => ({ accounts: {} });

const createStateStore = (filePath) => {
  let db;

  const ensureDb = async () => {
    if (!db) {
      await mkdir(path.dirname(filePath), { recursive: true });
      const adapter = new JSONFile(filePath);
      db = new Low(adapter, createDefaultState());
      await db.read();
      if (!db.data || typeof db.data !== 'object') {
        db.data = createDefaultState();
      }
      if (!db.data.accounts || typeof db.data.accounts !== 'object') {
        db.data.accounts = {};
      }
    }
    return db;
  };

  const load = async () => {
    const database = await ensureDb();
    return database.data;
  };

  const save = async () => {
    const database = await ensureDb();
    await database.write();
  };

  const getAccountState = async (accountId) => {
    const database = await ensureDb();
    const { accounts } = database.data;
    if (!accounts[accountId]) {
      accounts[accountId] = {};
    }
    return accounts[accountId];
  };

  const updateAccountState = async (accountId, updates) => {
    const database = await ensureDb();
    const { accounts } = database.data;
    const current = accounts[accountId] ?? {};
    accounts[accountId] = { ...current, ...updates };
    await database.write();
  };

  return { load, save, getAccountState, updateAccountState };
};

export default createStateStore;
