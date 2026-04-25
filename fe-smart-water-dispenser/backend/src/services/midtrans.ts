import { customAlphabet } from "nanoid";
import type { AppConfig } from "../config.js";

export interface PaymentChargeInput {
  orderId: string;
  amount: number;
  machineCode: string;
}

export interface PaymentChargeResult {
  providerTransactionId: string;
  providerReference: string;
  paymentType: string;
  transactionStatus: string;
  qrString: string;
  qrUrl: string;
  expiresAt: string;
}

export interface PaymentStatusResult {
  transactionStatus: string;
  fraudStatus?: string;
  providerTransactionId?: string;
}

interface MidtransChargeResponse {
  transaction_id?: string;
  order_id?: string;
  payment_type?: string;
  transaction_status?: string;
  qr_string?: string;
  actions?: Array<{ url?: string }>;
}

export interface MidtransProvider {
  createQrisCharge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
  verifyNotification(payload: Record<string, unknown>): Promise<PaymentStatusResult>;
}

const idGenerator = customAlphabet("1234567890abcdef", 16);

class MockMidtransProvider implements MidtransProvider {
  async createQrisCharge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    const providerTransactionId = `mock-${idGenerator()}`;
    return {
      providerTransactionId,
      providerReference: input.orderId,
      paymentType: "qris",
      transactionStatus: "pending",
      qrString: `MOCK-QRIS-${input.orderId}-${input.amount}`,
      qrUrl: `https://mock.midtrans.local/qris/${input.orderId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async verifyNotification(payload: Record<string, unknown>): Promise<PaymentStatusResult> {
    return {
      transactionStatus: String(payload.transaction_status ?? "settlement"),
      fraudStatus: typeof payload.fraud_status === "string" ? payload.fraud_status : undefined,
      providerTransactionId:
        typeof payload.transaction_id === "string" ? payload.transaction_id : undefined,
    };
  }
}

class LiveMidtransProvider implements MidtransProvider {
  constructor(private readonly config: AppConfig) {}

  private get authHeader() {
    return `Basic ${Buffer.from(`${this.config.MIDTRANS_SERVER_KEY ?? ""}:`).toString("base64")}`;
  }

  async createQrisCharge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    const response = await fetch(`${this.config.MIDTRANS_BASE_URL}/v2/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.authHeader,
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amount,
        },
        qris: {
          acquirer: "gopay",
        },
        custom_field1: input.machineCode,
      }),
    });

    if (!response.ok) {
      throw new Error(`Midtrans charge failed with status ${response.status}`);
    }

    const data = (await response.json()) as MidtransChargeResponse;
    return {
      providerTransactionId: String(data.transaction_id ?? ""),
      providerReference: String(data.order_id ?? input.orderId),
      paymentType: String(data.payment_type ?? "qris"),
      transactionStatus: String(data.transaction_status ?? "pending"),
      qrString: String(data.qr_string ?? ""),
      qrUrl: String(data.actions?.[0]?.url ?? ""),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async verifyNotification(payload: Record<string, unknown>): Promise<PaymentStatusResult> {
    const orderId = String(payload.order_id ?? "");
    const response = await fetch(`${this.config.MIDTRANS_BASE_URL}/v2/${orderId}/status`, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Midtrans status verification failed with status ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      transactionStatus: String(data.transaction_status ?? ""),
      fraudStatus: typeof data.fraud_status === "string" ? data.fraud_status : undefined,
      providerTransactionId:
        typeof data.transaction_id === "string" ? data.transaction_id : undefined,
    };
  }
}

export function createMidtransProvider(config: AppConfig): MidtransProvider {
  if (config.MIDTRANS_MODE === "live") {
    return new LiveMidtransProvider(config);
  }

  return new MockMidtransProvider();
}
