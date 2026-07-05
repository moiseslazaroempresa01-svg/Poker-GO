// Central settings store using AsyncStorage
import { useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

export interface Settings {
  ttsEnabled: boolean;
  style: "tight" | "balanced" | "loose";
  disclaimerAccepted: boolean;
}

const DEFAULTS: Settings = {
  ttsEnabled: true,
  style: "balanced",
  disclaimerAccepted: false,
};

const KEY = "@pokerAI/settings";

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

async function load(): Promise<Settings> {
  if (cache) return cache;
  const raw = await storage.getItem(KEY, "");
  if (raw && typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      cache = { ...DEFAULTS, ...parsed };
    } catch {
      cache = { ...DEFAULTS };
    }
  } else {
    cache = { ...DEFAULTS };
  }
  return cache;
}

async function save(next: Settings) {
  cache = next;
  await storage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l(next));
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(cache || DEFAULTS);
  const [loaded, setLoaded] = useState(!!cache);

  useEffect(() => {
    load().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
    const l = (s: Settings) => setSettings(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...(cache || DEFAULTS), ...patch };
      await save(next);
    },
    []
  );

  return { settings, loaded, update };
}
