import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, typography, spacing } from "../src/theme";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { CO2Gauge } from "../src/components/CO2Gauge";
import { BreakdownRow } from "../src/components/BreakdownRow";
import { TagApiResponse, BREAKDOWN_LABELS, BREAKDOWN_ORDER } from "../src/types/api";
import { getScanById, toggleClosetStatus } from "../src/storage/scans";

function getFriendlyErrorMessage(code?: string, fallback?: string): string {
  if (code === "MISSING_IMAGE") {
    return "Please capture or choose an image before submitting.";
  }
  if (code === "UPSTREAM_ERROR") {
    return "The analysis service is temporarily unavailable. Please try again.";
  }
  if (code === "INTERNAL_ERROR") {
    return "Something went wrong on our side. Please try again.";
  }
  return fallback || "Unable to analyze this image right now. Please retry.";
}

export default function ResultsScreen() {
  const router = useRouter();
  const { status, data, errorCode, errorMessage, scanId } =
    useLocalSearchParams<{
      status?: string;
      data?: string;
      errorCode?: string;
      errorMessage?: string;
      scanId?: string;
    }>();

  const [isInCloset, setIsInCloset] = useState(false);

  useEffect(() => {
    if (scanId) {
      const scan = getScanById(scanId);
      if (scan) {
        setIsInCloset(scan.in_closet === 1);
      }
    }
  }, [scanId]);

  const handleToggleCloset = () => {
    if (!scanId) return;
    const next = !isInCloset;
    toggleClosetStatus(scanId, next);
    setIsInCloset(next);
  };

  const successPayload = useMemo(() => {
    if (data) {
      try {
        const parsed = JSON.parse(data) as TagApiResponse;
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  }, [data]);

  const isSuccess = status === "success" && !!successPayload;
  const emissions = successPayload?.emissions;
  const friendlyMessage = getFriendlyErrorMessage(errorCode, errorMessage);

  const breakdownRows = useMemo(() => {
    if (!emissions?.breakdown) return [];
    const bd = emissions.breakdown;
    return BREAKDOWN_ORDER.filter(
      (key) => typeof bd[key] === "number" && bd[key] > 0,
    ).map((key) => ({
      key,
      label: BREAKDOWN_LABELS[key] ?? key,
      value: bd[key],
    }));
  }, [emissions]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Results</Text>
        <Pressable style={styles.hangerButton} onPress={handleToggleCloset}>
          <MaterialCommunityIcons
            name="hanger"
            size={28}
            color={isInCloset ? colors.primary : colors.text}
          />
          <View
            style={[
              styles.plusBadge,
              isInCloset && styles.plusBadgeActive,
            ]}
          >
            <Ionicons name="add" size={14} color={isInCloset ? colors.white : colors.text} />
          </View>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isSuccess ? (
          <>
            <CO2Gauge totalKgCO2e={emissions!.total_kgco2e} />

            <Text style={styles.sectionTitle}>Carbon Emission Breakdown</Text>

            <View style={styles.breakdownList}>
              {breakdownRows.map((row) => (
                <BreakdownRow
                  key={row.key}
                  label={row.label}
                  kgValue={row.value}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>We couldn't analyze that image</Text>
            <Text style={styles.errorMessage}>{friendlyMessage}</Text>
            {errorCode ? (
              <Text style={styles.errorCode}>Error code: {errorCode}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.scanAnotherWrapper}>
          <PrimaryButton
            label="Scan Another"
            icon="leaf-outline"
            onPress={() => router.replace("/scan")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenH,
    paddingVertical: 12,
  },
  headerTitle: {
    ...typography.h1,
    color: colors.text,
    letterSpacing: 0.48,
  },
  hangerButton: {
    width: 50,
    height: 47,
    alignItems: "center",
    justifyContent: "center",
  },
  plusBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  plusBadgeActive: {
    backgroundColor: colors.primary,
  },
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.elementV * 2,
    paddingBottom: 40,
  },
  sectionTitle: {
    ...typography.subtitle1,
    color: colors.text,
    letterSpacing: 0.32,
    marginTop: 40,
  },
  breakdownList: {
    marginTop: 16,
    gap: 10,
  },
  scanAnotherWrapper: {
    marginTop: 30,
  },
  errorCard: {
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: spacing.radius,
    backgroundColor: colors.destructiveLight,
    padding: spacing.elementV,
    gap: spacing.elementV / 2,
  },
  errorTitle: {
    ...typography.h2,
    color: colors.text,
  },
  errorMessage: {
    ...typography.body,
    color: colors.text,
  },
  errorCode: {
    ...typography.bodySmall,
    color: colors.text,
  },
});
