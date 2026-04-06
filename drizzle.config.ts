import type { Config } from "drizzle-kit";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.HANARE_DB_PATH ?? "data/hanare.db",
  },
} satisfies Config;
