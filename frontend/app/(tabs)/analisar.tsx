// Analisar (Analyze) tab - LIVE camera mode + gallery/photo fallback
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";

import { colors, radius, spacing, typography, actionLabels, actionColor } from "@/src/theme";
import { PokerCard } from "@/src/components/PokerCard";
import {
  RecommendationCard,
  DecisionResult,
} from "@/src/components/RecommendationCard";
import { ScreenCaptureMode } from "@/src/components/ScreenCaptureMode";
import { api, DetectedState } from "@/src/api";
import { useSettings } from "@/src/hooks/use-settings";
import { speak, stopSpeaking, phraseForDecision } from "@/src/audio";

type Mode = "idle" | "live" | "single" | "screen";

const INTERVAL_OPTIONS = [
  { value: 3, label: "3s" },
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
];

export default function AnalisarScreen() {
  const { settings } = useSettings();
  const [mode, setMode] = useState<Mode>("idle");
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [singleImageUri, setSingleImageUri] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedState | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval_s, setIntervalS] = useState(5);
  const [liveRunning, setLiveRunning] = useState(false);
  const [ticker, setTicker] = useState(0); // triggers next capture
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(interval_s);
  const [lastSpokenAction, setLastSpokenAction] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopSpeaking();
    };
  }, []);

  // Live loop: capture -> analyze -> wait interval -> repeat
  useEffect(() => {
    if (!liveRunning) return;
    let cancelled = false;

    const runCycle = async () => {
      if (cancelled || !cameraRef.current) return;
      setAnalyzing(true);
      setError(null);
      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.5,
          skipProcessing: true,
        });
        if (!photo || cancelled) return;

        const det = await api.analyzeImage(photo.base64 || "", "image/jpeg");
        if (cancelled) return;
        setDetected(det);
        setLastAnalyzedAt(Date.now());

        if (det.hero_cards.length === 2) {
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
          if (cancelled) return;
          setResult(dec);
          // Only speak / haptic if the action or cards changed
          const signature = `${det.hero_cards.join("")}_${det.community.join("")}_${dec.action}`;
          if (signature !== lastSpokenAction) {
            setLastSpokenAction(signature);
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
            if (settings.ttsEnabled) {
              // ALL-IN gets higher priority so it interrupts stale phrases
              const prio = dec.action.toUpperCase().includes("ALL") ? 3 : 2;
              speak(phraseForDecision(dec.action, dec.bet_size, dec.confidence), prio);
            }
            // save to history (async, no wait)
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
          }
        } else {
          setResult(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Falha na análise.");
      } finally {
        if (!cancelled && isMountedRef.current) setAnalyzing(false);
      }
    };

    runCycle();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, liveRunning]);

  // Countdown / next-tick scheduler
  useEffect(() => {
    if (!liveRunning) return;
    if (analyzing) return;
    setCountdown(interval_s);
    const start = Date.now();
    const tid = setInterval(() => {
      const remaining = Math.max(
        0,
        interval_s - Math.floor((Date.now() - start) / 1000)
      );
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(tid);
        if (isMountedRef.current && liveRunning) {
          setTicker((t) => t + 1);
        }
      }
    }, 500);
    return () => clearInterval(tid);
  }, [analyzing, liveRunning, interval_s]);

  const startLive = async () => {
    let perm = permission;
    if (!perm?.granted) {
      const r = await requestPermission();
      perm = r;
    }
    if (!perm?.granted) {
      if (perm?.canAskAgain === false) {
        Alert.alert(
          "Permissão necessária",
          "Ative o acesso à câmera nas configurações do sistema."
        );
      }
      return;
    }
    setMode("live");
    setError(null);
    setDetected(null);
    setResult(null);
    setLastSpokenAction(null);
    setLiveRunning(true);
    setTicker((t) => t + 1); // kick off first cycle immediately
  };

  const stopLive = () => {
    setLiveRunning(false);
    stopSpeaking();
  };

  const goBackToIdle = () => {
    setLiveRunning(false);
    setMode("idle");
    setSingleImageUri(null);
    setDetected(null);
    setResult(null);
    setError(null);
    stopSpeaking();
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
    });
    if (!res.canceled && res.assets[0]) {
      setMode("single");
      analyzeSingle(res.assets[0]);
    }
  };

  const analyzeSingle = async (asset: ImagePicker.ImagePickerAsset) => {
    setSingleImageUri(asset.uri);
    setDetected(null);
    setResult(null);
    setError(null);
    setAnalyzing(true);
    try {
      const mime = asset.mimeType || "image/jpeg";
      const det = await api.analyzeImage(asset.base64 || "", mime);
      setDetected(det);
      if (det.hero_cards.length === 2) {
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
          speak(phraseForDecision(dec.action, dec.bet_size, dec.confidence), 2);
        }
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
      } else {
        setError("Não foi possível detectar suas cartas. Tente o Modo Manual.");
      }
    } catch (e: any) {
      setError(e.message || "Falha na análise.");
    } finally {
      setAnalyzing(false);
    }
  };

  const speakResult = () => {
    if (!result) return;
    const text = `${actionLabels[result.action.toUpperCase()] || result.action}${
      result.bet_size > 0 ? `, ${result.bet_size.toFixed(1)} big blinds` : ""
    }. ${result.reasoning}`;
    speak(text, 3);
  };

  // ---------- RENDER ----------
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ANÁLISE</Text>
          <Text style={styles.title}>Poker Trainer AI</Text>
        </View>
        {settings.ttsEnabled && (
          <View style={styles.ttsIndicator} testID="tts-indicator">
            <Ionicons name="volume-high" size={14} color={colors.brand} />
            <Text style={styles.ttsIndicatorText}>TTS</Text>
          </View>
        )}
      </View>

      {mode === "idle" && (
        <IdleView
          onStartLive={startLive}
          onPickGallery={pickFromGallery}
          onStartScreen={() => setMode("screen")}
        />
      )}

      {mode === "screen" && (
        <ScreenCaptureMode onBack={goBackToIdle} />
      )}

      {mode === "live" && (
        <LiveView
          cameraRef={cameraRef}
          running={liveRunning}
          analyzing={analyzing}
          countdown={countdown}
          intervalS={interval_s}
          onChangeInterval={setIntervalS}
          onStart={() => {
            setLiveRunning(true);
            setTicker((t) => t + 1);
          }}
          onStop={stopLive}
          onBack={goBackToIdle}
          detected={detected}
          result={result}
          error={error}
          onSpeak={speakResult}
          ttsEnabled={settings.ttsEnabled}
          lastAnalyzedAt={lastAnalyzedAt}
        />
      )}

      {mode === "single" && (
        <SingleView
          imageUri={singleImageUri}
          analyzing={analyzing}
          detected={detected}
          result={result}
          error={error}
          onSpeak={speakResult}
          ttsEnabled={settings.ttsEnabled}
          onBack={goBackToIdle}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------- IDLE ----------------
const IdleView = ({
  onStartLive,
  onPickGallery,
  onStartScreen,
}: {
  onStartLive: () => void;
  onPickGallery: () => void;
  onStartScreen: () => void;
}) => (
  <ScrollView
    contentContainerStyle={styles.idleContent}
    showsVerticalScrollIndicator={false}
  >
    <View style={styles.emptyIcon}>
      <Ionicons name="videocam" size={56} color={colors.brand} />
    </View>
    <Text style={styles.emptyTitle}>Modo Ao Vivo</Text>
    <Text style={styles.emptySub}>
      Aponte a câmera do celular para a tela do simulador (ou monitor do PC).
      A IA irá capturar e analisar automaticamente a cada intervalo, falando a
      recomendação sempre que a jogada mudar.
    </Text>

    <Pressable
      style={styles.liveCta}
      onPress={onStartLive}
      testID="btn-start-live"
    >
      <Ionicons name="radio-button-on" size={20} color={colors.onBrandPrimary} />
      <Text style={styles.liveCtaText}>Iniciar Modo Ao Vivo</Text>
    </Pressable>

    <Pressable
      style={styles.screenCta}
      onPress={onStartScreen}
      testID="btn-start-screen"
    >
      <Ionicons name="phone-portrait" size={20} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.screenCtaText}>Modo Tela (mesmo celular)</Text>
        <Text style={styles.screenCtaSub}>
          Grava a própria tela do celular · exige APK
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </Pressable>

    <View style={styles.separator}>
      <View style={styles.line} />
      <Text style={styles.separatorText}>ou</Text>
      <View style={styles.line} />
    </View>

    <Pressable
      style={styles.altBtn}
      onPress={onPickGallery}
      testID="btn-pick-gallery"
    >
      <Ionicons name="images" size={22} color={colors.brand} />
      <Text style={styles.altBtnText}>Analisar screenshot da galeria</Text>
    </Pressable>

    <View style={styles.tipsCard}>
      <Text style={styles.tipsTitle}>💡 Como usar</Text>
      <Text style={styles.tipsText}>
        1. Deixe o simulador aberto no PC ou em outro dispositivo{"\n"}
        2. Aponte a câmera do celular para a tela{"\n"}
        3. Toque em <Text style={styles.strong}>Iniciar Modo Ao Vivo</Text>{"\n"}
        4. O app dirá a jogada em voz alta quando a mão mudar
      </Text>
    </View>

    <View style={styles.warningCard}>
      <Ionicons name="alert-circle" size={18} color={colors.warning} />
      <Text style={styles.warningText}>
        Uso exclusivo para simuladores offline.
      </Text>
    </View>
  </ScrollView>
);

// ---------------- LIVE ----------------
const LiveView = ({
  cameraRef,
  running,
  analyzing,
  countdown,
  intervalS,
  onChangeInterval,
  onStart,
  onStop,
  onBack,
  detected,
  result,
  error,
  onSpeak,
  ttsEnabled,
  lastAnalyzedAt,
}: any) => (
  <View style={styles.liveContainer}>
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />
      {/* Overlay HUD */}
      <View style={styles.hud} pointerEvents="box-none">
        <View style={styles.hudTopBar}>
          <Pressable
            onPress={onBack}
            style={styles.hudBtn}
            testID="btn-live-back"
          >
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>

          <View
            style={[
              styles.statusPill,
              { backgroundColor: running ? colors.error : colors.surfaceTertiary },
            ]}
          >
            {running && <View style={styles.recDot} />}
            <Text style={styles.statusText}>
              {analyzing
                ? "Analisando..."
                : running
                ? `Próxima em ${countdown}s`
                : "Pausado"}
            </Text>
          </View>
        </View>

        {/* Detection mini panel top overlay */}
        {detected && detected.hero_cards.length === 2 && (
          <View style={styles.miniDetection}>
            <View style={styles.miniCards}>
              {detected.hero_cards.map((c: string, i: number) => (
                <PokerCard key={i} card={c} size="sm" />
              ))}
              {detected.community.length > 0 && (
                <>
                  <View style={styles.miniDivider} />
                  {detected.community.map((c: string, i: number) => (
                    <PokerCard key={`c${i}`} card={c} size="sm" />
                  ))}
                </>
              )}
            </View>
            <Text style={styles.miniInfo}>
              {detected.position} · Pote {detected.pot.toFixed(1)}
            </Text>
          </View>
        )}
      </View>
    </View>

    {/* Bottom sheet with recommendation + controls */}
    <View style={styles.liveBottom}>
      {result ? (
        <View style={styles.liveActionRow}>
          <View
            style={[
              styles.liveActionBox,
              { borderColor: actionColor(result.action) },
            ]}
          >
            <Text
              style={[
                styles.liveActionText,
                { color: actionColor(result.action) },
              ]}
              testID="live-action-text"
            >
              {actionLabels[result.action.toUpperCase()] || result.action}
            </Text>
            {result.bet_size > 0 && (
              <Text style={styles.liveBet}>
                {result.bet_size.toFixed(1)} BB
              </Text>
            )}
          </View>
          <View style={styles.liveMeta}>
            <Text style={styles.liveMetaBig}>
              {result.confidence.toFixed(0)}%
            </Text>
            <Text style={styles.liveMetaLabel}>Confiança</Text>
            {result.equity && (
              <>
                <Text
                  style={[
                    styles.liveMetaBig,
                    { color: colors.success, marginTop: 4 },
                  ]}
                >
                  {result.equity.win.toFixed(0)}%
                </Text>
                <Text style={styles.liveMetaLabel}>Equity</Text>
              </>
            )}
          </View>
          <Pressable
            onPress={onSpeak}
            style={styles.liveSpeakerBtn}
            testID="live-tts-btn"
          >
            <Ionicons
              name={ttsEnabled ? "volume-high" : "volume-mute"}
              size={20}
              color={ttsEnabled ? colors.brand : colors.onSurfaceTertiary}
            />
          </Pressable>
        </View>
      ) : (
        <View style={styles.liveEmpty}>
          <Text style={styles.liveEmptyText}>
            {analyzing
              ? "Detectando cartas..."
              : error
              ? error
              : "Aguardando primeira análise. Aponte a câmera para a mesa."}
          </Text>
        </View>
      )}

      {/* interval selector */}
      <View style={styles.intervalRow}>
        <Text style={styles.intervalLabel}>Intervalo:</Text>
        {INTERVAL_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[
              styles.intervalChip,
              intervalS === opt.value && styles.intervalChipActive,
            ]}
            onPress={() => onChangeInterval(opt.value)}
            testID={`interval-${opt.value}`}
          >
            <Text
              style={[
                styles.intervalChipText,
                intervalS === opt.value && styles.intervalChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[
          styles.liveToggle,
          { backgroundColor: running ? colors.error : colors.brand },
        ]}
        onPress={running ? onStop : onStart}
        testID="btn-live-toggle"
      >
        <Ionicons
          name={running ? "pause" : "play"}
          size={20}
          color={colors.onBrandPrimary}
        />
        <Text style={styles.liveToggleText}>
          {running ? "Pausar" : "Retomar"}
        </Text>
      </Pressable>
    </View>
  </View>
);

// ---------------- SINGLE (fallback from gallery) ----------------
const SingleView = ({
  imageUri,
  analyzing,
  detected,
  result,
  error,
  onSpeak,
  ttsEnabled,
  onBack,
}: any) => (
  <ScrollView
    contentContainerStyle={styles.singleContent}
    showsVerticalScrollIndicator={false}
  >
    <View style={styles.imageCard}>
      <ExpoImage
        source={{ uri: imageUri }}
        style={styles.previewImage}
        contentFit="cover"
      />
      {analyzing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.overlayText}>Analisando...</Text>
        </View>
      )}
    </View>

    {detected && (
      <View style={styles.detectionCard}>
        <View style={styles.detectionHeader}>
          <Text style={styles.detectionLabel}>DETECTADO</Text>
          <Text style={styles.detectionConf}>
            {detected.detection_confidence.toFixed(0)}% confiança
          </Text>
        </View>
        <Text style={styles.sectionLabel}>Suas Cartas</Text>
        <View style={styles.cardsRow}>
          {[0, 1].map((i) => (
            <PokerCard
              key={i}
              card={detected.hero_cards[i]}
              size="md"
              placeholder="?"
            />
          ))}
        </View>
        {detected.community.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Mesa</Text>
            <View style={styles.cardsRow}>
              {detected.community.map((c: string, i: number) => (
                <PokerCard key={i} card={c} size="sm" />
              ))}
            </View>
          </>
        )}
        <View style={styles.statsRow}>
          <StatBox label="Pote" value={detected.pot.toFixed(1)} />
          <StatBox label="Stack" value={detected.hero_stack.toFixed(0)} />
          <StatBox label="Pos." value={detected.position} />
          <StatBox label="Opp." value={String(detected.n_opponents)} />
        </View>
      </View>
    )}

    {result && (
      <RecommendationCard
        result={result}
        onSpeak={onSpeak}
        ttsEnabled={ttsEnabled}
      />
    )}

    {error && (
      <View style={styles.errorCard}>
        <Ionicons name="alert-circle" size={20} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    )}

    <Pressable style={styles.newBtn} onPress={onBack} testID="btn-single-back">
      <Ionicons name="arrow-back" size={20} color={colors.onSurface} />
      <Text style={styles.newBtnText}>Voltar</Text>
    </Pressable>
  </ScrollView>
);

