// Screen capture mode - records own screen, extracts frame, sends to Claude
// NOTE: This module uses react-native-nitro-screen-recorder which requires
// a native development/production build. WILL NOT WORK IN EXPO GO.
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system/legacy";

import {
  colors,
  radius,
  spacing,
  typography,
  actionLabels,
} from "@/src/theme";
import { PokerCard } from "./PokerCard";
import { RecommendationCard, DecisionResult } from "./RecommendationCard";
import { api, DetectedState } from "@/src/api";
import { useSettings } from "@/src/hooks/use-settings";
import { speak, stopSpeaking, phraseForDecision } from "@/src/audio";

// Lazy-require so Expo Go (no native module) doesn't crash on import.
let nitro: any = null;
let nitroLoadError: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nitro = require("react-native-nitro-screen-recorder");
} catch (e: any) {
  nitroLoadError = e?.message || "Módulo nativo indisponível";
}

interface Props {
  onBack: () => void;
}

type Phase =
  | "idle"        // ready, waiting for user to start
  | "countdown"   // 3-2-1 before starting recording
  | "recording"   // recording in progress
  | "processing"  // extracting frame + analyzing
  | "result"      // showing result
  | "error";

const RECORD_SECONDS = 6;

export const ScreenCaptureMode: React.FC<Props> = ({ onBack }) => {
  const { settings } = useSettings();
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [recElapsed, setRecElapsed] = useState(0);
  const [detected, setDetected] = useState<DetectedState | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoLoop, setAutoLoop] = useState(false);

  const mountedRef = useRef(true);
  const stopFlagRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopFlagRef.current = true;
      try {
        nitro?.stopGlobalRecording?.({ settledTimeMs: 200 }).catch?.(() => {});
      } catch {}
      stopSpeaking();
    };
  }, []);

  // Auto-loop: after result, wait 3s then start again
  useEffect(() => {
    if (!autoLoop) return;
    if (phase !== "result") return;
    const t = setTimeout(() => {
      if (mountedRef.current && !stopFlagRef.current) runCycle();
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoop, phase]);

  const runCycle = useCallback(async () => {
    if (!nitro) {
      setPhase("error");
      setError(
        "Módulo nativo indisponível. Este modo exige build customizado (APK/dev-client). Não funciona no Expo Go."
      );
      return;
    }

    // 3-2-1 countdown so user has time to switch to poker app
    setError(null);
    setResult(null);
    setDetected(null);
    setPhase("countdown");
    for (let i = 3; i >= 1; i--) {
      if (stopFlagRef.current) return;
      setCountdown(i);
      await sleep(1000);
    }
    setCountdown(0);

    // Start recording
    try {
      nitro.startGlobalRecording({
        enableMic: false,
        onRecordingError: (err: any) => {
          setPhase("error");
          setError(err?.message || "Erro ao gravar tela");
        },
      });
      setPhase("recording");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setPhase("error");
      setError(e?.message || "Não foi possível iniciar captura de tela.");
      return;
    }

    // Record for RECORD_SECONDS
    for (let s = 0; s < RECORD_SECONDS; s++) {
      if (stopFlagRef.current) break;
      setRecElapsed(s + 1);
      await sleep(1000);
    }

    // Stop and get file
    let file: any;
    try {
      file = await nitro.stopGlobalRecording({ settledTimeMs: 900 });
    } catch (e: any) {
      setPhase("error");
      setError(e?.message || "Erro ao finalizar gravação.");
      return;
    }
    setRecElapsed(0);
    if (!file?.path) {
      setPhase("error");
      setError("Arquivo de vídeo não retornado. Tente novamente.");
      return;
    }

    setPhase("processing");

    // Extract last frame from video
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(file.path, {
        time: Math.max(0, (file.duration - 0.3) * 1000),
        quality: 0.7,
      });

      // Read frame as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Send to backend for Claude vision analysis
      const det = await api.analyzeImage(base64, "image/jpeg");
      setDetected(det);

      if (det.hero_cards.length !== 2) {
        setPhase("error");
        setError(
          "Não foi possível detectar suas 2 cartas na tela. Ajuste a mesa ou tente novamente."
        );
        return;
      }

      const dec = await api.decide({
        hero_cards: det.hero_cards,
        community: det.community,
        position: det.position || "BTN",
        to_call: det.to_call,
        pot: det.pot || 1.5,
        hero_stack: det.hero_stack || 100,
        n_opponents: det.n_opponents || 1,
        style: settings.style,
      });
      setResult(dec);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (settings.ttsEnabled) {
        const prio = dec.action.toUpperCase().includes("ALL") ? 3 : 2;
        speak(phraseForDecision(dec.action, dec.bet_size, dec.confidence), prio);
      }

      // Save to history
      api
        .createHistory({
          hero_cards: det.hero_cards,
          community: det.community,
          position: det.position || "BTN",
          action: dec.action,
          bet_size: dec.bet_size,
          confidence: dec.confidence,
          reasoning: dec.reasoning,
          pot: det.pot || 0,
          equity: dec.equity,
          source: "image",
        })
        .catch(() => {});

      setPhase("result");
    } catch (e: any) {
      setPhase("error");
      setError(e?.message || "Erro ao analisar a captura.");
    }
  }, [settings.style, settings.ttsEnabled]);

  const stopAll = useCallback(async () => {
    stopFlagRef.current = true;
    setAutoLoop(false);
    try {
      await nitro?.stopGlobalRecording?.({ settledTimeMs: 200 });
    } catch {}
    stopSpeaking();
    setPhase("idle");
    setRecElapsed(0);
    setCountdown(0);
    // Reset flag so user can start again
    setTimeout(() => {
      stopFlagRef.current = false;
    }, 200);
  }, []);

  const speakAgain = () => {
    if (!result) return;
    const text = `${actionLabels[result.action.toUpperCase()] || result.action}${
      result.bet_size > 0 ? `, ${result.bet_size.toFixed(1)} big blinds` : ""
    }. ${result.reasoning}`;
    speak(text, 3);
  };

  // ---------- RENDER ----------
  if (Platform.OS !== "android" || nitroLoadError || !nitro) {
    return (
      <View style={styles.notReadyWrap} testID="screen-mode-unavailable">
        <View style={styles.notReadyCard}>
          <Ionicons name="warning" size={48} color={colors.warning} />
          <Text style={styles.notReadyTitle}>Modo Tela indisponível</Text>
          <Text style={styles.notReadyBody}>
            A captura da própria tela do celular usa a API MediaProjection do
            Android, que exige um build customizado (APK ou dev-client).{"\n\n"}
            Este recurso <Text style={styles.emph}>não funciona no Expo Go</Text>.
            Gere o APK do seu app (via botão Publish do Emergent ou build local
            com EAS) e instale no celular para usar.
          </Text>
          {nitroLoadError && (
            <Text style={styles.notReadyDebug}>{nitroLoadError}</Text>
          )}
          <Pressable
            style={styles.notReadyBtn}
            onPress={onBack}
            testID="btn-screen-back-unavailable"
          >
            <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
            <Text style={styles.notReadyBtnText}>Voltar</Text>
          </Pressable>
          <Pressable
            style={styles.notReadyLink}
            onPress={() => Linking.openURL("https://docs.expo.dev/develop/development-builds/introduction/")}
          >
            <Text style={styles.notReadyLinkText}>
              Sobre builds customizados
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} testID="btn-screen-back">
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>MODO TELA</Text>
          <Text style={styles.title}>Captura da própria tela</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={20} color={colors.info} />
        <Text style={styles.infoText}>
          O app vai gravar a tela do seu celular por{" "}
          <Text style={styles.strong}>{RECORD_SECONDS}s</Text>. Depois de tocar
          em Iniciar, abra o simulador de poker no seu celular. O Android vai
          pedir permissão de captura de tela na primeira vez.
        </Text>
      </View>

      {phase === "idle" && (
        <View style={styles.centerBox}>
          <View style={styles.bigIconWrap}>
            <Ionicons name="phone-portrait" size={64} color={colors.brand} />
          </View>
          <Text style={styles.bigTitle}>Pronto para capturar</Text>
          <Text style={styles.bigSub}>
            Toque em Iniciar. Você terá 3 segundos pra abrir o simulador.
          </Text>

          <Pressable
            style={styles.autoLoopRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAutoLoop((v) => !v);
            }}
            testID="btn-autoloop"
          >
            <Ionicons
              name={autoLoop ? "checkbox" : "square-outline"}
              size={22}
              color={autoLoop ? colors.brand : colors.onSurfaceTertiary}
            />
            <Text style={styles.autoLoopText}>
              Repetir automaticamente após cada análise
            </Text>
          </Pressable>

          <Pressable
            style={styles.startBtn}
            onPress={runCycle}
            testID="btn-screen-start"
          >
            <Ionicons name="play" size={22} color={colors.onBrandPrimary} />
            <Text style={styles.startBtnText}>Iniciar Captura</Text>
          </Pressable>
        </View>
      )}

      {phase === "countdown" && (
        <View style={styles.centerBox}>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <Text style={styles.countdownLabel}>
            Abra o simulador AGORA...
          </Text>
          <Pressable style={styles.cancelBtn} onPress={stopAll}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </Pressable>
        </View>
      )}

      {phase === "recording" && (
        <View style={styles.centerBox}>
          <View style={styles.recPill}>
            <View style={styles.recDot} />
            <Text style={styles.recPillText}>
              GRAVANDO · {recElapsed}s / {RECORD_SECONDS}s
            </Text>
          </View>
          <ActivityIndicator
            size="large"
            color={colors.brand}
            style={{ marginTop: spacing.xl }}
          />
          <Text style={styles.recHint}>
            Fique no simulador de poker. Vou capturar e analisar em segundos.
          </Text>
          <Pressable style={styles.cancelBtn} onPress={stopAll}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </Pressable>
        </View>
      )}

      {phase === "processing" && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.processingText}>
            Analisando com Claude Sonnet 4.5...
          </Text>
        </View>
      )}

      {phase === "result" && result && detected && (
        <View style={styles.resultWrap}>
          <View style={styles.detectionCard}>
            <Text style={styles.sectionLabel}>Detectado na tela</Text>
            <View style={styles.cardsRow}>
              {detected.hero_cards.map((c, i) => (
                <PokerCard key={i} card={c} size="md" />
              ))}
            </View>
            {detected.community.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Mesa</Text>
                <View style={styles.cardsRow}>
                  {detected.community.map((c, i) => (
                    <PokerCard key={i} card={c} size="sm" />
                  ))}
                </View>
              </>
            )}
          </View>

          <RecommendationCard
            result={result}
            onSpeak={speakAgain}
            ttsEnabled={settings.ttsEnabled}
          />

          <View style={styles.actionsRow}>
            <Pressable
              style={styles.againBtn}
              onPress={runCycle}
              testID="btn-screen-again"
            >
              <Ionicons name="refresh" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.againBtnText}>Nova Captura</Text>
            </Pressable>
            <Pressable
              style={styles.stopBtn}
              onPress={stopAll}
              testID="btn-screen-stop"
            >
              <Ionicons name="stop" size={20} color={colors.onSurface} />
              <Text style={styles.stopBtnText}>Parar</Text>
            </Pressable>
          </View>

          {autoLoop && (
            <View style={styles.autoNext}>
              <Ionicons name="time" size={16} color={colors.brand} />
              <Text style={styles.autoNextText}>
                Próxima captura em 3s (auto-repeat ativo)
              </Text>
            </View>
          )}
        </View>
      )}

      {phase === "error" && (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle" size={48} color={colors.error} />
          <Text style={styles.errorTitle}>Não deu certo</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <View style={styles.actionsRow}>
            <Pressable style={styles.againBtn} onPress={runCycle}>
              <Ionicons name="refresh" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.againBtnText}>Tentar de novo</Text>
            </Pressable>
            <Pressable style={styles.stopBtn} onPress={stopAll}>
              <Text style={styles.stopBtnText}>Voltar</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: 140,
    gap: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: typography.sm,
    fontWeight: "800",
    letterSpacing: 3,
  },
  title: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "900",
  },
  infoCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: "rgba(59,130,246,0.1)",
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
    alignItems: "flex-start",
  },
  infoText: {
    color: colors.onSurface,
    fontSize: typography.sm,
    lineHeight: 20,
    flex: 1,
  },
  strong: { color: colors.brand, fontWeight: "800" },
  centerBox: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  bigIconWrap: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(245,158,11,0.3)",
    marginBottom: spacing.md,
  },
  bigTitle: {
    color: colors.onSurface,
    fontSize: typography.xxl,
    fontWeight: "900",
  },
  bigSub: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  autoLoopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
    marginBottom: spacing.md,
  },
  autoLoopText: {
    color: colors.onSurface,
    fontSize: typography.base,
    fontWeight: "600",
    flex: 1,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    width: "100%",
  },
  startBtnText: {
    color: colors.onBrandPrimary,
    fontSize: typography.lg,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cancelBtn: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  cancelBtnText: {
    color: colors.onSurface,
    fontSize: typography.base,
    fontWeight: "700",
  },
  countdownNumber: {
    color: colors.brand,
    fontSize: 120,
    fontWeight: "900",
    lineHeight: 130,
  },
  countdownLabel: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "700",
    textAlign: "center",
  },
  recPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  recPillText: {
    color: "#fff",
    fontSize: typography.base,
    fontWeight: "800",
    letterSpacing: 1,
  },
  recHint: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.base,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  processingText: {
    color: colors.onSurface,
    fontSize: typography.lg,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  resultWrap: { gap: spacing.md },
  detectionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  cardsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  againBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  againBtnText: {
    color: colors.onBrandPrimary,
    fontSize: typography.base,
    fontWeight: "800",
  },
  stopBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stopBtnText: {
    color: colors.onSurface,
    fontSize: typography.base,
    fontWeight: "700",
  },
  autoNext: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: radius.md,
  },
  autoNextText: {
    color: colors.brand,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  errorTitle: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  errorBody: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  // Unavailable state
  notReadyWrap: {
    flex: 1,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  notReadyCard: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.md,
    maxWidth: 480,
  },
  notReadyTitle: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "800",
    textAlign: "center",
  },
  notReadyBody: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: 22,
  },
  emph: { color: colors.warning, fontWeight: "800" },
  notReadyDebug: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: spacing.sm,
  },
  notReadyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  notReadyBtnText: {
    color: colors.onBrandPrimary,
    fontSize: typography.base,
    fontWeight: "800",
  },
  notReadyLink: { marginTop: spacing.sm },
  notReadyLinkText: {
    color: colors.info,
    fontSize: typography.sm,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
