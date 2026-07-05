// Card picker bottom sheet - lets user pick a specific rank + suit
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { colors, radius, spacing, typography } from "@/src/theme";
import { PokerCard } from "./PokerCard";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = [
  { value: "h", label: "\u2665", color: "#EF4444", name: "Copas" },
  { value: "d", label: "\u2666", color: "#EF4444", name: "Ouros" },
  { value: "c", label: "\u2663", color: "#0F172A", name: "Paus" },
  { value: "s", label: "\u2660", color: "#0F172A", name: "Espadas" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (card: string) => void;
  excluded?: string[];
  title?: string;
}

export const CardPicker: React.FC<Props> = ({
  visible,
  onClose,
  onSelect,
  excluded = [],
  title = "Escolha uma carta",
}) => {
  const [rank, setRank] = useState<string | null>(null);
  const [suit, setSuit] = useState<string | null>(null);

  const handleConfirm = () => {
    if (rank && suit) {
      onSelect(rank + suit);
      setRank(null);
      setSuit(null);
      onClose();
    }
  };

  const handleClose = () => {
    setRank(null);
    setSuit(null);
    onClose();
  };

  const previewCard = rank && suit ? rank + suit : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      testID="card-picker-modal"
    >
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet} testID="card-picker-sheet">
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>

        <View style={styles.previewRow}>
          <PokerCard card={previewCard} size="lg" placeholder="?" />
        </View>

        <Text style={styles.sectionLabel}>Naipe</Text>
        <View style={styles.suitRow}>
          {SUITS.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => setSuit(s.value)}
              style={[
                styles.suitBtn,
                suit === s.value && styles.suitBtnActive,
              ]}
              testID={`suit-${s.value}`}
            >
              <Text style={[styles.suitSymbol, { color: s.color }]}>
                {s.label}
              </Text>
              <Text style={styles.suitName}>{s.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Valor</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rankRow}
        >
          {RANKS.map((r) => {
            const disabled = suit
              ? excluded.includes(r + suit)
              : false;
            return (
              <Pressable
                key={r}
                onPress={() => !disabled && setRank(r)}
                disabled={disabled}
                style={[
                  styles.rankChip,
                  rank === r && styles.rankChipActive,
                  disabled && styles.rankChipDisabled,
                ]}
                testID={`rank-${r}`}
              >
                <Text
                  style={[
                    styles.rankText,
                    rank === r && styles.rankTextActive,
                    disabled && styles.rankTextDisabled,
                  ]}
                >
                  {r === "T" ? "10" : r}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={handleConfirm}
          disabled={!rank || !suit}
          style={[
            styles.confirm,
            (!rank || !suit) && styles.confirmDisabled,
          ]}
          testID="card-picker-confirm"
        >
          <Text style={styles.confirmText}>Confirmar</Text>
        </Pressable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.onSurface,
    fontSize: typography.xl,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  previewRow: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    fontWeight: "600",
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  suitRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  suitBtn: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  suitBtnActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  suitSymbol: { fontSize: 28, lineHeight: 32 },
  suitName: {
    color: colors.onSurfaceSecondary,
    fontSize: typography.sm,
    marginTop: 2,
  },
  rankRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
    marginBottom: spacing.lg,
  },
  rankChip: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    flexShrink: 0,
  },
  rankChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  rankChipDisabled: { opacity: 0.35 },
  rankText: {
    color: colors.onSurface,
    fontSize: typography.lg,
    fontWeight: "700",
  },
  rankTextActive: { color: colors.brand },
  rankTextDisabled: { color: colors.onSurfaceTertiary },
  confirm: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  confirmDisabled: { opacity: 0.5 },
  confirmText: {
    color: colors.onBrandPrimary,
    fontSize: typography.lg,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
