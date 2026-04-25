# Drizzle ORM Schema - Smart Water Dispenser

## Tujuan

Dokumen ini memberikan rancangan schema `Drizzle ORM` untuk backend TypeScript yang akan memakai PostgreSQL.

Format schema ini disusun agar:

- langsung bisa dipecah ke `src/db/schema/*.ts`
- sinkron dengan ERD
- cukup untuk menghidupi frontend customer existing, admin existing, dan flow tablet vending

## Struktur File yang Disarankan

```text
src/db/schema/
  enums.ts
  guest.ts
  machines.ts
  transactions.ts
  payments.ts
  analytics.ts
  admin.ts
  index.ts
```

## 1. Enums

```ts
import { pgEnum } from "drizzle-orm/pg-core";

export const machineConnectivityEnum = pgEnum("machine_connectivity", [
  "ONLINE",
  "OFFLINE",
  "DEGRADED",
]);

export const machineOperationEnum = pgEnum("machine_operation", [
  "IDLE",
  "BUSY",
  "ERROR",
  "MAINTENANCE",
  "DISABLED",
]);

export const transactionPaymentStatusEnum = pgEnum("transaction_payment_status", [
  "UNPAID",
  "PENDING",
  "PAID",
  "EXPIRED",
  "FAILED",
  "REFUND_REVIEW",
  "REFUNDED",
]);

export const transactionDispenseStatusEnum = pgEnum("transaction_dispense_status", [
  "CREATED",
  "WAITING_PAYMENT",
  "WAITING_BOTTLE",
  "READY_TO_FILL",
  "FILLING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
]);

export const paymentProviderEnum = pgEnum("payment_provider", [
  "MIDTRANS",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
]);
```

## 2. Guest & Preferences Schema

```ts
import {
  pgTable, uuid, text, timestamp, boolean, inet, uniqueIndex,
} from "drizzle-orm/pg-core";

export const guestUsers = pgTable("guest_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayId: text("display_id").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  displayIdIdx: uniqueIndex("guest_users_display_id_idx").on(t.displayId),
}));

export const guestSessions = pgTable("guest_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  guestUserId: uuid("guest_user_id").notNull().references(() => guestUsers.id, { onDelete: "cascade" }),
  sessionTokenHash: text("session_token_hash").notNull(),
  csrfTokenHash: text("csrf_token_hash"),
  userAgent: text("user_agent"),
  lastIp: inet("last_ip"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const guestPreferences = pgTable("guest_preferences", {
  guestUserId: uuid("guest_user_id").primaryKey().references(() => guestUsers.id, { onDelete: "cascade" }),
  notificationsEnabled: boolean("notifications_enabled").default(true).notNull(),
  publicLeaderboard: boolean("public_leaderboard").default(true).notNull(),
  languageCode: text("language_code").default("en").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

## 3. Machine Schema

```ts
import {
  pgTable, uuid, text, timestamp, boolean, integer, numeric, index,
} from "drizzle-orm/pg-core";
import { machineConnectivityEnum, machineOperationEnum } from "./enums";

export const sites = pgTable("sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  timezone: text("timezone").default("Asia/Jakarta").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const machines = pgTable("machines", {
  id: uuid("id").defaultRandom().primaryKey(),
  machineCode: text("machine_code").notNull(),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  shortCode: text("short_code").notNull(),
  displayName: text("display_name").notNull(),
  imageUrl: text("image_url"),
  isVerified: boolean("is_verified").default(false).notNull(),
  firmwareVersion: text("firmware_version"),
  connectivityStatus: machineConnectivityEnum("connectivity_status").default("OFFLINE").notNull(),
  operationStatus: machineOperationEnum("operation_status").default("IDLE").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  machineCodeIdx: index("machines_machine_code_idx").on(t.machineCode),
  shortCodeIdx: index("machines_short_code_idx").on(t.shortCode),
}));

export const machineVolumeOptions = pgTable("machine_volume_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
  volumeMl: integer("volume_ml").notNull(),
  priceAmount: integer("price_amount").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const machineStatusSnapshots = pgTable("machine_status_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
  state: text("state").notNull(),
  tankLevelPct: integer("tank_level_pct"),
  bottleDetected: boolean("bottle_detected").default(false),
  pumpRunning: boolean("pump_running").default(false),
  filledMl: integer("filled_ml").default(0),
  flowRateLpm: numeric("flow_rate_lpm", { precision: 6, scale: 2 }),
  source: text("source"),
  reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  machineReportedIdx: index("machine_status_snapshots_machine_reported_idx").on(t.machineId, t.reportedAt),
}));

export const machineEvents = pgTable("machine_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id"),
  topic: text("topic").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deviceCommands = pgTable("device_commands", {
  id: uuid("id").defaultRandom().primaryKey(),
  machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id"),
  issuedByAdminId: uuid("issued_by_admin_id"),
  commandType: text("command_type").notNull(),
  payload: text("payload"),
  deliveryStatus: text("delivery_status").default("QUEUED").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});
