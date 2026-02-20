import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing } from "../../src/theme";
import { clearAllScans, listScans } from "../../src/storage/scans";
import { ScanRecord } from "../../src/storage/types";

export default function HistoryScreen() {
  const [items, setItems] = useState<ScanRecord[]>([]);

  const refresh = useCallback(() => {
    setItems(listScans());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleClear = useCallback(() => {
    clearAllScans();
    refresh();
  }, [refresh]);

  const keyExtractor = useCallback((item: ScanRecord) => item.id, []);

  const renderItem = useCallback(({ item }: { item: ScanRecord }) => {
    const when = new Date(item.created_at).toLocaleString();
    const totalKg = (item.co2e_grams / 1000).toFixed(2);
    return (
      <View style={styles.row}>
        <Text style={styles.rowTitle}>{item.display_name ?? "Tag scan"}</Text>
        <Text style={styles.rowSubtitle}>{when}</Text>
        <Text style={styles.rowValue}>{totalKg} kgCO2e</Text>
      </View>
    );
  }, []);

  const renderSeparator = useCallback(() => <View style={styles.separator} />, []);

  const renderEmpty = useCallback(
    () => <Text style={styles.empty}>No scans yet. Start scanning!</Text>,
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Scan History</Text>
        <Pressable onPress={handleClear}>
          <Text style={styles.clearText}>Clear history</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        style={styles.listContainer}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
        ListEmptyComponent={renderEmpty}
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: spacing.screenH,
  },
  heading: {
    ...typography.h1,
    color: colors.text,
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.elementV,
  },
  clearText: {
    ...typography.link,
    color: colors.link,
    paddingTop: spacing.elementV,
  },
  list: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.elementV,
    paddingBottom: 40,
  },
  listContainer: {
    flex: 1,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius,
    backgroundColor: colors.white,
    padding: spacing.elementV,
    gap: 6,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
  },
  rowSubtitle: {
    ...typography.bodySmall,
    color: colors.disabled,
  },
  rowValue: {
    ...typography.h2,
    color: colors.primary,
  },
  separator: {
    height: spacing.elementV,
  },
  empty: {
    ...typography.body,
    color: colors.disabled,
    textAlign: "center",
    marginTop: 40,
  },
});
