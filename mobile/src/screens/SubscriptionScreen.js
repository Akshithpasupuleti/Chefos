import { useEffect, useMemo, useState } from "react"
import { Alert, StyleSheet, Text, View } from "react-native"

import { api } from "../api/client"
import { readCachedValue, writeCachedValue } from "../api/cache"
import { Button, Hero, LoadingState, Pill, Screen, SectionCard, SectionHeader } from "../components/ui"
import { currencyInr, inferPlanCycle, joinMeals, safeArray, titleCase } from "../utils/format"
import { typography } from "../theme"

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000
const PREFERENCE_CACHE_TTL_MS = 10 * 60 * 1000
const PRICE_PREVIEW_CACHE_TTL_MS = 3 * 60 * 1000

export function SubscriptionScreen() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [assignedChef, setAssignedChef] = useState(null)
  const [preference, setPreference] = useState(null)
  const [menu, setMenu] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [pricePreview, setPricePreview] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [cachedChef, cachedPreference, cachedMenu, cachedSubscription, cachedPricePreview] = await Promise.all([
        readCachedValue("chefs:assigned", { maxAgeMs: DASHBOARD_CACHE_TTL_MS }),
        readCachedValue("menu:preference", { maxAgeMs: PREFERENCE_CACHE_TTL_MS }),
        readCachedValue("menu:weekly", { maxAgeMs: DASHBOARD_CACHE_TTL_MS }),
        readCachedValue("subscription:active", { maxAgeMs: DASHBOARD_CACHE_TTL_MS }),
        readCachedValue("subscriptions:price-preview", { maxAgeMs: PRICE_PREVIEW_CACHE_TTL_MS }),
      ])

      if (cachedChef) setAssignedChef(cachedChef?.chef || null)
      if (cachedPreference) setPreference(cachedPreference)
      if (cachedMenu) setMenu(cachedMenu)
      if (cachedSubscription) setSubscription(cachedSubscription)
      if (cachedPricePreview) setPricePreview(cachedPricePreview)
      if (cachedChef || cachedPreference || cachedMenu || cachedSubscription || cachedPricePreview) {
        setLoading(false)
      }

      const [chefRes, prefRes, menuRes, subRes] = await Promise.allSettled([
        api.get("chefs/assigned/"),
        api.get("menu/preference/"),
        api.get("menu/weekly/"),
        api.get("subscription/active/"),
      ])
      const nextPreference = prefRes.status === "fulfilled" ? prefRes.value.data : null
      const nextSubscription = subRes.status === "fulfilled" ? subRes.value.data : null
      if (chefRes.status === "fulfilled") {
        setAssignedChef(chefRes.value.data.chef)
        await writeCachedValue("chefs:assigned", chefRes.value.data)
      }
      if (nextPreference) {
        setPreference(nextPreference)
        await writeCachedValue("menu:preference", nextPreference)
      }
      if (menuRes.status === "fulfilled") {
        setMenu(menuRes.value.data)
        await writeCachedValue("menu:weekly", menuRes.value.data)
      }
      if (nextSubscription) {
        setSubscription(nextSubscription)
        await writeCachedValue("subscription:active", nextSubscription)
      }

      const mealType = safeArray(nextSubscription?.meal_type)
      if (mealType.length) {
        const preview = await api.get("subscriptions/price-preview/", {
          params: {
            meal_type: mealType.join(","),
            plan_cycle: inferPlanCycle(nextSubscription).toLowerCase() || "monthly",
            people_count: nextPreference?.people_count || 1,
          },
        })
        setPricePreview(preview.data)
        await writeCachedValue("subscriptions:price-preview", preview.data)
      } else {
        setPricePreview(null)
      }
    } catch {
      setPricePreview(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const summary = useMemo(() => {
    const selectedMeals = safeArray(subscription?.meal_type)
    return {
      meals: joinMeals(selectedMeals),
      cycle: inferPlanCycle(subscription) || "Pending",
      people: preference?.people_count || 1,
      cuisine: preference?.cuisine_style || "Not set",
      goal: preference?.goal || "Not set",
      chef: assignedChef?.name || "Not assigned",
    }
  }, [subscription, preference, assignedChef])

  const createOrder = async () => {
    if (!subscription?.meal_type?.length || !assignedChef?.id) {
      Alert.alert("Missing data", "Assign a chef and activate a plan before creating an order.")
      return
    }
    setBusy(true)
    try {
      const res = await api.post("payments/create-order/", {
        subscription_payload: {
          chef: assignedChef.id,
          meal_type: subscription.meal_type,
          meal_wave: subscription.meal_wave || {},
          people_count: preference?.people_count || 1,
          plan_cycle: inferPlanCycle(subscription).toLowerCase() || "monthly",
        },
      })
      Alert.alert(
        "Order created",
        `Backend order ${res.data.order_id} is ready. Native Razorpay SDK wiring is the next step to finish in-app checkout.`
      )
    } catch (err) {
      Alert.alert("Unable to create order", err?.response?.data?.detail || "Please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <Screen><LoadingState label="Loading subscription studio..." /></Screen>
  }

  return (
    <Screen>
      <Hero
        image="https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=1200&q=80"
        eyebrow="Subscription"
        title="Review the plan in a cleaner, product-style checkout flow."
        subtitle="This screen translates your web confirmation experience into a more focused mobile subscription workspace."
      >
        <Pill label={summary.chef} tone={assignedChef ? "good" : "warm"} />
        <Pill label={`${summary.cycle} plan`} tone="neutral" />
      </Hero>

      <SectionCard>
        <SectionHeader eyebrow="Summary" title="Current subscription picture" />
        <View style={styles.stack}>
          <Text style={styles.line}>Chef: {summary.chef}</Text>
          <Text style={styles.line}>Meals: {summary.meals}</Text>
          <Text style={styles.line}>Cycle: {summary.cycle}</Text>
          <Text style={styles.line}>People: {summary.people}</Text>
          <Text style={styles.line}>Goal: {titleCase(summary.goal)}</Text>
          <Text style={styles.line}>Cuisine: {titleCase(summary.cuisine)}</Text>
        </View>
      </SectionCard>

      <SectionCard>
        <SectionHeader eyebrow="Pricing" title="Server-backed preview" />
        <Text style={styles.price}>{currencyInr(pricePreview?.price_inr || subscription?.price || 0)}</Text>
        <Text style={[typography.body, { marginTop: 8 }]}>
          This screen already calls your backend preview and order APIs. Native payment completion still needs Razorpay mobile SDK integration.
        </Text>
        <View style={{ marginTop: 16, gap: 12 }}>
          <Button label={busy ? "Creating order..." : "Create backend order"} onPress={createOrder} loading={busy} />
          <Button label="Refresh summary" variant="outline" onPress={load} />
        </View>
      </SectionCard>

      <SectionCard>
        <SectionHeader eyebrow="Menu context" title="What the plan is tied to" />
        <Text style={typography.body}>
          Latest weekly menu present: {menu ? "Yes" : "No"}.
        </Text>
      </SectionCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: {
    marginTop: 18,
    gap: 8,
  },
  line: {
    fontSize: 14,
    color: "#4b544e",
  },
  price: {
    marginTop: 18,
    fontSize: 34,
    fontWeight: "800",
    color: "#ba5b33",
  },
})
