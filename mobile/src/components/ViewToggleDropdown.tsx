import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography, spacing } from "../theme";

export type ClosetView = "closet" | "recent";

const VIEW_LABELS: Record<ClosetView, string> = {
  closet: "Your Closet",
  recent: "Recent Scans",
};

interface Props {
  currentView: ClosetView;
  onChangeView: (view: ClosetView) => void;
}

export function ViewToggleDropdown({
  currentView,
  onChangeView,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.title}>{VIEW_LABELS[currentView]}</Text>
        <Ionicons name="chevron-down" size={20} color={colors.text} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.menu}>
            {(["closet", "recent"] as ClosetView[]).map((view) => (
              <Pressable
                key={view}
                style={[
                  styles.option,
                  currentView === view && styles.optionActive,
                ]}
                onPress={() => {
                  onChangeView(view);
                  setVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    currentView === view && styles.optionTextActive,
                  ]}
                >
                  {VIEW_LABELS[view]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  title: {
    ...typography.h1,
    color: colors.text,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-start",
    paddingTop: 120,
    paddingHorizontal: spacing.screenH,
  },
  menu: {
    backgroundColor: colors.white,
    borderRadius: spacing.radius,
    padding: 8,
    gap: 4,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: spacing.radius - 2,
  },
  optionActive: {
    backgroundColor: colors.background,
  },
  optionText: {
    ...typography.subtitle1,
    color: colors.text,
  },
  optionTextActive: {
    color: colors.primary,
  },
});
