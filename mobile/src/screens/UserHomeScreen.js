import { useEffect, useMemo, useState } from "react"
import { ImageBackground, StyleSheet, Text, View } from "react-native"
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"
import * as Location from "expo-location"

import { useAuth } from "../auth/AuthContext"
import { api } from "../api/client"
import { readCachedValue, writeCachedValue } from "../api/cache"
import { Button, LoadingState, Pill, Screen, SectionCard } from "../components/ui"
import { inferPlanCycle, joinMeals, safeArray } from "../utils/format"
import { palette, typography } from "../theme"

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000
const TODAY_CACHE_TTL_MS = 30 * 1000
const LOCATION_CACHE_TTL_MS = 30 * 60 * 1000

export function UserHomeScreen({ navigation }) {
  const { username, logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignedChef, setAssignedChef] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [today, setToday] = useState(null)
  const [addressTitle, setAddressTitle] = useState("Fetching location")
  const [addressSubtitle, setAddressSubtitle] = useState("Allow location to personalize delivery")

  const load = async (soft = false) => {
    if (!soft) setLoading(true)
    try {
      const [cachedChef, cachedSubscription, cachedToday] = await Promise.all([
        readCachedValue("chefs:assigned", { maxAgeMs: DASHBOARD_CACHE_TTL_MS }),
        readCachedValue("subscription:active", { maxAgeMs: DASHBOARD_CACHE_TTL_MS }),
        readCachedValue("menu:today", { maxAgeMs: TODAY_CACHE_TTL_MS }),
      ])

      if (cachedChef) setAssignedChef(cachedChef?.chef || null)
      if (cachedSubscription) setSubscription(cachedSubscription)
      if (cachedToday) setToday(cachedToday)
      if (cachedChef || cachedSubscription || cachedToday) setLoading(false)

      const [chefRes, subRes, todayRes] = await Promise.allSettled([
        api.get("chefs/assigned/"),
        api.get("subscription/active/"),
        api.get("menu/today/"),
      ])
      if (chefRes.status === "fulfilled") {
        setAssignedChef(chefRes.value.data.chef)
        await writeCachedValue("chefs:assigned", chefRes.value.data)
      }
      if (subRes.status === "fulfilled") {
        setSubscription(subRes.value.data)
        await writeCachedValue("subscription:active", subRes.value.data)
      }
      if (todayRes.status === "fulfilled") {
        setToday(todayRes.value.data)
        await writeCachedValue("menu:today", todayRes.value.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    let cancelled = false

    const setResolvedAddress = async () => {
      try {
        const cachedLocation = await readCachedValue("location:current-address", { maxAgeMs: LOCATION_CACHE_TTL_MS })
        if (cachedLocation && !cancelled) {
          setAddressTitle(cachedLocation.title || "Current location")
          setAddressSubtitle(cachedLocation.subtitle || "Using your live location")
        }

        const permission = await Location.requestForegroundPermissionsAsync()
        if (permission.status !== "granted") {
          if (!cancelled) {
            setAddressTitle("Location unavailable")
            setAddressSubtitle("Enable location access to show your current area")
          }
          return
        }

        const current = await Location.getCurrentPositionAsync({})
        const latitude = Number(current.coords.latitude)
        const longitude = Number(current.coords.longitude)

        let primaryLabel = ""
        let secondaryLabel = ""

        try {
          const url =
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
          const response = await fetch(url, {
            headers: {
              Accept: "application/json",
            },
          })
          const payload = await response.json()
          const address = payload?.address || {}
          primaryLabel = String(
            address.suburb ||
            address.neighbourhood ||
            address.quarter ||
            address.village ||
            address.town ||
            address.city ||
            ""
          ).trim()
          secondaryLabel = [
            address.city || address.county || address.state_district,
            address.state,
          ]
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(", ")
        } catch {
          primaryLabel = ""
          secondaryLabel = ""
        }

        if (!primaryLabel) {
          const places = await Location.reverseGeocodeAsync({ latitude, longitude })
          const first = Array.isArray(places) ? places[0] : null
          primaryLabel = String(first?.district || first?.subregion || first?.city || "Current location").trim()
          secondaryLabel = [first?.city, first?.region]
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(", ")
        }

        if (!cancelled) {
          setAddressTitle(primaryLabel || "Current location")
          setAddressSubtitle(secondaryLabel || "Using your live location")
        }
        await writeCachedValue("location:current-address", {
          title: primaryLabel || "Current location",
          subtitle: secondaryLabel || "Using your live location",
        })
      } catch {
        if (!cancelled) {
          setAddressTitle("Current location")
          setAddressSubtitle("Using your live location")
        }
      }
    }

    setResolvedAddress()

    return () => {
      cancelled = true
    }
  }, [])

  const serviceOtps = safeArray(today?.service_otps)
  const mealChips = useMemo(() => {
    const selected = safeArray(today?.selected_meals)
    return selected.length ? selected : safeArray(subscription?.meal_type)
  }, [today?.selected_meals, subscription?.meal_type])

  const featuredCards = [
    {
      title: "Chef discovery",
      subtitle: assignedChef ? `${assignedChef.name} is already assigned` : "Browse nearby chefs and assign in minutes",
      image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80",
      action: "Explore",
      route: "Discover",
    },
    {
      title: "Weekly plan",
      subtitle: subscription ? joinMeals(subscription.meal_type) : "Build a weekly plan around your lifestyle",
      image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80",
      action: "Open menu",
      route: "Menu",
    },
  ]

  if (loading) {
    return <Screen><LoadingState label="Loading your mobile dashboard..." /></Screen>
  }

  return (
    <Screen contentContainerStyle={styles.content} scroll>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.deliveryLabel}>Deliver to</Text>
          <View style={styles.deliveryRow}>
            <Text style={styles.username} numberOfLines={1}>{addressTitle}</Text>
            <Ionicons name="chevron-down" size={16} color={palette.text} />
          </View>
          <Text style={styles.deliverySubtitle} numberOfLines={1}>{addressSubtitle}</Text>
        </View>
        <View style={styles.locationBadge}>
          <Ionicons name="person-circle-outline" size={18} color={palette.primary} />
        </View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={palette.muted} />
        <Text style={styles.searchText}>Search chefs, cuisines, or meal plans</Text>
      </View>

      <ImageBackground source={{ uri: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80" }} style={styles.heroCard} imageStyle={styles.heroImage}>
        <View style={styles.heroOverlay}>
          <Text style={styles.heroEyebrow}>Chefos Premium</Text>
          <Text style={styles.heroTitle}>Home-style meals with your own trusted chef.</Text>
          <Text style={styles.heroSubtitle}>Discover chefs, lock your weekly plan, and stay on top of every meal from one app.</Text>
          <View style={styles.heroButtons}>
            <Button label="Find chefs" onPress={() => navigation.navigate("Discover")} style={styles.heroButton} />
            <Button label="See menu" variant="outline" onPress={() => navigation.navigate("Menu")} style={styles.heroButtonAlt} />
          </View>
        </View>
      </ImageBackground>

      <View style={styles.kpiRow}>
        <MetricChip icon="account-tie" label="Assigned Chef" value={assignedChef?.name || "Pending"} />
        <MetricChip icon="silverware-fork-knife" label="Meal Plan" value={subscription ? joinMeals(subscription.meal_type) : "Inactive"} />
      </View>

      <SectionCard style={styles.sectionCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Quick picks</Text>
          <Text style={styles.sectionLink} onPress={() => navigation.navigate("Discover")}>See all</Text>
        </View>
        <View style={styles.quickGrid}>
          <QuickAction icon="search" label="Find Chef" onPress={() => navigation.navigate("Discover")} />
          <QuickAction icon="restaurant" label="Weekly Menu" onPress={() => navigation.navigate("Menu")} />
          <QuickAction icon="receipt" label="Today Plan" onPress={() => navigation.navigate("Today")} />
          <QuickAction icon="wallet" label="Subscription" onPress={() => navigation.navigate("Subscription")} />
        </View>
      </SectionCard>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Featured for you</Text>
        <Text style={styles.sectionLink} onPress={() => navigation.navigate("Menu")}>Browse</Text>
      </View>
      <View style={styles.featuredStack}>
        {featuredCards.map((item) => (
          <ImageBackground key={item.title} source={{ uri: item.image }} style={styles.featuredCard} imageStyle={styles.featuredImage}>
            <View style={styles.featuredOverlay}>
              <Text style={styles.featuredTitle}>{item.title}</Text>
              <Text style={styles.featuredSubtitle}>{item.subtitle}</Text>
              <Button label={item.action} onPress={() => navigation.navigate(item.route)} style={styles.featuredButton} />
            </View>
          </ImageBackground>
        ))}
      </View>

      <SectionCard style={styles.sectionCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Today’s status</Text>
          <Text style={styles.sectionLink} onPress={() => load(true)}>Refresh</Text>
        </View>
        <View style={styles.chips}>
          {mealChips.length ? mealChips.map((meal) => <Pill key={meal} label={meal} tone="neutral" />) : <Text style={typography.body}>No meals selected yet.</Text>}
        </View>
        <View style={styles.todaySummary}>
          <Text style={styles.todayDish}>{today?.upcoming_order?.dish || "No upcoming meal scheduled"}</Text>
          <Text style={styles.todayMeta}>{subscription ? `${inferPlanCycle(subscription)} plan active` : "Set up your first plan to unlock scheduling"}</Text>
        </View>
        {serviceOtps.length ? serviceOtps.map((item) => (
          <View key={item.service_session_id || `${item.meal}-${item.status}`} style={styles.liveRow}>
            <View style={styles.liveIcon}>
              <MaterialCommunityIcons name="chef-hat" size={18} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.meal || "Service"}</Text>
              <Text style={styles.rowMeta}>
                {item.status} {item.start_otp ? `• Start OTP ${item.start_otp}` : ""} {item.end_otp ? `• End OTP ${item.end_otp}` : ""}
              </Text>
            </View>
          </View>
        )) : null}
      </SectionCard>

      <SectionCard style={styles.logoutCard}>
        <Button label="Logout" variant="outline" onPress={logout} />
      </SectionCard>
    </Screen>
  )
}

function QuickAction({ icon, label, onPress }) {
  return (
    <View style={styles.quickCard}>
      <View style={styles.quickIconWrap}>
        <Ionicons name={icon} size={20} color={palette.primary} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text onPress={onPress} style={styles.quickLink}>Open</Text>
    </View>
  )
}

function MetricChip({ icon, label, value }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIconWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  deliveryLabel: {
    fontSize: 13,
    color: palette.muted,
    fontWeight: "700",
  },
  deliveryRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 220,
  },
  username: {
    fontSize: 24,
    lineHeight: 28,
    color: palette.text,
    fontWeight: "800",
  },
  deliverySubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: palette.muted,
    maxWidth: 240,
  },
  locationBadge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    width: 42,
    height: 42,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  searchText: {
    color: palette.muted,
    fontSize: 14,
  },
  heroCard: {
    minHeight: 250,
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
    backgroundColor: "rgba(14,29,22,0.34)",
  },
  heroEyebrow: {
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 30,
    lineHeight: 34,
    color: palette.white,
    fontWeight: "900",
    maxWidth: 260,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.88)",
    maxWidth: 290,
  },
  heroButtons: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  heroButton: {
    flex: 1,
  },
  heroButtonAlt: {
    flex: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf7f2",
  },
  metricLabel: {
    fontSize: 12,
    color: palette.muted,
    fontWeight: "700",
  },
  metricValue: {
    marginTop: 4,
    fontSize: 14,
    color: palette.text,
    fontWeight: "800",
  },
  sectionCard: {
    paddingTop: 18,
    paddingBottom: 18,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  quickGrid: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  quickCard: {
    width: "47%",
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    padding: 14,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#edf7f2",
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "800",
    color: palette.text,
  },
  quickLink: {
    marginTop: 8,
    fontSize: 12,
    color: palette.primary,
    fontWeight: "800",
  },
  featuredStack: {
    gap: 14,
  },
  featuredCard: {
    minHeight: 170,
    borderRadius: 24,
    overflow: "hidden",
  },
  featuredImage: {
    borderRadius: 24,
  },
  featuredOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 18,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  featuredTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    color: palette.white,
  },
  featuredSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(255,255,255,0.9)",
    maxWidth: 250,
  },
  featuredButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  chips: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  todaySummary: {
    marginTop: 16,
    marginBottom: 8,
  },
  todayDish: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: palette.text,
  },
  todayMeta: {
    marginTop: 6,
    fontSize: 13,
    color: palette.muted,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  liveIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf7f2",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.text,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 13,
    color: palette.muted,
  },
  logoutCard: {
    marginBottom: 8,
  },
})
