import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { schema } from "./schema.js";
import { INIT_SCHEMA_SQL } from "./init-schema.js";

export interface DatabaseClient {
  mode: "pglite" | "postgres";
  db: ReturnType<typeof drizzlePglite> | ReturnType<typeof drizzlePg>;
  exec: (sql: string) => Promise<void>;
  close: () => Promise<void>;
}

function getPglitePath(databaseUrl: string) {
  const raw = databaseUrl.replace("pglite://", "");
  if (raw === "memory" || raw === "") {
    return null;
  }

  return path.resolve(process.cwd(), raw);
}

export async function createDatabaseClient(config: AppConfig): Promise<DatabaseClient> {
  if (config.DATABASE_URL.startsWith("postgres://") || config.DATABASE_URL.startsWith("postgresql://")) {
    const pool = new Pool({ connectionString: config.DATABASE_URL });
    const db = drizzlePg(pool, { schema });
    await pool.query(INIT_SCHEMA_SQL);

    return {
      mode: "postgres",
      db,
      exec: async (sql: string) => {
        await pool.query(sql);
      },
      close: async () => {
        await pool.end();
      },
    };
  }

  const pglitePath = getPglitePath(config.DATABASE_URL);
  const client = pglitePath ? new PGlite(pglitePath) : new PGlite();
  await client.exec(INIT_SCHEMA_SQL);
  const db = drizzlePglite(client, { schema });

  return {
    mode: "pglite",
    db,
    exec: async (sql: string) => {
      await client.exec(sql);
    },
    close: async () => {
      await client.close();
    },
  };
}
