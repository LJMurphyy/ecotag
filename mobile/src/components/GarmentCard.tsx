import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography, spacing } from "../theme";

interface Props {
  name: string;
  type: string;
  score: number;
  description: string;
  timestamp: string;
  onPress?: () => void;
  editMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function GarmentCard({
  name,
  type,
  score,
  description,
  timestamp,
  onPress,
  editMode,
  selected,
  onToggleSelect,
}: Props) {
  const handlePress = editMode ? onToggleSelect : onPress;

  return (
    <Pressable
      style={[styles.card, editMode && styles.cardDimmed]}
      onPress={handlePress}
    >
      {editMode && (
        <View
          style={[
            styles.checkbox,
            selected && styles.checkboxSelected,
          ]}
        >
          {selected && (
            <Ionicons name="checkmark" size={18} color={colors.white} />
          )}
        </View>
      )}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, editMode && styles.textDimmed]}>
            {name}
          </Text>
          <View style={styles.co2Badge}>
            <Text style={styles.co2Text}>{score.toFixed(1)} kg</Text>
          </View>
        </View>
        <Text style={[styles.type, editMode && styles.textDimmed]}>{type}</Text>
      </View>
      <Text style={[styles.description, editMode && styles.textDimmed]}>
        {description}
      </Text>
      <Text style={[styles.timestamp, editMode && styles.textDimmed]}>
        {timestamp}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: spacing.radius,
    borderWidth: spacing.strokeWidth,
    borderColor: colors.primary,
    padding: 14,
    gap: 6,
  },
  cardDimmed: {
    opacity: 0.75,
  },
  checkbox: {
    position: "absolute",
    top: 8,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
  },
  header: {
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 28,
  },
  name: {
    ...typography.subtitle1,
    color: colors.text,
    flex: 1,
  },
  co2Badge: {
    backgroundColor: colors.primaryMid,
    borderRadius: spacing.radius,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  co2Text: {
    ...typography.button,
    color: colors.white,
  },
  type: {
    ...typography.bodySmall,
    color: colors.disabled,
    textTransform: "capitalize",
  },
  description: {
    ...typography.body,
    color: colors.text,
  },
  timestamp: {
    ...typography.bodySmall,
    color: colors.disabled,
  },
  textDimmed: {
    opacity: 0.5,
  },
});
