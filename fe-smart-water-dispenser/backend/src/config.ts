import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).default("change-me-with-a-long-random-secret"),
  ADMIN_EMAIL: z.string().email().default("admin@ecoflow.local"),
  ADMIN_PASSWORD: z.string().min(8).default("admin12345"),
  DATABASE_URL: z.string().default("pglite://memory"),
  MIDTRANS_MODE: z.enum(["mock", "live"]).default("mock"),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_BASE_URL: z.string().default("https://api.sandbox.midtrans.com"),
  MQTT_MODE: z.enum(["mock", "live"]).default("mock"),
  MQTT_URL: z.string().optional(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  INTEGRATION_SHARED_SECRET: z.string().min(8).default("change-me"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function getConfig(overrides?: Partial<Record<keyof AppConfig, unknown>>): AppConfig {
  return envSchema.parse({
    ...process.env,
    ...overrides,
  });
}
