import { getConfig } from "./config.js";
import { createDatabaseClient } from "./db/client.js";
import { machines } from "./db/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  const config = getConfig();
  const dbClient = await createDatabaseClient(config);
  const db = dbClient.db as any;

  console.log("Updating dummy machine short codes...");

  await db.update(machines).set({ shortCode: "123456" }).where(eq(machines.machineCode, "VM-001"));
  await db.update(machines).set({ shortCode: "654321" }).where(eq(machines.machineCode, "VM-002"));
  await db.update(machines).set({ shortCode: "112233" }).where(eq(machines.machineCode, "VM-003"));

  console.log("Done updating machine short codes.");
  
  await dbClient.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error updating machine codes:", err);
  process.exit(1);
});
