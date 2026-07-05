// Entry route - decides between disclaimer and main tabs based on settings
import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSettings } from "@/src/hooks/use-settings";
import { colors } from "@/src/theme";

export default function Index() {
  const { settings, loaded } = useSettings();
  const router = useRouter();

  useEffect(() => {
    if (!loaded) return;
    if (settings.disclaimerAccepted) {
      router.replace("/(tabs)/analisar");
    } else {
      router.replace("/disclaimer");
    }
  }, [loaded, settings.disclaimerAccepted, router]);

  return (
    <View style={styles.container} testID="index-loading">
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
