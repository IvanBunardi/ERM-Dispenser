import mqtt from "mqtt";
import type { AppConfig } from "../config.js";

export interface PublishCommandInput {
  machineCode: string;
  topic: string;
  payload: Record<string, unknown>;
}

export interface MqttProvider {
  publishCommand(input: PublishCommandInput): Promise<void>;
  close(): Promise<void>;
}

class MockMqttProvider implements MqttProvider {
  readonly published: PublishCommandInput[] = [];

  async publishCommand(input: PublishCommandInput) {
    this.published.push(input);
  }

  async close() {}
}

class LiveMqttProvider implements MqttProvider {
  private readonly client;

  constructor(config: AppConfig) {
    this.client = mqtt.connect(config.MQTT_URL ?? "", {
      username: config.MQTT_USERNAME,
      password: config.MQTT_PASSWORD,
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
