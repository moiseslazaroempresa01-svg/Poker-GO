// Ajustes (Settings) tab
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { colors, radius, spacing, typography } from "@/src/theme";
import { useSettings } from "@/src/hooks/use-settings";
import { speak, stopSpeaking } from "@/src/audio";

const STYLES: {
  value: "tight" | "balanced" | "loose";
  label: string;
  desc: string;
}[] = [
  { value: "tight", label: "Conservador", desc: "Mais folds, valor puro" },
  { value: "balanced", label: "Equilibrado", desc: "GTO-like padrão" },
  { value: "loose", label: "Agressivo", desc: "Mais raises, pressão" },
];

export default function AjustesScreen() {
  const { settings, update } = useSettings();

  const testTTS = () => {
    stopSpeaking();
    speak("Aumentar. 3 big blinds. Confiança 82 por cento.", 3);
  };

  const resetDisclaimer = () => {
    update({ disclaimerAccepted: false });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>AJUSTES</Text>
        <Text style={styles.title}>Preferências</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Audio section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Áudio</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name="volume-high" size={20} color={colors.brand} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>Voz da recomendação</Text>
                <Text style={styles.rowSub}>
                  Fala a jogada em português (TTS)
                </Text>
              </View>
              <Switch
                value={settings.ttsEnabled}
                onValueChange={(v) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  update({ ttsEnabled: v });
                }}
                trackColor={{
                  false: colors.surfaceTertiary,
                  true: colors.brand,
                }}
                thumbColor={colors.onSurface}
                testID="switch-tts"
              />
            </View>

            <View style={styles.divider} />

            <Pressable
              style={styles.row}
              onPress={testTTS}
              disabled={!settings.ttsEnabled}
              testID="btn-test-tts"
            >
              <View style={styles.iconWrap}>
                <Ionicons
                  name="play"
                  size={20}
                  color={
                    settings.ttsEnabled ? colors.brand : colors.onSurfaceTertiary
                  }
                />
              </View>
              <View style={styles.rowContent}>
                <Text
                  style={[
                    styles.rowTitle,
                    !settings.ttsEnabled && styles.disabledText,
                  ]}
                >
                  Testar voz
                </Text>
                <Text style={styles.rowSub}>Reproduz um exemplo</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.onSurfaceTertiary}
              />
            </Pressable>
          </View>
        </View>

        {/* Style section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Perfil de Jogo</Text>
          <Text style={styles.sectionDesc}>
            Ajusta o quão agressivo é o motor de decisão.
          </Text>
          <View style={styles.card}>
            {STYLES.map((s, idx) => (
              <React.Fragment key={s.value}>
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    update({ style: s.value });
                  }}
                  testID={`style-${s.value}`}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={
                        s.value === "tight"
                          ? "shield-checkmark"
                          : s.value === "balanced"
                          ? "options"
                          : "flame"
                      }
                      size={20}
                      color={colors.brand}
                    />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>{s.label}</Text>
                    <Text style={styles.rowSub}>{s.desc}</Text>
                  </View>
                  {settings.style === s.value && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.brand}
                    />
                  )}
                </Pressable>
                {idx < STYLES.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* About / Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sobre</Text>
          <View style={styles.card}>
            <Pressable
              style={styles.row}
              onPress={resetDisclaimer}
              testID="btn-reset-disclaimer"
            >
              <View
                style={styles.iconWrap}
              >
                <Ionicons name="school" size={20} color={colors.brand} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>Ver tela de boas-vindas</Text>
                <Text style={styles.rowSub}>
                  Rever informações do app
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.onSurfaceTertiary}
              />
            </Pressable>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons
                  name="information-circle"
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>Versão</Text>
                <Text style={styles.rowSub}>1.0.0 · MVP</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.warningCard}>
          <Ionicons name="school" size={20} color={colors.brand} />
          <Text style={styles.warningText}>
            Ferramenta educacional para estudo e treinamento de Texas Hold&apos;em.
            Use com responsabilidade.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
    paddingBottom: 120,
    gap: spacing.xl,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionDesc: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: "rgba(245,158,11,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1 },
  rowTitle: {
    color: colors.onSurface,
    fontSize: typography.lg,
    fontWeight: "700",
  },
  rowSub: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    marginTop: 2,
  },
  disabledText: { color: colors.onSurfaceTertiary },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 60,
  },
  warningCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  warningText: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    lineHeight: 18,
    flex: 1,
  },
});
