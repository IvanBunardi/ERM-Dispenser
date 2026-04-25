import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { getConfig, type AppConfig } from "./config.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerCustomerRoutes } from "./routes/customer.js";
import { registerGuestRoutes } from "./routes/guest.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerStationRoutes } from "./routes/stations.js";
import { registerUserRoutes } from "./routes/user.js";
import { updateCodesRoute } from "./routes/update-codes.js";
import { createServices } from "./services/index.js";
import type { AppServices } from "./types.js";

export interface BuildAppOptions {
  configOverrides?: Partial<Record<keyof AppConfig, unknown>>;
  servicesOverride?: AppServices;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = getConfig(options.configOverrides);
  const services = options.servicesOverride ?? (await createServices(config));
  const app = Fastify({
    logger: false,
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: [config.FRONTEND_ORIGIN],
    credentials: true,
  });

  app.get("/health", async () => ({
    success: true,
    data: {
      status: "ok",
      mode: config.NODE_ENV,
      databaseMode: services.dbClient.mode,
      midtransMode: config.MIDTRANS_MODE,
      mqttMode: config.MQTT_MODE,
    },
  }));

  await registerGuestRoutes(app, services);
  await registerStationRoutes(app, services);
  await registerCustomerRoutes(app, services);
  await registerUserRoutes(app, services);
  await registerAdminRoutes(app, services);
  await updateCodesRoute(app, services);
  await registerIntegrationRoutes(app, services);

  return { app, services, config };
}
