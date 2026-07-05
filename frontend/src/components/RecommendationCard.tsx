// Recommendation card - the big action display
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography, actionLabels, actionColor } from "@/src/theme";

export interface DecisionResult {
  action: string;
  bet_size: number;
  confidence: number;
  reasoning: string;
  equity?: { win: number; tie: number; lose: number } | null;
  pot_odds: number;
  chen_score?: number | null;
}

interface Props {
  result: DecisionResult;
  onSpeak?: () => void;
  ttsEnabled?: boolean;
}

export const RecommendationCard: React.FC<Props> = ({
  result,
  onSpeak,
  ttsEnabled,
}) => {
  const label = actionLabels[result.action.toUpperCase()] || result.action;
  const color = actionColor(result.action);

  return (
    <View style={styles.container} testID="recommendation-card">
      <View style={styles.header}>
        <Text style={styles.headerLabel}>RECOMENDAÇÃO</Text>
        {onSpeak && (
          <Pressable
            onPress={onSpeak}
            style={styles.speakerBtn}
            testID="tts-speak-button"
          >
            <Ionicons
              name={ttsEnabled ? "volume-high" : "volume-mute"}
              size={20}
              color={ttsEnabled ? colors.brand : colors.onSurfaceTertiary}
            />
          </Pressable>
        )}
      </View>

      <View style={[styles.actionRow, { borderColor: color }]}>
        <Text
          style={[styles.actionText, { color }]}
          testID="recommendation-action"
        >
          {label}
        </Text>
        {result.bet_size > 0 && (
          <Text style={styles.betSize} testID="recommendation-bet-size">
            {result.bet_size.toFixed(2)} BB
          </Text>
        )}
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Confiança</Text>
          <Text style={styles.metricValue} testID="recommendation-confidence">
            {result.confidence.toFixed(0)}%
          </Text>
        </View>
        {result.equity && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Equity</Text>
            <Text style={[styles.metricValue, { color: colors.success }]}>
              {result.equity.win.toFixed(1)}%
            </Text>
          </View>
        )}
        {result.chen_score != null && (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Chen</Text>
            <Text style={[styles.metricValue, { color: colors.info }]}>
              {result.chen_score.toFixed(1)}
            </Text>
          </View>
        )}
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Odds Pote</Text>
          <Text style={styles.metricValue}>{result.pot_odds.toFixed(1)}%</Text>
        </View>
      </View>

      <View style={styles.reasoning}>
        <Text style={styles.reasoningLabel}>ANÁLISE</Text>
        <Text style={styles.reasoningText} testID="recommendation-reasoning">
          {result.reasoning}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontWeight: "700",
    letterSpacing: 2,
  },
  speakerBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  actionText: {
    fontSize: typography.jumbo,
    fontWeight: "900",
    letterSpacing: 2,
    lineHeight: typography.jumbo * 1.05,
  },
  betSize: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
  },
  metricLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metricValue: {
    color: colors.onSurface,
    fontSize: typography.lg,
    fontWeight: "800",
    marginTop: 2,
  },
  reasoning: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
  },
  reasoningLabel: {
    color: colors.brand,
    fontSize: typography.sm,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  reasoningText: {
    color: colors.onSurface,
    fontSize: typography.base,
    lineHeight: 20,
  },
});
