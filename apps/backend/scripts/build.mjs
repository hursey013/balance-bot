import fs from "node:fs/promises";
import path from "node:path";

const requiredDirs = [
  path.resolve("data"),
];

for (const dir of requiredDirs) {
  await fs.mkdir(dir, { recursive: true });
}

console.log("Backend build complete: ensured data directory exists.");
