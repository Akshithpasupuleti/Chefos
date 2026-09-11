import { useEffect, useMemo, useState } from "react"
import { Alert, ImageBackground, StyleSheet, Text, View } from "react-native"
import * as Location from "expo-location"
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons"

import { api } from "../api/client"
import { readCachedValue, writeCachedValue } from "../api/cache"
import { Button, LoadingState, Pill, Screen, SectionCard } from "../components/ui"
import { joinMeals, safeArray, titleCase } from "../utils/format"
import { palette, typography } from "../theme"

const RADIUS_KM = 5
const CHEF_LIST_CACHE_TTL_MS = 2 * 60 * 1000
const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000
const INSTANT_REQUEST_CACHE_TTL_MS = 20 * 1000

export function FindChefScreen() {
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [location, setLocation] = useState(null)
  const [locationLabel, setLocationLabel] = useState("Checking location...")
  const [chefs, setChefs] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [instantRequest, setInstantRequest] = useState(null)

  const meals = useMemo(() => safeArray(subscription?.meal_type), [subscription?.meal_type])

  const load = async (withLocation = true) => {
    setLoading(true)
    let coords = location
    try {
      const [cachedChefs, cachedSubscription, cachedInstantRequest] = await Promise.all([
        readCachedValue("chefs:list:nearby", { maxAgeMs: CHEF_LIST_CACHE_TTL_MS }),
        readCachedValue("subscription:active", { maxAgeMs: SUBSCRIPTION_CACHE_TTL_MS }),
        readCachedValue("chefs:instant:latest", { maxAgeMs: INSTANT_REQUEST_CACHE_TTL_MS }),
      ])

      if (cachedChefs) setChefs(safeArray(cachedChefs))
      if (cachedSubscription) setSubscription(cachedSubscription)
      if (cachedInstantRequest) setInstantRequest(cachedInstantRequest)
      if (cachedChefs || cachedSubscription || cachedInstantRequest) setLoading(false)

      if (withLocation && !coords) {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (permission.status === "granted") {
          const current = await Location.getCurrentPositionAsync({})
          coords = {
            lat: Number(current.coords.latitude.toFixed(6)),
            lng: Number(current.coords.longitude.toFixed(6)),
          }
          setLocation(coords)
          setLocationLabel(`Showing chefs within ${RADIUS_KM} km`)
        } else {
          setLocationLabel("Location permission denied. Showing general availability.")
        }
      }
      const params = {}
      if (coords?.lat && coords?.lng) {
        params.lat = coords.lat
        params.lng = coords.lng
        params.radius_km = RADIUS_KM
      }
      const [chefRes, subRes, latestReqRes] = await Promise.allSettled([
        api.get("chefs/", { params }),
        api.get("subscription/active/"),
        api.get("chefs/instant/request/latest/"),
      ])
      if (chefRes.status === "fulfilled") {
        const nextChefs = safeArray(chefRes.value.data)
        setChefs(nextChefs)
        await writeCachedValue("chefs:list:nearby", nextChefs)
      }
      if (subRes.status === "fulfilled") {
        setSubscription(subRes.value.data)
        await writeCachedValue("subscription:active", subRes.value.data)
      }
      if (latestReqRes.status === "fulfilled") {
        setInstantRequest(latestReqRes.value.data)
        await writeCachedValue("chefs:instant:latest", latestReqRes.value.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!instantRequest?.id || !["searching", "accepted"].includes(String(instantRequest?.status || ""))) return
    const timer = setInterval(async () => {
      try {
        const res = await api.get(`chefs/instant/request/${instantRequest.id}/`)
        setInstantRequest(res.data)
        await writeCachedValue("chefs:instant:latest", res.data)
      } catch {}
    }, 5000)
    return () => clearInterval(timer)
  }, [instantRequest?.id, instantRequest?.status])

  const assignChef = async (chefId) => {
    setBusyId(chefId)
    try {
      await api.post("chefs/assign/", { chef_id: chefId })
      Alert.alert("Chef assigned", "Your selected chef has been assigned successfully.")
    } catch (err) {
      Alert.alert("Unable to assign chef", err?.response?.data?.detail || "Please try again.")
    } finally {
      setBusyId(null)
    }
  }

  const requestInstantChef = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== "granted") {
        Alert.alert("Location required", "Instant chef requests need your location.")
        return
      }
      const current = await Location.getCurrentPositionAsync({})
      const res = await api.post("chefs/instant/request/", {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      })
      setInstantRequest(res.data)
      await writeCachedValue("chefs:instant:latest", res.data)
    } catch (err) {
      Alert.alert("Unable to request instant chef", err?.response?.data?.detail || "Please try again.")
    }
  }

  if (loading) {
    return <Screen><LoadingState label="Finding nearby chefs..." /></Screen>
  }

  return (
    <Screen>
      <ImageBackground source={{ uri: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80" }} style={styles.heroCard} imageStyle={styles.heroImage}>
        <View style={styles.heroOverlay}>
          <Text style={styles.heroEyebrow}>Chef discovery</Text>
          <Text style={styles.heroTitle}>Choose a chef who fits your taste and schedule.</Text>
          <Text style={styles.heroSubtitle}>{locationLabel}</Text>
          <View style={styles.heroMeta}>
            <Pill label={meals.length ? joinMeals(meals) : "No active meal plan"} tone="warm" />
          </View>
        </View>
      </ImageBackground>

      <SectionCard style={styles.sectionCard}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Instant chef</Text>
          <Text style={styles.sectionLink} onPress={() => load(false)}>Refresh</Text>
        </View>
        <Text style={styles.sectionSubtitle}>Request the nearest available chef for immediate service.</Text>
        <View style={styles.actions}>
          <Button label="Request instant chef" onPress={requestInstantChef} />
        </View>
        {instantRequest ? (
          <View style={styles.instantBox}>
            <View style={styles.instantHeader}>
              <View style={styles.instantIcon}>
                <Ionicons name="flash" size={18} color={palette.accent} />
              </View>
              <View>
                <Text style={styles.rowTitle}>Request #{instantRequest.id}</Text>
                <Text style={styles.rowMeta}>Status: {titleCase(instantRequest.status)}</Text>
              </View>
            </View>
            {instantRequest.status_message ? <Text style={styles.rowMeta}>{instantRequest.status_message}</Text> : null}
          </View>
        ) : null}
      </SectionCard>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Available chefs</Text>
        <Text style={styles.sectionSubtitleInline}>{chefs.length} results</Text>
      </View>
      <Text style={styles.sectionSubtitle}>Clearer cards, stronger hierarchy, and more relevant meal-oriented presentation.</Text>

      <SectionCard style={styles.listShell}>
        <View style={styles.list}>
          {chefs.length ? chefs.map((chef) => (
            <View key={chef.id} style={styles.chefCard}>
              <ImageBackground source={{ uri: "https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=1200&q=80" }} style={styles.chefImage} imageStyle={styles.chefImageInner}>
                <View style={styles.chefImageOverlay}>
                  <Pill label={chef.is_available ? "Available" : "Busy"} tone={chef.is_available ? "good" : "warm"} />
                </View>
              </ImageBackground>

              <View style={styles.chefHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{chef.name}</Text>
                  <Text style={styles.rowMeta}>{chef.speciality}</Text>
                </View>
                <View style={styles.ratingPill}>
                  <Ionicons name="star" size={13} color={palette.accent} />
                  <Text style={styles.ratingText}>{chef.rating || 4.5}</Text>
                </View>
              </View>

              <View style={styles.metaChips}>
                {chef.distance_km ? <Pill label={`${chef.distance_km} km away`} tone="neutral" /> : null}
                <Pill label="Home-style cooking" tone="neutral" />
              </View>

              <View style={styles.chefFooter}>
                <View style={styles.deliveryHint}>
                  <MaterialCommunityIcons name="chef-hat" size={16} color={palette.primary} />
                  <Text style={styles.deliveryHintText}>Recommended for daily meals</Text>
                </View>
                <Button label={busyId === chef.id ? "Assigning..." : "Assign chef"} onPress={() => assignChef(chef.id)} loading={busyId === chef.id} />
              </View>
            </View>
          )) : <Text style={typography.body}>No chefs available right now.</Text>}
        </View>
      </SectionCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heroCard: {
    minHeight: 240,
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
    maxWidth: 250,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.88)",
  },
  heroMeta: {
    marginTop: 14,
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
    fontWeight: "800",
    color: palette.text,
  },
  sectionLink: {
    fontSize: 13,
    color: palette.primary,
    fontWeight: "800",
  },
  sectionSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: palette.muted,
  },
  sectionSubtitleInline: {
    fontSize: 12,
    color: palette.muted,
    fontWeight: "700",
  },
  actions: {
    marginTop: 14,
    gap: 12,
  },
  instantBox: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#fbf7ef",
    borderWidth: 1,
    borderColor: palette.border,
    gap: 6,
  },
  instantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  instantIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#fff1de",
    alignItems: "center",
    justifyContent: "center",
  },
  listShell: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  list: {
    gap: 14,
  },
  chefCard: {
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 14,
  },
  chefImage: {
    height: 158,
    borderRadius: 20,
    overflow: "hidden",
  },
  chefImageInner: {
    borderRadius: 20,
  },
  chefImageOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  chefHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ea",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#f2d6aa",
  },
  ratingText: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 12,
  },
  metaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chefFooter: {
    gap: 12,
  },
  deliveryHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deliveryHintText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  rowMeta: {
    fontSize: 13,
    color: palette.muted,
  },
})