const StatBox = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.statBox}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  eyebrow: {
    color: colors.brand,
    fontSize: typography.sm,
    fontWeight: "800",
    letterSpacing: 3,
  },
  title: {
    color: colors.onSurface,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 2,
  },
  ttsIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245,158,11,0.15)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  ttsIndicatorText: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "700",
  },
  // Idle
  idleContent: {
    padding: spacing.lg,
    paddingBottom: 120,
    alignItems: "center",
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(245,158,11,0.3)",
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  emptySub: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.base,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  liveCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    width: "100%",
    marginBottom: spacing.lg,
  },
  liveCtaText: {
    color: colors.onBrandPrimary,
    fontSize: typography.lg,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  screenCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
    width: "100%",
    marginBottom: spacing.md,
  },
  screenCtaText: {
    color: colors.onSurface,
    fontSize: typography.base,
    fontWeight: "800",
  },
  screenCtaSub: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    marginTop: 2,
  },
  separator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.md,
    width: "100%",
  },
  line: { flex: 1, height: 1, backgroundColor: colors.divider },
  separatorText: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  altBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
    marginBottom: spacing.xl,
  },
  altBtnText: {
    color: colors.onSurface,
    fontSize: typography.base,
    fontWeight: "700",
  },
  tipsCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
    width: "100%",
    marginBottom: spacing.md,
  },
  tipsTitle: {
    color: colors.info,
    fontSize: typography.sm,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  tipsText: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  strong: {
    color: colors.brand,
    fontWeight: "800",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    width: "100%",
  },
  warningText: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    flex: 1,
    lineHeight: 18,
  },

  // Live mode
  liveContainer: { flex: 1 },
  cameraWrap: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  hud: {
    ...StyleSheet.absoluteFillObject,
    padding: spacing.md,
  },
  hudTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hudBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  statusText: {
    color: "#fff",
    fontSize: typography.sm,
    fontWeight: "700",
  },
  miniDetection: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: "rgba(10,20,16,0.85)",
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniCards: { flexDirection: "row", gap: 4, alignItems: "center" },
  miniDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  miniInfo: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  liveBottom: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    paddingBottom: spacing.xl + 60,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  liveEmpty: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 70,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveEmptyText: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  liveActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "stretch",
  },
  liveActionBox: {
    flex: 2,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  liveActionText: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  liveBet: {
    color: colors.onSurface,
    fontSize: typography.base,
    fontWeight: "700",
    marginTop: 2,
  },
  liveMeta: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveMetaBig: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "900",
  },
  liveMetaLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  liveSpeakerBtn: {
    width: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  intervalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  intervalLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  intervalChip: {
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1.5,
    borderColor: "transparent",
    justifyContent: "center",
  },
  intervalChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  intervalChipText: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    fontWeight: "700",
  },
  intervalChipTextActive: { color: colors.brand },
  liveToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  liveToggleText: {
    color: colors.onBrandPrimary,
    fontSize: typography.lg,
    fontWeight: "800",
  },

  // Single mode (fallback)
  singleContent: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
  },
  imageCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewImage: { width: "100%", height: 240 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,20,16,0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  overlayText: {
    color: colors.brand,
    fontSize: typography.base,
    fontWeight: "700",
  },
  detectionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  detectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detectionLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontWeight: "800",
    letterSpacing: 2,
  },
  detectionConf: {
    color: colors.success,
    fontSize: typography.sm,
    fontWeight: "700",
  },
  sectionLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
  },
  statLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: {
    color: colors.onSurface,
    fontSize: typography.lg,
    fontWeight: "800",
    marginTop: 2,
  },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  errorText: {
    color: colors.onSurface,
    fontSize: typography.sm,
    flex: 1,
    lineHeight: 18,
  },
  newBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  newBtnText: {
    color: colors.onSurface,
    fontSize: typography.base,
    fontWeight: "700",
  },
});
