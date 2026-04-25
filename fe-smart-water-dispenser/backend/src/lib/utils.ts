import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";

const displayIdAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const displayIdGenerator = customAlphabet(displayIdAlphabet, 6);

export function generateDisplayId() {
  return displayIdGenerator();
}

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getInitials(name: string) {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export function getEcoLevel(bottlesSaved: number) {
  if (bottlesSaved >= 600) return "Emerald";
  if (bottlesSaved >= 300) return "Tree";
  if (bottlesSaved >= 150) return "Sapling";
  if (bottlesSaved >= 50) return "Sprout";
  return "Seedling";
}

export function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function jsonStringify(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function calculateDistanceMeters(
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null,
) {
  if (
    lat1 == null ||
    lng1 == null ||
    lat2 == null ||
    lng2 == null
  ) {
    return null;
  }

  const earthRadius = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

export function formatDistanceLabel(distanceMeters: number | null) {
  if (distanceMeters == null) return "Unknown distance";
  if (distanceMeters < 1000) return `${distanceMeters}m away`;
  return `${(distanceMeters / 1000).toFixed(1)}km away`;
}
