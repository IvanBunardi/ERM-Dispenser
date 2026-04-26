import mqtt from "mqtt";
import type { AppConfig } from "../config.js";

export interface PublishCommandInput {
  machineCode: string;
  topic: string;
  payload: Record<string, unknown>;
}

export interface IncomingMqttMessage {
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
}

export interface MqttProvider {
  publishCommand(input: PublishCommandInput): Promise<void>;
  setMessageHandler?(handler: (message: IncomingMqttMessage) => Promise<void> | void): void;
  close(): Promise<void>;
}

class MockMqttProvider implements MqttProvider {
  readonly published: PublishCommandInput[] = [];

  async publishCommand(input: PublishCommandInput) {
    this.published.push(input);
  }

  setMessageHandler() {}

  async close() {}
}

class LiveMqttProvider implements MqttProvider {
  private readonly client;
  private messageHandler?: (message: IncomingMqttMessage) => Promise<void> | void;
  private subscriptionsReady = false;

  constructor(config: AppConfig) {
    this.client = mqtt.connect(config.MQTT_URL ?? "", {
      username: config.MQTT_USERNAME,
      password: config.MQTT_PASSWORD,
    });

    this.client.on("connect", () => {
      this.ensureSubscriptions();
    });

    this.client.on("message", (topic, payload, packet) => {
      if (!this.messageHandler) return;

      void Promise.resolve(
        this.messageHandler({
          topic,
          payload: payload.toString("utf8"),
          qos: packet.qos,
          retain: packet.retain,
        }),
      ).catch((error) => {
        console.error("MQTT inbound handler failed:", error);
      });
    });
  }

  async publishCommand(input: PublishCommandInput) {
    const payload = JSON.stringify(input.payload);
    await new Promise<void>((resolve, reject) => {
      this.client.publish(input.topic, payload, { qos: 1 }, (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  setMessageHandler(handler: (message: IncomingMqttMessage) => Promise<void> | void) {
    this.messageHandler = handler;
    this.ensureSubscriptions();
  }

  private ensureSubscriptions() {
    if (this.subscriptionsReady || !this.client.connected || !this.messageHandler) {
      return;
    }

    this.client.subscribe(
      [
        "vending/+/status",
        "vending/+/progress",
        "vending/+/event",
        "vending/+/availability",
      ],
      { qos: 1 },
      (error?: Error | null) => {
        if (error) {
          console.error("MQTT subscribe failed:", error);
          return;
        }

        this.subscriptionsReady = true;
      },
    );
  }

  async close() {
    await new Promise<void>((resolve) => {
      this.client.end(false, {}, () => resolve());
    });
  }
}

export function createMqttProvider(config: AppConfig): MqttProvider {
  if (config.MQTT_MODE === "live" && config.MQTT_URL) {
    return new LiveMqttProvider(config);
  }

  return new MockMqttProvider();
}
