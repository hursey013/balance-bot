import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const createDefaultState = () => ({ accounts: {} });

const createStateStore = (filePath) => {
  let db;

  const ensureDb = async () => {
    if (!db) {
      await mkdir(path.dirname(filePath), { recursive: true });
      const adapter = new JSONFile(filePath);
      db = new Low(adapter, createDefaultState());
      await db.read();
      if (!db.data || typeof db.data !== "object") {
        db.data = createDefaultState();
      }
      if (!db.data.accounts || typeof db.data.accounts !== "object") {
        db.data.accounts = {};
      }
    }
    return db;
  };

  const save = async () => {
    const database = await ensureDb();
    await database.write();
  };

  const getLastBalance = async (accountId) => {
    const database = await ensureDb();
    return database.data.accounts[accountId]?.lastBalance ?? null;
  };

  const setLastBalance = async (accountId, balance) => {
    const database = await ensureDb();
    database.data.accounts[accountId] = { lastBalance: balance };
    await database.write();
  };

  return { save, getLastBalance, setLastBalance };
};

export default createStateStore;
