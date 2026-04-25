import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AppConfig } from "../config.js";

type SessionKind = "guest" | "admin";

export interface SessionPayload extends JWTPayload {
  sub: string;
  kind: SessionKind;
  sid: string;
  role?: string;
}

export class SessionService {
  private readonly encodedKey: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.encodedKey = new TextEncoder().encode(config.SESSION_SECRET);
  }

  async sign(payload: SessionPayload, expiresIn: string) {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.encodedKey);
  }

  async verify(token?: string) {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.encodedKey, {
        algorithms: ["HS256"],
      });

      return payload as unknown as SessionPayload;
    } catch {
      return null;
    }
  }
}
