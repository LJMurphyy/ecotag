import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing } from "../../src/theme";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { InfoCard } from "../../src/components/InfoCard";
import { listScans } from "../../src/storage/scans";
import { ScanRecord } from "../../src/storage/types";

export default function HomeScreen() {
  const router = useRouter();
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      setRecentScans(listScans(2));
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Ready to start scanning?</Text>

        <PrimaryButton
          label="Scan Garment"
          icon="leaf-outline"
          onPress={() => router.push("/scan")}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Scans</Text>
          <Text
            style={styles.viewAll}
            onPress={() => router.push("/history")}
          >
            View All
          </Text>
        </View>

        {recentScans.length === 0 ? (
          <Text style={styles.emptyText}>No recent scans</Text>
        ) : (
          recentScans.map((scan) => {
            const when = new Date(scan.created_at).toLocaleString();
            const totalKg = (scan.co2e_grams / 1000).toFixed(2);
            return (
              <Pressable
                key={scan.id}
                style={styles.scanCard}
                onPress={() => {
                  if (scan.result_json && scan.success === 1) {
                    router.push({
                      pathname: "/results",
                      params: { status: "success", data: scan.result_json },
                    });
                  }
                }}
              >
                <Text style={styles.scanName}>
                  {scan.display_name ?? "Tag scan"}
                </Text>
                <Text style={styles.scanDate}>{when}</Text>
                <Text style={styles.scanValue}>{totalKg} kgCO2e</Text>
              </Pressable>
            );
          })
        )}

        <InfoCard title="About EcoTag" />

        <Text style={styles.footer}>
          Built with love for Humanity.{"\n"}The Benevolent Bandwidth Foundation.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.elementV,
    paddingBottom: 40,
    gap: spacing.elementV,
  },
  heading: {
    ...typography.h1,
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.elementV,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.text,
  },
  viewAll: {
    ...typography.link,
    color: colors.link,
  },
  emptyText: {
    ...typography.body,
    color: colors.disabled,
    textAlign: "center",
    marginTop: 12,
  },
  scanCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius,
    backgroundColor: colors.white,
    padding: spacing.elementV,
    gap: 6,
  },
  scanName: {
    ...typography.body,
    color: colors.text,
  },
  scanDate: {
    ...typography.bodySmall,
    color: colors.disabled,
  },
  scanValue: {
    ...typography.h2,
    color: colors.primary,
  },
  footer: {
    ...typography.bodySmall,
    color: colors.disabled,
    textAlign: "center",
    marginTop: spacing.elementV,
  },
});
