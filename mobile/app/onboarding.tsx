import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { ProgressBar } from "../src/components/ProgressBar";
import { colors, typography, spacing } from "../src/theme";
import { markOnboardingComplete } from "../src/storage/onboarding";

const SLIDES = [
  {
    image: require("../assets/images/onboarding/onboarding_step1.png"),
    step: "Step 1",
    title: "Scan Garments",
    description:
      "Point your camera at any clothing tag, or import a photo from your library. We'll scan the label and calculate the garment's carbon footprint instantly.",
  },
  {
    image: require("../assets/images/onboarding/onboarding_step2.png"),
    step: "Step 2",
    title: "View Results",
    description:
      "See a detailed breakdown of each garment's carbon footprint. Track your history, compare items, and build a wardrobe you feel good about.",
  },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const progress = (step + 1) / SLIDES.length;

  function handleNext() {
    if (step < SLIDES.length - 1) {
      setStep(step + 1);
    } else {
      markOnboardingComplete();
      router.replace("/splash");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.heroContainer}>
        <View style={styles.contentContainer}>
          <Image
            source={slide.image}
            style={styles.image}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.stepLabel}>{slide.step}</Text>
            <Text style={styles.title}>{slide.title}</Text>
          </View>
          <Text style={styles.description}>{slide.description}</Text>
        </View>
        <View style={styles.footer}>
          <ProgressBar progress={progress} />
          <View style={styles.buttonWrapper}>
            <PrimaryButton
              style={styles.footerButton}
              label={step < SLIDES.length - 1 ? "Next" : "Done"}
              onPress={handleNext}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 48,
    paddingTop: 24,
  },
  heroContainer: {
    flex: 1,
    justifyContent: "space-evenly",
  },
  contentContainer: {
    flex: 1,
    width: "100%",
    gap: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: 190,
    height: 190,
    marginBottom: spacing.elementV,
  },
  stepLabel: {
    fontFamily: "Figtree_400Regular",
    color: colors.text,
    textAlign: "center",
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: "center",
  },
  description: {
    fontFamily: "Figtree_400Regular",
    fontSize: 14,
    fontStyle: "normal",
    fontWeight: "400",
    lineHeight: 17.5,
    letterSpacing: 0.28,
    color: "#000",
    textAlign: "center",
    width: 190,
  },
  footer: {
    gap: 30,
    alignItems: "center",
    // width: "100%",
  },
  buttonWrapper: {
    alignItems: "center",
  },
  footerButton: {
    width: 200,
  },
});
