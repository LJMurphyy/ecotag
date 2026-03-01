import { Redirect } from "expo-router";
import { hasSeenOnboarding } from "../src/storage/onboarding";

export default function Index() {
  // const seen = hasSeenOnboarding();
  // return <Redirect href={seen ? "/(tabs)" : "/onboarding"} />;
  return <Redirect href="/onboarding" />;
}
