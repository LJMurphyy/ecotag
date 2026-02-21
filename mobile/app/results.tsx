import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography, spacing } from "../src/theme";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { CO2Gauge } from "../src/components/CO2Gauge";
import { BreakdownRow } from "../src/components/BreakdownRow";
import { TagApiResponse, BREAKDOWN_LABELS, BREAKDOWN_ORDER } from "../src/types/api";

function formatCareValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

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
  const { status, data, errorCode, errorMessage } = useLocalSearchParams<{
    status?: string;
    data?: string;
    errorCode?: string;
    errorMessage?: string;
  }>();

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
  const parsed = successPayload?.parsed;
  const emissions = successPayload?.emissions;
  const materialSummary = parsed?.materials
    ?.map((m) => `${m.pct}% ${m.fiber}`)
    .join(", ");
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
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Results</Text>
        <Pressable>
          <Ionicons name="bookmark-outline" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isSuccess ? (
          <>
            <CO2Gauge totalKgCO2e={emissions!.total_kgco2e} />

            <View style={styles.card}>
              <Text style={styles.successTitle}>Emissions Breakdown</Text>
              {breakdownRows.map((row) => (
                <BreakdownRow
                  key={row.key}
                  label={row.label}
                  kgValue={row.value}
                />
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.successTitle}>Tag Details</Text>
              {parsed?.country ? (
                <Text style={styles.rowLabel}>
                  Country: <Text style={styles.rowValue}>{parsed.country}</Text>
                </Text>
              ) : null}
              <Text style={styles.rowLabel}>
                Materials:{" "}
                <Text style={styles.rowValue}>{materialSummary || "Not detected"}</Text>
              </Text>
              {[
                { label: "Washing", value: formatCareValue(parsed?.care.washing) },
                { label: "Drying", value: formatCareValue(parsed?.care.drying) },
                { label: "Ironing", value: formatCareValue(parsed?.care.ironing) },
                { label: "Dry cleaning", value: formatCareValue(parsed?.care.dry_cleaning) },
              ]
                .filter((row) => row.value !== null)
                .map((row) => (
                  <Text key={row.label} style={styles.rowLabel}>
                    {row.label}: <Text style={styles.rowValue}>{row.value}</Text>
                  </Text>
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

        <PrimaryButton
          label="Scan Another"
          icon="leaf-outline"
          onPress={() => router.replace("/scan")}
        />
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
    ...typography.h2,
    color: colors.text,
  },
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.elementV,
    paddingBottom: 40,
    gap: spacing.elementV * 2,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius,
    backgroundColor: colors.white,
    padding: spacing.elementV,
    gap: 10,
  },
  successTitle: {
    ...typography.h2,
    color: colors.text,
  },
  rowLabel: {
    ...typography.bodySmall,
    color: colors.disabled,
  },
  rowValue: {
    ...typography.body,
    color: colors.text,
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
