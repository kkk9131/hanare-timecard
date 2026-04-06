import { runBackup } from "../src/server/lib/backup.js";

try {
  runBackup();
} catch (err) {
  console.error(err);
  process.exit(1);
}
