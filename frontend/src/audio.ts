// Centralized audio + TTS manager.
// Configures the native audio session so expo-speech playback continues
// while the app is in background or the screen is locked, and provides a
// queue so overlapping decisions don't cut each other off.
import * as Speech from "expo-speech";
import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";

import { actionLabels } from "@/src/theme";

let sessionConfigured = false;

/** Configure audio session once at app startup. Idempotent. */
export async function initAudioSession() {
  if (sessionConfigured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsRecording: false,
      interruptionMode: "mixWithOthers",
      interruptionModeAndroid: "duckOthers",
    });
    sessionConfigured = true;
  } catch (e) {
    // Non-fatal — TTS will still work in foreground on most devices.
    console.warn("initAudioSession failed:", e);
  }
}

interface QueueItem {
  text: string;
  priority: number; // higher priority interrupts lower
}

let currentPriority = 0;
let lastPhrase: string | null = null;

/**
 * Speak text in pt-BR. Higher-priority calls (e.g., ALL-IN) interrupt lower
 * ones. Same-priority calls queue behind whatever is currently speaking.
 */
export function speak(text: string, priority = 1) {
  if (!text) return;
  lastPhrase = text;

  const speakNow = () => {
    currentPriority = priority;
    Speech.speak(text, {
      language: "pt-BR",
      pitch: 1.0,
      rate: 1.0,
      onDone: () => {
        currentPriority = 0;
      },
      onStopped: () => {
        currentPriority = 0;
      },
      onError: () => {
        currentPriority = 0;
      },
    });
  };

  Speech.isSpeakingAsync()
    .then((speaking) => {
      if (!speaking) {
        speakNow();
        return;
      }
      if (priority > currentPriority) {
        Speech.stop();
        // Slight delay so native TTS releases the audio focus cleanly
        setTimeout(speakNow, 60);
      }
      // else: drop the low-priority phrase, it can be re-triggered later
    })
    .catch(() => speakNow());
}

/** Repeat the most recently spoken phrase, if any. */
export function repeatLast() {
  if (lastPhrase) speak(lastPhrase, 2);
}

/** Immediately stop any in-progress speech. */
export function stopSpeaking() {
  Speech.stop();
  currentPriority = 0;
}

/** Format a decision result into a natural pt-BR phrase. */
export function phraseForDecision(action: string, betSize: number, confidence: number): string {
  const label = actionLabels[action.toUpperCase()] || action;
  const sizePart =
    betSize > 0 ? `, ${betSize.toFixed(1)} big blinds` : "";
  return `${label}${sizePart}. Confiança ${confidence.toFixed(0)} por cento.`;
}
