import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { colors, spacing, typography } from "../src/theme";

const DURATION = 2000;

export default function SplashScreen() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: false,
    }).start(() => {
      router.replace("/(tabs)");
    });
  }, []);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.screen}>
      <Image
        source={require("../assets/images/onboarding/loading_logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.label}>Tracing origin...</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.elementV,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: spacing.elementV,
  },
  label: {
    ...typography.body,
    color: colors.text,
  },
  track: {
    height: 15,
    width: 295,
    backgroundColor: colors.border,
    borderRadius: spacing.radius,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.primaryMid,
    borderRadius: spacing.radius,
  },
});
