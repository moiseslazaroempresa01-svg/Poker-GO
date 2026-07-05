// Manual input tab - card selectors + position + stack/pot inputs
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { colors, radius, spacing, typography, actionLabels } from "@/src/theme";
import { PokerCard } from "@/src/components/PokerCard";
import { CardPicker } from "@/src/components/CardPicker";
import {
  RecommendationCard,
  DecisionResult,
} from "@/src/components/RecommendationCard";
import { api } from "@/src/api";
import { useSettings } from "@/src/hooks/use-settings";
import { speak as speakAudio, phraseForDecision } from "@/src/audio";

const POSITIONS = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

export default function ManualScreen() {
  const { settings } = useSettings();
  const [heroCards, setHeroCards] = useState<(string | undefined)[]>([
    undefined,
    undefined,
  ]);
  const [community, setCommunity] = useState<(string | undefined)[]>([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  const [position, setPosition] = useState("BTN");
  const [toCall, setToCall] = useState("1");
  const [pot, setPot] = useState("1.5");
  const [heroStack, setHeroStack] = useState("100");
  const [nOpponents, setNOpponents] = useState("1");

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    kind: "hero" | "community";
    index: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openPicker = (kind: "hero" | "community", index: number) => {
    setPickerTarget({ kind, index });
    setPickerVisible(true);
  };

  const handleSelect = (card: string) => {
    if (!pickerTarget) return;
    if (pickerTarget.kind === "hero") {
      const next = [...heroCards];
      next[pickerTarget.index] = card;
      setHeroCards(next);
    } else {
      const next = [...community];
      next[pickerTarget.index] = card;
      setCommunity(next);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const clearCard = (kind: "hero" | "community", index: number) => {
    if (kind === "hero") {
      const next = [...heroCards];
      next[index] = undefined;
      setHeroCards(next);
    } else {
      const next = [...community];
      next[index] = undefined;
      setCommunity(next);
    }
  };

  const allUsed = () =>
    [...heroCards, ...community].filter(Boolean) as string[];

  const speak = (text: string, prio = 2) => {
    if (!settings.ttsEnabled) return;
    speakAudio(text, prio);
  };

  const analyze = async () => {
    const hero = heroCards.filter(Boolean) as string[];
    if (hero.length !== 2) {
      setError("Selecione suas 2 cartas privadas.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const communityCards = community.filter(Boolean) as string[];
      const dec = await api.decide({
        hero_cards: hero,
        community: communityCards,
        position,
        to_call: parseFloat(toCall) || 0,
        pot: parseFloat(pot) || 1.5,
        hero_stack: parseFloat(heroStack) || 100,
        n_opponents: parseInt(nOpponents, 10) || 1,
        style: settings.style,
      });
      setResult(dec);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const prio = dec.action.toUpperCase().includes("ALL") ? 3 : 2;
      speak(phraseForDecision(dec.action, dec.bet_size, dec.confidence), prio);
      // Save to history
      api
        .createHistory({
          hero_cards: hero,
          community: communityCards,
          position,
          action: dec.action,
          bet_size: dec.bet_size,
          confidence: dec.confidence,
          reasoning: dec.reasoning,
          pot: parseFloat(pot) || 0,
          equity: dec.equity,
          source: "manual",
        })
        .catch(() => {});
    } catch (e: any) {
      setError(e.message || "Falha ao calcular jogada.");
    } finally {
      setLoading(false);
    }
  };

  const speakAgain = () => {
    if (result) {
      const text = `${actionLabels[result.action.toUpperCase()] || result.action}${
        result.bet_size > 0 ? `, ${result.bet_size.toFixed(1)} big blinds` : ""
      }. ${result.reasoning}`;
      speak(text, 3);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MANUAL</Text>
          <Text style={styles.title}>Configurar Mão</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero cards */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Suas Cartas Privadas</Text>
            <View style={styles.cardsRow}>
              {[0, 1].map((i) => (
                <Pressable
                  key={i}
                  onPress={() =>
                    heroCards[i]
                      ? clearCard("hero", i)
                      : openPicker("hero", i)
                  }
                  testID={`hero-card-${i}`}
                >
                  <PokerCard
                    card={heroCards[i]}
                    size="lg"
                    placeholder="+"
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>Toque em uma carta para trocar.</Text>
          </View>

          {/* Community */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cartas Comunitárias</Text>
            <View style={styles.cardsRow}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Pressable
                  key={i}
                  onPress={() =>
                    community[i]
                      ? clearCard("community", i)
                      : openPicker("community", i)
                  }
                  testID={`community-card-${i}`}
                >
                  <PokerCard
                    card={community[i]}
                    size="md"
                    placeholder={i < 3 ? "F" : i === 3 ? "T" : "R"}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>F=Flop · T=Turn · R=River</Text>
          </View>

          {/* Position */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Posição</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {POSITIONS.map((p) => (
                <Pressable
                  key={p}
                  style={[
                    styles.chip,
                    position === p && styles.chipActive,
                  ]}
                  onPress={() => setPosition(p)}
                  testID={`position-${p}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      position === p && styles.chipTextActive,
                    ]}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Numeric inputs */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Valores (em BB)</Text>
            <View style={styles.inputGrid}>
              <NumInput
                label="Pote"
                value={pot}
                onChange={setPot}
                testID="input-pot"
              />
              <NumInput
                label="Para pagar"
                value={toCall}
                onChange={setToCall}
                testID="input-tocall"
              />
              <NumInput
                label="Seu stack"
                value={heroStack}
                onChange={setHeroStack}
                testID="input-stack"
              />
              <NumInput
                label="Oponentes"
                value={nOpponents}
                onChange={setNOpponents}
                testID="input-opps"
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={20} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {result && (
            <RecommendationCard
              result={result}
              onSpeak={speakAgain}
              ttsEnabled={settings.ttsEnabled}
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.cta, loading && styles.ctaDisabled]}
            onPress={analyze}
            disabled={loading}
            testID="btn-analyze-manual"
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="flash" size={22} color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>Analisar Mão</Text>
              </>
            )}
          </Pressable>
        </View>

        <CardPicker
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSelect={handleSelect}
          excluded={allUsed()}
          title={
            pickerTarget?.kind === "hero"
              ? "Sua Carta"
              : "Carta Comunitária"
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const NumInput = ({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
}) => (
  <View style={styles.numInputWrap}>
    <Text style={styles.numLabel}>{label}</Text>
    <TextInput
      style={styles.numInput}
      value={value}
      onChangeText={onChange}
      keyboardType="decimal-pad"
      selectTextOnFocus
      placeholderTextColor={colors.onSurfaceTertiary}
      testID={testID}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
  content: {
    padding: spacing.lg,
    paddingBottom: 180,
    gap: spacing.lg,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardsRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  hint: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontStyle: "italic",
    marginTop: 2,
  },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 2,
    borderColor: "transparent",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  chipText: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.base,
    fontWeight: "700",
  },
  chipTextActive: { color: colors.brand },
  inputGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  numInputWrap: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  numLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  numInput: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "800",
    padding: 0,
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
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 84,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: {
    color: colors.onBrandPrimary,
    fontSize: typography.lg,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
