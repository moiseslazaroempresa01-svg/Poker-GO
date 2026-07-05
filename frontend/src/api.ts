// Central backend API helper
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export interface DecideRequest {
  hero_cards: string[];
  community?: string[];
  position?: string;
  to_call?: number;
  pot?: number;
  hero_stack?: number;
  n_opponents?: number;
  style?: "tight" | "balanced" | "loose";
}

export interface DecisionResult {
  action: string;
  bet_size: number;
  confidence: number;
  reasoning: string;
  equity?: { win: number; tie: number; lose: number } | null;
  pot_odds: number;
  chen_score?: number | null;
}

export interface DetectedState {
  hero_cards: string[];
  community: string[];
  position: string;
  to_call: number;
  pot: number;
  hero_stack: number;
  n_opponents: number;
  notes: string;
  detection_confidence: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  hero_cards: string[];
  community: string[];
  position: string;
  action: string;
  bet_size: number;
  confidence: number;
  reasoning: string;
  pot: number;
  equity?: { win: number; tie: number; lose: number } | null;
  source: "manual" | "image";
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = `${BASE}/api${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt}`);
  }
  return res.json();
}

export const api = {
  decide: (payload: DecideRequest) =>
    req<DecisionResult>("/decide", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  analyzeImage: (image_base64: string, mime_type = "image/jpeg") =>
    req<DetectedState>("/analyze-image", {
      method: "POST",
      body: JSON.stringify({ image_base64, mime_type }),
    }),

  createHistory: (entry: Omit<HistoryEntry, "id" | "timestamp">) =>
    req<HistoryEntry>("/history", {
      method: "POST",
      body: JSON.stringify(entry),
    }),

  listHistory: () => req<HistoryEntry[]>("/history"),

  deleteHistory: (id: string) =>
    req<{ deleted: number }>(`/history/${id}`, { method: "DELETE" }),

  clearHistory: () =>
    req<{ deleted: number }>("/history", { method: "DELETE" }),
};