```

## 4. Transaction & Payment Schema

```ts
import {
  pgTable, uuid, text, timestamp, integer, numeric, index,
} from "drizzle-orm/pg-core";
import {
  transactionPaymentStatusEnum,
  transactionDispenseStatusEnum,
  paymentProviderEnum,
} from "./enums";
import { guestUsers } from "./guest";
import { machines } from "./machines";

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: text("order_id").notNull(),
  guestUserId: uuid("guest_user_id").references(() => guestUsers.id, { onDelete: "set null" }),
  machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "restrict" }),
  volumeMl: integer("volume_ml").notNull(),
  grossAmount: integer("gross_amount").notNull(),
  paymentStatus: transactionPaymentStatusEnum("payment_status").default("UNPAID").notNull(),
  dispenseStatus: transactionDispenseStatusEnum("dispense_status").default("CREATED").notNull(),
  sourceChannel: text("source_channel").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  orderIdIdx: index("transactions_order_id_idx").on(t.orderId),
  machineCreatedIdx: index("transactions_machine_created_idx").on(t.machineId, t.createdAt),
  guestCreatedIdx: index("transactions_guest_created_idx").on(t.guestUserId, t.createdAt),
}));

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  provider: paymentProviderEnum("provider").default("MIDTRANS").notNull(),
  providerTransactionId: text("provider_transaction_id"),
  providerReference: text("provider_reference"),
  paymentType: text("payment_type").notNull(),
  transactionStatus: text("transaction_status").notNull(),
  fraudStatus: text("fraud_status"),
  grossAmount: integer("gross_amount").notNull(),
  qrString: text("qr_string"),
  qrUrl: text("qr_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentNotifications = pgTable("payment_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  provider: paymentProviderEnum("provider").default("MIDTRANS").notNull(),
  providerNotificationId: text("provider_notification_id"),
  payload: text("payload").notNull(),
  processingStatus: text("processing_status").default("RECEIVED").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transactionStateLogs = pgTable("transaction_state_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  sourceType: text("source_type").notNull(),
  sourceRef: text("source_ref"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dispenseSessions = pgTable("dispense_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "restrict" }),
  targetVolumeMl: integer("target_volume_ml").notNull(),
  actualFilledMl: integer("actual_filled_ml").default(0).notNull(),
  averageFlowRateLpm: numeric("average_flow_rate_lpm", { precision: 6, scale: 2 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  resultStatus: text("result_status").default("PENDING").notNull(),
});
```

## 5. Analytics & Admin Schema

```ts
import {
  pgTable, uuid, text, timestamp, integer, boolean, date,
} from "drizzle-orm/pg-core";
import { alertSeverityEnum, alertStatusEnum } from "./enums";
import { guestUsers } from "./guest";
import { machines } from "./machines";

export const customerImpactSnapshots = pgTable("customer_impact_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  guestUserId: uuid("guest_user_id").notNull().references(() => guestUsers.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  bottlesSaved: integer("bottles_saved").default(0).notNull(),
  co2ReducedKg: integer("co2_reduced_grams").default(0).notNull(),
  totalSpent: integer("total_spent").default(0).notNull(),
  totalVolumeMl: integer("total_volume_ml").default(0).notNull(),
});

export const leaderboardSnapshots = pgTable("leaderboard_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotDate: date("snapshot_date").notNull(),
  guestUserId: uuid("guest_user_id").notNull().references(() => guestUsers.id, { onDelete: "cascade" }),
  points: integer("points").default(0).notNull(),
  rank: integer("rank").notNull(),
  scope: text("scope").default("GLOBAL").notNull(),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminRoles = pgTable("admin_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleKey: text("role_key").notNull(),
  roleName: text("role_name").notNull(),
});

export const adminUserRoles = pgTable("admin_user_roles", {
  adminUserId: uuid("admin_user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  adminRoleId: uuid("admin_role_id").notNull().references(() => adminRoles.id, { onDelete: "cascade" }),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(),
  severity: alertSeverityEnum("severity").notNull(),
  status: alertStatusEnum("status").default("OPEN").notNull(),
  context: text("context"),
  resolvedByAdminId: uuid("resolved_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeData: text("before_data"),
  afterData: text("after_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

## 6. Relasi Drizzle yang Disarankan

Minimal relation files:

- `guestUsers` -> `guestSessions`, `guestPreferences`, `transactions`
- `machines` -> `machineVolumeOptions`, `machineStatusSnapshots`, `machineEvents`, `transactions`
- `transactions` -> `payments`, `transactionStateLogs`, `dispenseSessions`
- `adminUsers` -> `auditLogs`, `deviceCommands`, `alerts`

## 7. Catatan Implementasi

- Untuk `payload`, `metadata`, `context`, `beforeData`, dan `afterData`, implementasi real lebih baik memakai `jsonb`; contoh di atas memakai `text` agar snippet tetap ringkas.
- `co2ReducedKg` sebaiknya disimpan sebagai gram integer di schema real agar aman dari floating drift.
- `machine_status_snapshots` bisa disimpan append-only atau last-state-only. Untuk admin log yang lebih aman, pilih append-only plus materialized latest view.
- Tambahkan partial unique index pada transaksi aktif per mesin bila ingin mencegah 2 transaksi aktif bersamaan.

## 8. Query Prioritas yang Harus Dioptimalkan

- daftar station untuk `/explore`
- history transaksi customer
- dashboard summary admin
- transaksi aktif per machine
- latest status per machine
- live logs per machine

