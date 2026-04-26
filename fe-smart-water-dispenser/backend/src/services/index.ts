import type { AppConfig } from "../config.js";
import { createDatabaseClient } from "../db/client.js";
import { seedDatabase } from "../seed.js";
import type { AppServices } from "../types.js";
import { createMidtransProvider } from "./midtrans.js";
import { registerMqttDeviceSync } from "./mqtt-device-sync.js";
import { createMqttProvider } from "./mqtt.js";
import { SessionService } from "./session.js";

export async function createServices(config: AppConfig): Promise<AppServices> {
  const dbClient = await createDatabaseClient(config);
  await seedDatabase(dbClient, config);

  const services: AppServices = {
    config,
    dbClient,
    midtrans: createMidtransProvider(config),
    mqtt: createMqttProvider(config),
    session: new SessionService(config),
  };

  registerMqttDeviceSync(services);
  return services;
}

export async function closeServices(services: AppServices) {
  await services.mqtt.close();
  await services.dbClient.close();
}
