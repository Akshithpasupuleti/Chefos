import { useEffect, useMemo, useState } from "react"
import { StyleSheet, Text, View } from "react-native"

import { api } from "../api/client"
import { readCachedValue, writeCachedValue } from "../api/cache"
import { Hero, LoadingState, Pill, Screen, SectionCard, SectionHeader } from "../components/ui"
import { titleCase } from "../utils/format"
import { typography } from "../theme"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const MENU_CACHE_TTL_MS = 5 * 60 * 1000
const PREFERENCE_CACHE_TTL_MS = 10 * 60 * 1000

export function WeeklyMenuScreen() {
  const [loading, setLoading] = useState(true)
  const [menu, setMenu] = useState(null)
  const [preference, setPreference] = useState(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      const [cachedMenu, cachedPreference] = await Promise.all([
        readCachedValue("menu:weekly", { maxAgeMs: MENU_CACHE_TTL_MS }),
        readCachedValue("menu:preference", { maxAgeMs: PREFERENCE_CACHE_TTL_MS }),
      ])

      if (!active) return

      if (cachedMenu) setMenu(cachedMenu)
      if (cachedPreference) setPreference(cachedPreference)
      if (cachedMenu || cachedPreference) setLoading(false)

      Promise.allSettled([api.get("menu/weekly/"), api.get("menu/preference/")])
        .then(async ([menuRes, prefRes]) => {
          if (!active) return

          if (menuRes.status === "fulfilled") {
            const nextMenu = menuRes.value.data
            setMenu(nextMenu)
            await writeCachedValue("menu:weekly", nextMenu)
          }

          if (prefRes.status === "fulfilled") {
            const nextPreference = prefRes.value.data
            setPreference(nextPreference)
            await writeCachedValue("menu:preference", nextPreference)
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    load()

    return () => {
      active = false
    }
  }, [])

  const rows = useMemo(() => {
    if (!menu) return []
    return DAYS.map((day, index) => ({
      day,
      breakfast: Array.isArray(menu.breakfast) ? menu.breakfast[index] : "",
      lunch: Array.isArray(menu.lunch) ? menu.lunch[index] : "",
      dinner: Array.isArray(menu.dinner) ? menu.dinner[index] : "",
      active: menu.day_index === index,
    }))
  }, [menu])

  if (loading) {
    return <Screen><LoadingState label="Loading weekly menu..." /></Screen>
  }

  return (
    <Screen>
      <Hero
        image="https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80"
        eyebrow="Weekly Menu"
        title="A weekly plan that feels structured, clear, and product-grade."
        subtitle="Your backend-generated menu is presented as a lightweight planning system rather than a static meal list."
      >
        <Pill label={`Goal: ${titleCase(preference?.goal || "not set")}`} tone="good" />
        <Pill label={`Cuisine: ${titleCase(preference?.cuisine_style || "not set")}`} tone="neutral" />
      </Hero>

      <SectionCard>
        <SectionHeader eyebrow="Preferences" title="What this menu is optimizing for" />
        <View style={styles.chips}>
          <Pill label={`Food: ${titleCase(preference?.food_type || "not set")}`} />
          <Pill label={`Allergies: ${preference?.allergies || "none"}`} tone="warm" />
          <Pill label={`People: ${preference?.people_count || 1}`} />
        </View>
      </SectionCard>

      <SectionCard>
        <SectionHeader eyebrow="Calendar" title="Your meal week" />
        <View style={styles.stack}>
          {rows.length ? rows.map((row) => (
            <View key={row.day} style={[styles.dayCard, row.active ? styles.dayCardActive : null]}>
              <Text style={styles.dayTitle}>{row.day}</Text>
              <Text style={styles.dayLine}>Breakfast: {row.breakfast || "Not set"}</Text>
              <Text style={styles.dayLine}>Lunch: {row.lunch || "Not set"}</Text>
              <Text style={styles.dayLine}>Dinner: {row.dinner || "Not set"}</Text>
            </View>
          )) : <Text style={typography.body}>No weekly menu found yet.</Text>}
        </View>
      </SectionCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  chips: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stack: {
    marginTop: 18,
    gap: 14,
  },
  dayCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#eadcc8",
    backgroundColor: "#fcfaf6",
    gap: 6,
  },
  dayCardActive: {
    backgroundColor: "#fff1de",
    borderColor: "#d89f3f",
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2724",
  },
  dayLine: {
    color: "#6a746d",
    fontSize: 14,
    lineHeight: 20,
  },
})
