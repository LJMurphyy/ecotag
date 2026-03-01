import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, typography, spacing } from "../../src/theme";
import { CameraView } from "../../src/components/CameraView";
import { useMetrics } from "../../src/context/MetricsContext";
import { setPendingScanImage } from "../../src/services/api";

export default function ScanScreen() {
  const router = useRouter();
  const metrics = useMetrics();

  const handleCapture = useCallback(
    (imageUri: string) => {
      setPendingScanImage(imageUri);
      router.push("/loading");
    },
    [router],
  );

  return (
    <View
      style={styles.root}
      onLayout={() => {
        metrics.reset();
        metrics.mark("cameraOpenStart");
      }}
    >
      <CameraView onCapture={handleCapture} />

      <SafeAreaView
        style={styles.overlay}
        edges={["top"]}
        pointerEvents="box-none"
      >
        <Text style={styles.heading}>Scanner</Text>
        <View style={styles.frameWrapper} pointerEvents="none">
          <View style={styles.scanFrame} />
          <View style={styles.messageBar}>
            <Text style={styles.messageText}>Please center your scan.</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.text,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    paddingTop: spacing.elementV,
  },
  heading: {
    ...typography.h1,
    color: colors.text,
    textAlign: "center",
    letterSpacing: 0.48,
  },
  frameWrapper: {
    alignItems: "center",
    marginTop: 30,
    gap: 40,
  },
  scanFrame: {
    width: 250,
    height: 400,
    borderWidth: 3,
    borderStyle: "dashed",
    borderColor: colors.text,
    borderRadius: spacing.radius,
  },
  messageBar: {
    width: 250,
    backgroundColor: colors.background,
    borderRadius: spacing.radius,
    paddingVertical: 12,
    paddingHorizontal: 29,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  messageText: {
    fontFamily: "Figtree_700Bold",
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.32,
    color: colors.primary,
  },
});
