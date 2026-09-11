import { StyleSheet, Text, View } from "react-native"

import { Button, Hero, Pill, Screen, SectionCard, SectionHeader } from "../components/ui"
import { palette, typography } from "../theme"

export function WelcomeScreen({ navigation }) {
  return (
    <Screen>
      <Hero
        image="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80"
        eyebrow="Chefos Mobile"
        title="A modern chef platform, now native on mobile."
        subtitle="Built for users who expect a polished product experience, with separate customer and partner flows powered by your existing backend."
      >
        <Pill label="Modern startup premium" tone="warm" />
        <Pill label="Connected to live backend APIs" tone="good" />
      </Hero>

      <SectionCard>
        <SectionHeader title="Choose your experience" subtitle="The app is structured like a polished platform product, not a generic delivery app, so each role gets a more focused workflow." />
        <View style={styles.actions}>
          <Button label="Continue as Customer" onPress={() => navigation.navigate("Auth", { role: "user" })} />
          <Button label="Chef Partner Login" variant="secondary" onPress={() => navigation.navigate("Auth", { role: "chef" })} />
        </View>
      </SectionCard>

      <View style={styles.grid}>
        <SectionCard style={styles.gridCard}>
          <Text style={typography.cardTitle}>Customer product</Text>
          <Text style={[typography.body, styles.copy]}>
            Chef discovery, weekly planning, schedule tracking, and subscription management in a cleaner, more product-led interface.
          </Text>
        </SectionCard>
        <SectionCard style={styles.gridCard}>
          <Text style={typography.cardTitle}>Partner operations</Text>
          <Text style={[typography.body, styles.copy]}>
            Availability controls, instant response workflows, service visibility, and fast operational actions for chef partners.
          </Text>
        </SectionCard>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  actions: {
    marginTop: 18,
    gap: 12,
  },
  grid: {
    gap: 16,
  },
  gridCard: {
    backgroundColor: palette.surfaceAlt,
  },
  copy: {
    marginTop: 10,
  },
})
