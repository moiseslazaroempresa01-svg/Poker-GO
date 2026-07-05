// Poker card visual component
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, radius, spacing } from "@/src/theme";

interface Props {
  card?: string; // e.g., "Ah", "Td", or undefined for placeholder
  size?: "sm" | "md" | "lg";
  onPress?: () => void;
  selected?: boolean;
  placeholder?: string;
  testID?: string;
}

const SUIT_SYMBOL: Record<string, string> = {
  h: "\u2665",
  d: "\u2666",
  c: "\u2663",
  s: "\u2660",
};

const SUIT_COLOR: Record<string, string> = {
  h: "#EF4444",
  d: "#EF4444",
  c: "#0F172A",
  s: "#0F172A",
};

export const PokerCard: React.FC<Props> = ({
  card,
  size = "md",
  onPress,
  selected,
  placeholder = "?",
  testID,
}) => {
  const dims =
    size === "lg"
      ? { w: 72, h: 100, rank: 30, suit: 26 }
      : size === "sm"
      ? { w: 36, h: 52, rank: 15, suit: 13 }
      : { w: 52, h: 74, rank: 22, suit: 19 };

  const rank = card ? card[0].toUpperCase() : "";
  const suit = card ? card[1].toLowerCase() : "";
  const suitSymbol = suit ? SUIT_SYMBOL[suit] : "";
  const suitColor = suit ? SUIT_COLOR[suit] : "#8DA69A";

  const inner = (
    <View
      style={[
        styles.card,
        { width: dims.w, height: dims.h },
        !card && styles.placeholder,
        selected && styles.selected,
      ]}
    >
      {card ? (
        <>
          <Text style={[styles.rank, { fontSize: dims.rank, color: suitColor }]}>
            {rank === "T" ? "10" : rank}
          </Text>
          <Text style={[styles.suit, { fontSize: dims.suit, color: suitColor }]}>
            {suitSymbol}
          </Text>
        </>
      ) : (
        <Text style={styles.placeholderText}>{placeholder}</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} testID={testID}>
        {inner}
      </Pressable>
    );
  }
  return <View testID={testID}>{inner}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    padding: spacing.xs,
  },
  placeholder: {
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  selected: {
    borderColor: colors.brand,
    borderWidth: 3,
  },
  rank: {
    fontWeight: "800",
    lineHeight: undefined,
  },
  suit: {
    marginTop: -2,
  },
  placeholderText: {
    color: colors.onSurfaceTertiary,
    fontSize: 18,
    fontWeight: "700",
  },
});
