import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { BlurView } from "expo-blur";
import { colors, spacing } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginBottom: Platform.OS === "ios" ? 0 : 4,
        },
        tabBarStyle: {
          position: "absolute",
          borderTopColor: colors.border,
          backgroundColor:
            Platform.OS === "ios" ? "rgba(10,20,16,0.6)" : colors.surface,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingTop: spacing.xs,
        },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => (
                <BlurView
                  intensity={40}
                  tint="dark"
                  style={{ flex: 1 }}
                />
              )
            : undefined,
      }}
    >
      <Tabs.Screen
        name="analisar"
        options={{
          title: "Analisar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-analisar",
        }}
      />
      <Tabs.Screen
        name="manual"
        options={{
          title: "Manual",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-manual",
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: "Histórico",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-historico",
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: "Ajustes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-ajustes",
        }}
      />
    </Tabs>
  );
}
