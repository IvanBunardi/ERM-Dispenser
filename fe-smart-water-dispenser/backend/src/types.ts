import type { AppConfig } from "./config.js";
import type { DatabaseClient } from "./db/client.js";
import type { MqttProvider } from "./services/mqtt.js";
import type { MidtransProvider } from "./services/midtrans.js";
import type { SessionService } from "./services/session.js";

export interface AppServices {
  config: AppConfig;
  dbClient: DatabaseClient;
  midtrans: MidtransProvider;
  mqtt: MqttProvider;
  session: SessionService;
}
