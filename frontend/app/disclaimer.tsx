// Mandatory disclaimer screen
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing, typography } from "@/src/theme";
import { useSettings } from "@/src/hooks/use-settings";

export default function Disclaimer() {
  const { update } = useSettings();
  const router = useRouter();

  const handleAccept = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await update({ disclaimerAccepted: true });
    router.replace("/(tabs)/analisar");
  };

  return (
    <View style={styles.container} testID="disclaimer-screen">
      <ImageBackground
        source={{
          uri: "https://images.pexels.com/photos/4253690/pexels-photo-4253690.jpeg",
        }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            "rgba(10,20,16,0.5)",
            "rgba(10,20,16,0.85)",
            "rgba(10,20,16,1)",
          ]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="school" size={40} color={colors.brand} />
          </View>

          <Text style={styles.eyebrow}>POKER TRAINER AI</Text>
          <Text style={styles.title}>Bem-vindo</Text>

          <Text style={styles.body}>
            Este aplicativo é uma{" "}
            <Text style={styles.emphasis}>ferramenta de estudo e treinamento</Text>
            {" "}para Texas Hold&apos;em.
          </Text>

          <View style={styles.rulesCard}>
            <RuleRow
              icon="school"
              color={colors.success}
              text="Focado em aprendizado e prática pessoal"
            />
            <RuleRow
              icon="analytics"
              color={colors.brand}
              text="Todas as recomendações são educacionais"
            />
            <RuleRow
              icon="shield-checkmark"
              color={colors.info}
              text="Suas mãos ficam salvas apenas no seu dispositivo"
            />
            <RuleRow
              icon="bulb"
              color={colors.warning}
              text="Use com responsabilidade e respeite as regras de onde você joga"
            />
          </View>

          <Text style={styles.footnote}>
            Ao continuar, você concorda em usar o app de forma responsável para
            fins de estudo. Boa prática!
          </Text>
        </ScrollView>

        <View style={styles.ctaWrap}>
          <Pressable
            style={styles.cta}
            onPress={handleAccept}
            testID="disclaimer-accept-button"
          >
            <Text style={styles.ctaText}>Aceitar e Continuar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const RuleRow = ({
  icon,
  color,
  text,
}: {
  icon: any;
  color: string;
  text: string;
}) => (
  <View style={styles.ruleRow}>
    <Ionicons name={icon} size={22} color={color} />
    <Text style={styles.ruleText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  safe: { flex: 1 },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
    justifyContent: "center",
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: "rgba(245,158,11,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.3)",
  },
  eyebrow: {
    color: colors.brand,
    fontSize: typography.sm,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.onSurface,
    fontSize: 40,
    fontWeight: "900",
    marginBottom: spacing.lg,
    lineHeight: 44,
  },
  body: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.lg,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  emphasis: {
    color: colors.brand,
    fontWeight: "700",
  },
  rulesCard: {
    backgroundColor: "rgba(19,34,28,0.7)",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  ruleText: {
    color: colors.onSurface,
    fontSize: typography.base,
    flex: 1,
    lineHeight: 20,
  },
  footnote: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    lineHeight: 18,
    textAlign: "center",
    marginTop: spacing.md,
  },
  ctaWrap: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  ctaText: {
    color: colors.onBrandPrimary,
    fontSize: typography.lg,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
