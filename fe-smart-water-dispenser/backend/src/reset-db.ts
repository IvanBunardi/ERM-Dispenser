import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { 
  machines, sites, machineStatusSnapshots, machineVolumeOptions,
  transactions, dispenseSessions, paymentNotifications, transactionStateLogs,
  adminUsers, adminRoles, adminUserRoles
} from "./db/schema.js";

loadEnv();

async function main() {
  console.log("Connecting to database:", process.env.DATABASE_URL?.split('@')[1]);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const db = drizzle(pool);

  console.log("Wiping database...");

  try {
    // We can just delete tables manually in correct order to respect foreign keys
    await db.delete(transactionStateLogs);
    await db.delete(paymentNotifications);
    await db.delete(dispenseSessions);
    await db.delete(transactions);
    await db.delete(machineStatusSnapshots);
    await db.delete(machineVolumeOptions);
    await db.delete(adminUserRoles);
    await db.delete(adminUsers);
    await db.delete(adminRoles);
    await db.delete(machines);
    await db.delete(sites);

    console.log("Database wiped successfully. Restarting the backend server will trigger the seed process.");
  } catch (error) {
    console.error("Error wiping database:", error);
  } finally {
    await pool.end();
  }
}

main();
