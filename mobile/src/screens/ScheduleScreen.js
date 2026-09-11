import { useEffect, useMemo, useState } from "react"
import { ImageBackground, StyleSheet, Text, View } from "react-native"
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"

import { api } from "../api/client"
import { readCachedValue, writeCachedValue } from "../api/cache"
import { LoadingState, Pill, Screen, SectionCard } from "../components/ui"
import { titleCase } from "../utils/format"
import { palette, typography } from "../theme"

const TODAY_CACHE_TTL_MS = 20 * 1000

export function ScheduleScreen() {
  const [loading, setLoading] = useState(true)
  const [today, setToday] = useState(null)

  const load = async (soft = false) => {
    if (!soft) setLoading(true)
    try {
      const cachedToday = await readCachedValue("menu:today", { maxAgeMs: TODAY_CACHE_TTL_MS })
      if (cachedToday) {
        setToday(cachedToday)
        setLoading(false)
      }

      const res = await api.get("menu/today/")
      setToday(res.data)
      await writeCachedValue("menu:today", res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), 10000)
    return () => clearInterval(timer)
  }, [])

  const mealRows = useMemo(() => {
    if (!today) return []
    return ["breakfast", "lunch", "dinner"]
      .map((key) => ({
        key,
        dish: today[key],
        phase: today?.time_context?.meal_phase?.[key],
      }))
      .filter((item) => item.dish)
  }, [today])

  const serviceOtps = Array.isArray(today?.service_otps) ? today.service_otps : []
  const heroImage =
    today?.menu_image_url ||
    "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1200&q=80"

  if (loading) {
    return <Screen><LoadingState label="Loading today’s schedule..." /></Screen>
  }

  return (
    <Screen>
      <ImageBackground source={{ uri: heroImage }} style={styles.heroCard} imageStyle={styles.heroImage}>
        <View style={styles.heroOverlay}>
          <Text style={styles.heroEyebrow}>Today</Text>
          <Text style={styles.heroTitle}>Track every meal planned for today.</Text>
          <Text style={styles.heroSubtitle}>A clean daily timeline for upcoming meals, active service status, and OTP flow.</Text>
          <View style={styles.heroChips}>
            <Pill label={`Current slot: ${titleCase(today?.time_context?.current_slot || "none")}`} tone="warm" />
            {today?.upcoming_order?.meal ? <Pill label={`Next: ${titleCase(today.upcoming_order.meal)}`} tone="good" /> : null}
          </View>
        </View>
      </ImageBackground>

      <SectionCard style={styles.sectionCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>What’s next</Text>
          <Text style={styles.sectionLink} onPress={() => load(true)}>Refresh</Text>
        </View>
        {today?.upcoming_order ? (
          <View style={styles.upcomingCard}>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineIcon}>
                <Ionicons name="time" size={18} color={palette.accent} />
              </View>
              <View style={styles.headerContent}>
                <Text style={styles.cardTitle}>{titleCase(today.upcoming_order.meal)}</Text>
                <Text style={styles.cardMeta}>{today.upcoming_order.time || "Today"}</Text>
              </View>
            </View>
            <Text style={styles.cardBody}>{today.upcoming_order.dish || "Menu is being prepared."}</Text>
          </View>
        ) : (
          <Text style={typography.body}>No upcoming order right now.</Text>
        )}
      </SectionCard>

      <SectionCard style={styles.sectionCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Today’s meals</Text>
          <Text style={styles.sectionSubtitle}>{mealRows.length} planned</Text>
        </View>
        <View style={styles.stack}>
          {mealRows.length ? mealRows.map((meal) => (
            <View key={meal.key} style={styles.mealCard}>
              <View style={styles.inlineHeader}>
                <View style={styles.mealIcon}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={palette.primary} />
                </View>
                <View style={styles.headerContent}>
                  <Text style={styles.cardTitle}>{titleCase(meal.key)}</Text>
                  <Text style={styles.cardMeta}>{titleCase(meal.phase || "scheduled")}</Text>
                </View>
              </View>
              <Text style={styles.cardBody}>{meal.dish}</Text>
            </View>
          )) : <Text style={typography.body}>No meals scheduled for today.</Text>}
        </View>
      </SectionCard>

      <SectionCard style={styles.sectionCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Service OTP</Text>
          <Text style={styles.sectionSubtitle}>{serviceOtps.length} active</Text>
        </View>
        <View style={styles.stack}>
          {serviceOtps.length ? serviceOtps.map((session) => (
            <View key={session.service_session_id || `${session.meal}-${session.status}`} style={styles.mealCard}>
              <View style={styles.inlineHeader}>
                <View style={styles.mealIcon}>
                  <MaterialCommunityIcons name="chef-hat" size={18} color={palette.primary} />
                </View>
                <View style={styles.headerContent}>
                  <Text style={styles.cardTitle}>{titleCase(session.meal || "service")}</Text>
                  <Text style={styles.cardMeta}>Status: {titleCase(session.status)}</Text>
                </View>
              </View>
              {session.start_otp ? <Text style={styles.otpLine}>Start OTP: {session.start_otp}</Text> : null}
              {session.end_otp ? <Text style={styles.otpLine}>End OTP: {session.end_otp}</Text> : null}
              {!session.start_otp && !session.end_otp ? <Text style={styles.cardBody}>Waiting for OTP updates.</Text> : null}
            </View>
          )) : <Text style={typography.body}>No active service sessions.</Text>}
        </View>
      </SectionCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heroCard: {
    minHeight: 230,
    borderRadius: 28,
    overflow: "hidden",
  },
  heroImage: {
    borderRadius: 28,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 22,
    backgroundColor: "rgba(16,38,28,0.36)",
  },
  heroEyebrow: {
    fontSize: 12,
    color: "rgba(255,255,255,0.76)",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 29,
    lineHeight: 33,
    fontWeight: "900",
    color: palette.white,
    maxWidth: 260,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.88)",
    maxWidth: 290,
  },
  heroChips: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sectionCard: {
    paddingTop: 18,
    paddingBottom: 18,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    color: palette.text,
    fontWeight: "800",
  },
  sectionLink: {
    fontSize: 13,
    color: palette.primary,
    fontWeight: "800",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: palette.muted,
    fontWeight: "700",
  },
  upcomingCard: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fbf7ef",
    padding: 16,
    gap: 12,
  },
  stack: {
    marginTop: 16,
    gap: 14,
  },
  mealCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
    padding: 16,
    gap: 12,
  },
  inlineHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  inlineIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff1de",
  },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf7f2",
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.text,
    textAlign: "left",
    flexShrink: 1,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
    textAlign: "left",
    flexShrink: 1,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.text,
    textAlign: "left",
    flexShrink: 1,
  },
  otpLine: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.primaryDark,
    fontWeight: "800",
    textAlign: "left",
    flexShrink: 1,
  },
})
