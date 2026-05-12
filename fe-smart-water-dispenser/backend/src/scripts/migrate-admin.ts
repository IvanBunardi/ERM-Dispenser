import { eq } from "drizzle-orm";
import { getConfig } from "../config.js";
import { createDatabaseClient } from "../db/client.js";
import { adminUsers } from "../db/schema.js";

async function main() {
  const config = getConfig();
  const dbClient = await createDatabaseClient(config);
  const db = dbClient.db;

  console.log("Migrating admin user...");

  const existingAdmin = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, "admin@ecoflow.com"))
    .limit(1);

  if (existingAdmin.length > 0) {
    const admin = existingAdmin[0];
    await db
      .update(adminUsers)
      .set({
        email: "admin@prasmul.ac.id",
        fullName: "Universitas Prasetiya Mulya",
        institutionName: "Prasetiya Mulya",
      })
      .where(eq(adminUsers.id, admin.id));

    console.log(`Successfully migrated admin ID ${admin.id} to admin@prasmul.ac.id`);
  } else {
    console.log("Admin admin@ecoflow.com not found, checking if admin@prasmul.ac.id already exists...");
    const prasmulAdmin = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, "admin@prasmul.ac.id"))
      .limit(1);
    
    if (prasmulAdmin.length > 0) {
      console.log("admin@prasmul.ac.id already exists.");
    } else {
      console.log("No admin users to migrate.");
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
