import { useEffect, useState } from "react"
import { Alert, StyleSheet, Text, View } from "react-native"
import * as Location from "expo-location"

import { useAuth } from "../auth/AuthContext"
import { api } from "../api/client"
import { readCachedValue, writeCachedValue } from "../api/cache"
import { AppBadge, Button, Hero, LoadingState, Pill, Screen, SectionCard, SectionHeader, Stat } from "../components/ui"
import { safeArray, titleCase } from "../utils/format"
import { palette, typography } from "../theme"

const CHEF_HOME_CACHE_TTL_MS = 20 * 1000

export function ChefHomeScreen() {
  const { logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState("")

  const load = async (soft = false) => {
    if (!soft) setLoading(true)
    try {
      const cached = await readCachedValue("chefs:partner:me", { maxAgeMs: CHEF_HOME_CACHE_TTL_MS })
      if (cached) {
        setData(cached)
        setLoading(false)
      }

      const res = await api.get("chefs/partner/me/")
      setData(res.data)
      await writeCachedValue("chefs:partner:me", res.data)
    } catch (err) {
      Alert.alert("Unable to load chef dashboard", err?.response?.data?.detail || "Please login again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), 20000)
    return () => clearInterval(timer)
  }, [])

  const toggleAvailability = async () => {
    const next = !data?.partner_profile?.chef?.is_available
    setBusy("availability")
    try {
      await api.post("chefs/partner/availability/", { is_available: next })
      await load(true)
    } catch (err) {
      Alert.alert("Unable to update availability", err?.response?.data?.detail || "Please try again.")
    } finally {
      setBusy("")
    }
  }

  const syncLocation = async () => {
    setBusy("location")
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== "granted") {
        Alert.alert("Permission needed", "Location permission is required to update chef coordinates.")
        return
      }
      const current = await Location.getCurrentPositionAsync({})
      await api.post("chefs/partner/location/", {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      })
      await load(true)
    } catch (err) {
      Alert.alert("Unable to update location", err?.response?.data?.detail || "Please try again.")
    } finally {
      setBusy("")
    }
  }

  const respondToOffer = async (requestId, action) => {
    setBusy(`${requestId}:${action}`)
    try {
      await api.post("chefs/partner/instant/respond/", { request_id: requestId, action })
      await load(true)
    } catch (err) {
      Alert.alert("Unable to update request", err?.response?.data?.detail || "Please try again.")
    } finally {
      setBusy("")
    }
  }

  if (loading) {
    return <Screen><LoadingState label="Loading chef workspace..." /></Screen>
  }

  const chef = data?.partner_profile?.chef
  const pendingRequests = safeArray(data?.pending_instant_offers)
  const activeSessions = safeArray(data?.service_sessions)

  return (
    <Screen>
      <Hero
        image="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80"
        eyebrow="Chef Partner"
        title={chef?.name ? `${chef.name}, your partner app is ready.` : "Chef partner app"}
        subtitle="A dedicated operational app for live requests, availability, and service session management."
      >
        <AppBadge label="Partner app" />
        <Pill label={chef?.is_available ? "Available for bookings" : "Currently unavailable"} tone={chef?.is_available ? "good" : "warm"} />
        <Pill label={chef?.speciality || "Speciality pending"} tone="neutral" />
      </Hero>

      <SectionCard>
        <SectionHeader eyebrow="Status" title="Operational snapshot" />
        <View style={styles.stats}>
          <Stat label="Availability" value={chef?.is_available ? "Open" : "Closed"} />
          <Stat label="Instant requests" value={String(pendingRequests.length)} />
          <Stat label="Active sessions" value={String(activeSessions.length)} />
        </View>
        <View style={styles.actions}>
          <Button label={busy === "availability" ? "Updating..." : chef?.is_available ? "Go unavailable" : "Go available"} onPress={toggleAvailability} loading={busy === "availability"} />
          <Button label={busy === "location" ? "Syncing..." : "Update my location"} variant="outline" onPress={syncLocation} loading={busy === "location"} />
        </View>
      </SectionCard>

      <SectionCard>
        <SectionHeader eyebrow="Instant flow" title="Pending instant chef requests" />
        <View style={styles.stack}>
          {pendingRequests.length ? pendingRequests.map((request) => (
            <View key={request.request_id} style={styles.requestCard}>
              <Text style={styles.requestTitle}>Request #{request.request_id}</Text>
              <Text style={styles.requestMeta}>Customer: {request.username}</Text>
              <Text style={styles.requestMeta}>Distance: {request.distance_km} km</Text>
              <Text style={styles.requestMeta}>Offer expires in: {request.seconds_left ?? 0}s</Text>
              <View style={styles.inlineButtons}>
                <Button
                  label="Accept"
                  onPress={() => respondToOffer(request.request_id, "accept")}
                  loading={busy === `${request.request_id}:accept`}
                  style={styles.flexButton}
                />
                <Button
                  label="Decline"
                  variant="outline"
                  onPress={() => respondToOffer(request.request_id, "decline")}
                  loading={busy === `${request.request_id}:decline`}
                  style={styles.flexButton}
                />
              </View>
            </View>
          )) : <Text style={typography.body}>No pending instant requests right now.</Text>}
        </View>
      </SectionCard>

      <SectionCard>
        <SectionHeader eyebrow="Services" title="Active service sessions" />
        <View style={styles.stack}>
          {activeSessions.length ? activeSessions.map((session) => (
            <View key={session.id || `${session.meal}-${session.status}`} style={styles.requestCard}>
              <Text style={styles.requestTitle}>{titleCase(session.meal || session.mode || "session")}</Text>
              <Text style={styles.requestMeta}>Status: {titleCase(session.status)}</Text>
              {session.username ? <Text style={styles.requestMeta}>Customer: {session.username}</Text> : null}
            </View>
          )) : <Text style={typography.body}>No active sessions right now.</Text>}
        </View>
      </SectionCard>

      <SectionCard>
        <Button label="Logout" variant="outline" onPress={logout} />
      </SectionCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stats: {
    marginTop: 18,
    gap: 12,
  },
  actions: {
    marginTop: 16,
    gap: 12,
  },
  stack: {
    marginTop: 18,
    gap: 14,
  },
  requestCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 6,
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  requestMeta: {
    fontSize: 14,
    color: palette.muted,
  },
  inlineButtons: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  flexButton: {
    flex: 1,
  },
})
