import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, count } from "drizzle-orm";
import type { AppConfig } from "./config.js";
import type { DatabaseClient } from "./db/client.js";
import {
  adminRoles,
  adminUserRoles,
  adminUsers,
  machineStatusSnapshots,
  machineVolumeOptions,
  machines,
  sites,
} from "./db/schema.js";

const curatedMachineImages: Record<string, string> = {
  "VM-001": "https://www.prasetiyamulya.ac.id/wp-content/uploads/2019/09/Auditorium-bsd-Universitas-prasetiya-mulya.png",
  "VM-004": "https://www.prasetiyamulya.ac.id/wp-content/uploads/2019/09/Gedung-eka-tjipta-widjaja-Universitas-Prasetiya-Mulya.jpg",
};

export async function seedDatabase(dbClient: DatabaseClient, config: AppConfig) {
  const db = dbClient.db;
  const existingMachines = await db.select({ value: count() }).from(machines);

  if ((existingMachines[0]?.value ?? 0) > 0) {
    for (const [machineCode, imageUrl] of Object.entries(curatedMachineImages)) {
      await db
        .update(machines)
        .set({ imageUrl })
        .where(eq(machines.machineCode, machineCode));
    }

    return;
  }

  const insertedSites = await db
    .insert(sites)
    .values([
      {
        id: randomUUID(),
        code: "SITE-BSD-001",
        name: "Prasmul BSD - Auditorium",
        address: "BSD Campus Area",
        latitude: "-6.300735",
        longitude: "106.639770",
        timezone: "Asia/Jakarta",
      },
      {
        id: randomUUID(),
        code: "SITE-BSD-002",
        name: "Prasmul BSD - Lobby Eka Tjipta",
        address: "BSD Campus Area",
        latitude: "-6.301500",
        longitude: "106.640500",
        timezone: "Asia/Jakarta",
      },
      {
        id: randomUUID(),
        code: "SITE-BSD-003",
        name: "Prasmul BSD - Gedung PMBS",
        address: "BSD Campus Area",
        latitude: "-6.299500",
        longitude: "106.638500",
        timezone: "Asia/Jakarta",
      },
      {
        id: randomUUID(),
        code: "SITE-BSD-004",
        name: "Prasmul BSD - Kantin",
        address: "BSD Campus Area",
        latitude: "-6.300000",
        longitude: "106.641000",
        timezone: "Asia/Jakarta",
      }
    ])
    .returning();

  const insertedMachines = await db
    .insert(machines)
    .values([
      {
        id: randomUUID(),
        machineCode: "VM-001",
        shortCode: "123456",
        siteId: insertedSites[0].id,
        displayName: "AUDITORIUM PRASMUL",
        imageUrl: curatedMachineImages["VM-001"],
        isVerified: true,
        firmwareVersion: "sim-1.0.0",
        connectivityStatus: "ONLINE",
        operationStatus: "IDLE",
        lastSeenAt: new Date(),
      },
      {
        id: randomUUID(),
        machineCode: "VM-002",
        shortCode: "654321",
        siteId: insertedSites[1].id,
        displayName: "LOBBY EKA TJIPTA WIDJAJA",
        imageUrl: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=120&h=120&fit=crop",
        isVerified: true,
        firmwareVersion: "sim-1.0.0",
        connectivityStatus: "ONLINE",
        operationStatus: "BUSY",
        lastSeenAt: new Date(),
      },
      {
        id: randomUUID(),
        machineCode: "VM-003",
        shortCode: "112233",
        siteId: insertedSites[2].id,
        displayName: "GEDUNG PMBS",
        imageUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=120&h=120&fit=crop",
        isVerified: false,
        firmwareVersion: "sim-1.0.0",
        connectivityStatus: "DEGRADED",
        operationStatus: "IDLE",
        lastSeenAt: new Date(),
      },
      {
        id: randomUUID(),
        machineCode: "VM-004",
        shortCode: "445566",
        siteId: insertedSites[3].id,
        displayName: "KANTIN UTAMA",
        imageUrl: curatedMachineImages["VM-004"],
        isVerified: true,
        firmwareVersion: "sim-1.0.0",
        connectivityStatus: "ONLINE",
        operationStatus: "IDLE",
        lastSeenAt: new Date(),
      },
    ])
    .returning();

  for (const machine of insertedMachines) {
    await db.insert(machineVolumeOptions).values([
      {
        machineId: machine.id,
        id: randomUUID(),
        volumeMl: 500,
        priceAmount: 2000,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: randomUUID(),
        machineId: machine.id,
        volumeMl: 1000,
        priceAmount: 4000,
        isActive: true,
        sortOrder: 2,
      },
    ]);
  }

  await db.insert(machineStatusSnapshots).values([
    {
      id: randomUUID(),
      machineId: insertedMachines[0].id,
      state: "IDLE",
      tankLevelPct: 92,
      bottleDetected: false,
      pumpRunning: false,
      filledMl: 0,
      flowRateLpm: "0.00",
      source: "SEED",
    },
    {
      id: randomUUID(),
      machineId: insertedMachines[1].id,
      state: "WAITING_PAYMENT",
      tankLevelPct: 55,
      bottleDetected: false,
      pumpRunning: false,
      filledMl: 0,
      flowRateLpm: "0.00",
      source: "SEED",
    },
    {
      id: randomUUID(),
      machineId: insertedMachines[2].id,
      state: "IDLE",
      tankLevelPct: 48,
      bottleDetected: false,
      pumpRunning: false,
      filledMl: 0,
      flowRateLpm: "0.00",
      source: "SEED",
    },
    {
      id: randomUUID(),
      machineId: insertedMachines[3].id,
      state: "IDLE",
      tankLevelPct: 75,
      bottleDetected: false,
      pumpRunning: false,
      filledMl: 0,
      flowRateLpm: "0.00",
      source: "SEED",
    },
  ]);

  const [ownerRole, opsRole] = await db
    .insert(adminRoles)
    .values([
      { id: randomUUID(), roleKey: "owner", roleName: "Owner" },
      { id: randomUUID(), roleKey: "ops_admin", roleName: "Operations Admin" },
    ])
    .returning();

  const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 10);
  const [admin] = await db
    .insert(adminUsers)
    .values({
      id: randomUUID(),
      email: config.ADMIN_EMAIL,
      fullName: "Eco Flow Admin",
      passwordHash,
      isActive: true,
    })
    .returning();

  await db.insert(adminUserRoles).values([
    { id: randomUUID(), adminUserId: admin.id, adminRoleId: ownerRole.id },
    { id: randomUUID(), adminUserId: admin.id, adminRoleId: opsRole.id },
  ]);
}
