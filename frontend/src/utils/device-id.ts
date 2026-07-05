// Persistent per-device identifier. Used to scope backend history so that
// one user's saved hands don't leak to (or get deleted by) other users.
// Generated on first launch and stored in AsyncStorage.
import { storage } from "@/src/utils/storage";

const KEY = "@pokerAI/deviceId";

let cache: string | null = null;
let inflight: Promise<string> | null = null;

function uuidv4(): string {
  // RFC4122-ish v4 UUID. Crypto-quality randomness not required — this is
  // just a stable identifier, not a secret.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const existing = await storage.getItem(KEY, "");
    if (existing && typeof existing === "string" && existing.length > 0) {
      cache = existing;
      return existing;
    }
    const fresh = uuidv4();
    await storage.setItem(KEY, fresh);
    cache = fresh;
    return fresh;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
