import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from "@expo-google-fonts/figtree";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";
import { MetricsProvider } from "../src/context/MetricsContext";
import { CameraWarmupProvider } from "../src/context/CameraWarmupContext";
import { initDb } from "../src/storage/db";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // useState lazy initializer runs synchronously on first render,
  // inside React's lifecycle so native modules are ready
  useState(() => initDb());

  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <MetricsProvider>
      <CameraWarmupProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="splash" />
          <Stack.Screen name="results" />
          <Stack.Screen name="loading" />
        </Stack>
      </CameraWarmupProvider>
    </MetricsProvider>
  );
}
