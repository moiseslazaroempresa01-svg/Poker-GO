// Theme tokens derived from /app/design_guidelines.json
// Poker Trainer AI Mobile — Dark-First Utility

export const colors = {
  surface: "#0A1410",
  onSurface: "#F4F7F5",
  surfaceSecondary: "#13221C",
  onSurfaceSecondary: "#A5BBAF",
  surfaceTertiary: "#1B3027",
  onSurfaceTertiary: "#8DA69A",
  brand: "#F59E0B",
  brandPrimary: "#D97706",
  onBrandPrimary: "#FFFBEB",
  brandSecondary: "#B45309",
  brandTertiary: "#78350F",
  onBrandTertiary: "#FDE68A",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#1C1917",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  border: "#274034",
  borderStrong: "#3B5C4D",
  divider: "#182C24",
  // Poker action colors (from design guidelines)
  actionFold: "#EF4444",
  actionCall: "#F5D14A",
  actionRaise: "#10B981",
  actionAllin: "#F59E0B",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const typography = {
  display: "System", // Barlow Condensed not loaded; use bold System
  text: "System",
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 34,
  jumbo: 56,
};

// Portuguese action labels
export const actionLabels: Record<string, string> = {
  FOLD: "DESISTIR",
  CALL: "PAGAR",
  RAISE: "AUMENTAR",
  "ALL-IN": "TUDO",
};

export const actionColor = (action: string): string => {
  const a = action.toUpperCase();
  if (a === "FOLD") return colors.actionFold;
  if (a === "CALL") return colors.actionCall;
  if (a === "RAISE") return colors.actionRaise;
  if (a === "ALL-IN" || a === "ALLIN") return colors.actionAllin;
  return colors.brand;
};
