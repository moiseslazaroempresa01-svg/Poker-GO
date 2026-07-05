// Historico tab - list of past hands + recommendations
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { colors, radius, spacing, typography, actionLabels, actionColor } from "@/src/theme";
import { PokerCard } from "@/src/components/PokerCard";
import { api, HistoryEntry } from "@/src/api";

export default function HistoricoScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listHistory();
      setEntries(data);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar histórico.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const clearAll = () => {
    Alert.alert(
      "Limpar histórico",
      "Isso irá remover todas as análises salvas. Confirmar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar",
          style: "destructive",
          onPress: async () => {
            await api.clearHistory();
            load();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>HISTÓRICO</Text>
          <Text style={styles.title}>Suas Análises</Text>
        </View>
        {entries.length > 0 && (
          <Pressable
            onPress={clearAll}
            style={styles.clearBtn}
            testID="btn-clear-history"
          >
            <Ionicons name="trash" size={18} color={colors.error} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={56} color={colors.brand} />
          </View>
          <Text style={styles.emptyTitle}>Seu histórico está vazio</Text>
          <Text style={styles.emptySub}>
            As análises que você fizer aparecerão aqui.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.brand}
            />
          }
          renderItem={({ item }) => <HistoryRow entry={item} />}
        />
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const HistoryRow = ({ entry }: { entry: HistoryEntry }) => {
  const label = actionLabels[entry.action.toUpperCase()] || entry.action;
  const color = actionColor(entry.action);
  const date = new Date(entry.timestamp);
  const dateStr = `${date.toLocaleDateString("pt-BR")} · ${date.toLocaleTimeString(
    "pt-BR",
    { hour: "2-digit", minute: "2-digit" }
  )}`;

  return (
    <View style={styles.row} testID={`history-row-${entry.id}`}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowDate}>{dateStr}</Text>
        <View style={styles.sourceBadge}>
          <Ionicons
            name={entry.source === "image" ? "scan" : "grid"}
            size={11}
            color={colors.onSurfaceTertiary}
          />
          <Text style={styles.sourceText}>
            {entry.source === "image" ? "Imagem" : "Manual"}
          </Text>
        </View>
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowCards}>
          {entry.hero_cards.map((c, i) => (
            <PokerCard key={`h-${i}`} card={c} size="sm" />
          ))}
          {entry.community.length > 0 && (
            <>
              <View style={styles.divider} />
              {entry.community.map((c, i) => (
                <PokerCard key={`b-${i}`} card={c} size="sm" />
              ))}
            </>
          )}
        </View>

        <View style={styles.rowMeta}>
          <Text style={[styles.actionBadge, { color, borderColor: color }]}>
            {label}
          </Text>
          {entry.bet_size > 0 && (
            <Text style={styles.betText}>{entry.bet_size.toFixed(1)} BB</Text>
          )}
          <Text style={styles.confText}>{entry.confidence.toFixed(0)}%</Text>
        </View>
      </View>

      <View style={styles.rowFooter}>
        <Text style={styles.position}>{entry.position}</Text>
        <Text style={styles.pot}>Pote {entry.pot.toFixed(1)}</Text>
        {entry.equity && (
          <Text style={styles.equity}>
            EQ {entry.equity.win.toFixed(0)}%
          </Text>
        )}
      </View>
    </View>
  );
};

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
  clearBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    paddingBottom: 100,
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
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: typography.xxl,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  emptySub: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.base,
    textAlign: "center",
  },
  list: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.md,
  },
  row: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowDate: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  sourceText: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    fontWeight: "700",
  },
  rowBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowCards: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    flexShrink: 1,
    flexWrap: "wrap",
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  rowMeta: { alignItems: "flex-end", gap: 2 },
  actionBadge: {
    fontSize: typography.base,
    fontWeight: "900",
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  betText: {
    color: colors.onSurface,
    fontSize: typography.sm,
    fontWeight: "700",
  },
  confText: {
    color: colors.onSurfaceTertiary,
    fontSize: typography.sm,
    fontWeight: "600",
  },
  rowFooter: {
    flexDirection: "row",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  position: {
    color: colors.brand,
    fontSize: typography.sm,
    fontWeight: "700",
  },
  pot: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
  },
  equity: {
    color: colors.success,
    fontSize: typography.sm,
    fontWeight: "700",
  },
  errorBanner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 100,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorText: { color: colors.onSurface, fontSize: typography.sm },
});
