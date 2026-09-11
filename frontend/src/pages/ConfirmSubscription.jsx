import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"

const DEFAULT_WAVE = {
  breakfast: "B2",
  lunch: "L2",
  dinner: "D2",
}

const WAVE_TIME_LABELS = {
  breakfast: {
    B1: "06:00 - 07:20",
    B2: "07:30 - 08:50",
    B3: "09:00 - 10:20",
    B4: "10:30 - 11:30",
    B5: "11:30 - 12:30",
  },
  lunch: {
    L1: "12:00 - 13:20",
    L2: "13:30 - 14:50",
    L3: "15:00 - 16:20",
    L4: "16:30 - 17:30",
    L5: "17:30 - 18:30",
  },
  dinner: {
    D1: "18:30 - 19:50",
    D2: "20:00 - 21:20",
    D3: "21:30 - 22:50",
    D4: "23:00 - 23:59",
    D5: "00:00 - 01:00",
  },
}

function parsePlan() {
  try {
    const raw = localStorage.getItem("subscription_plan")
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function ConfirmSubscription() {
  const navigate = useNavigate()
  const [assignedChef, setAssignedChef] = useState(null)
  const [preference, setPreference] = useState(null)
  const [menu, setMenu] = useState(null)
  const [activeSubscription, setActiveSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [mealWave, setMealWave] = useState({})
  const [serverPrice, setServerPrice] = useState(null)

  useEffect(() => {
    Promise.allSettled([
      api.get("chefs/assigned/"),
      api.get("menu/preference/"),
      api.get("menu/weekly/"),
      api.get("subscription/active/"),
    ])
      .then(([chefRes, prefRes, menuRes, subRes]) => {
        if (chefRes.status === "fulfilled") setAssignedChef(chefRes.value.data.chef)
        if (prefRes.status === "fulfilled") setPreference(prefRes.value.data)
        if (menuRes.status === "fulfilled") setMenu(menuRes.value.data)
        if (subRes.status === "fulfilled") setActiveSubscription(subRes.value.data)
      })
      .finally(() => setLoading(false))
  }, [])

  const plan = useMemo(() => parsePlan(), [])

  const menuDerivedMeals = useMemo(() => {
    if (!menu) return []
    return ["breakfast", "lunch", "dinner"].filter((meal) => {
      const value = menu[meal]
      if (Array.isArray(value)) {
        return value.some((item) => String(item || "").trim())
      }
      return Boolean(String(value || "").trim())
    })
  }, [menu])

  const subscriptionMeals = useMemo(() => {
    const allowed = new Set(["breakfast", "lunch", "dinner"])
    const normalize = (items) => {
      if (!Array.isArray(items)) return []
      const cleaned = []
      for (const item of items) {
        const meal = String(item || "").toLowerCase().trim()
        if (!allowed.has(meal) || cleaned.includes(meal)) continue
        cleaned.push(meal)
      }
      return cleaned
    }

    // For active subscriptions, meal type is locked and must come from backend.
    const fromActive = normalize(activeSubscription?.meal_type)
    if (fromActive.length) return fromActive

    // For first-time subscribe, use AI Menu selection.
    const fromPlan = normalize(plan?.selected_meals)
    if (fromPlan.length) return fromPlan

    // Fallback: latest menu payload.
    return normalize(menuDerivedMeals)
  }, [plan, activeSubscription, menuDerivedMeals])
  const subscriptionMealsKey = useMemo(() => subscriptionMeals.join(","), [subscriptionMeals])

  const planCycle = plan?.plan_cycle || "monthly"
  const peopleCount = Number(plan?.people_count || preference?.people_count || 1)
  const peopleTier = peopleCount >= 3 ? "4-6" : "1-2"
  const dinnerSelected = subscriptionMeals.includes("dinner")
  const selectedSlotSummary = useMemo(() => {
    if (!subscriptionMeals.length) return "Not selected"
    return subscriptionMeals
      .map((meal) => {
        const wave = mealWave?.[meal] || DEFAULT_WAVE[meal]
        const timeLabel = WAVE_TIME_LABELS?.[meal]?.[wave] || wave
        return `${meal}: ${timeLabel}`
      })
      .join(" | ")
  }, [subscriptionMeals, mealWave])

  useEffect(() => {
    if (!subscriptionMeals.length) return
    const fromPlan = plan?.meal_wave || {}
    const fromActive = activeSubscription?.meal_wave || {}
    setMealWave((prev) => {
      const next = { ...prev }
      for (const meal of subscriptionMeals) {
        next[meal] = String(fromPlan[meal] || fromActive[meal] || DEFAULT_WAVE[meal] || "").toUpperCase()
      }
      return next
    })
  }, [subscriptionMeals, activeSubscription, plan])

  useEffect(() => {
    let cancelled = false

    const fetchServerPrice = async () => {
      if (!subscriptionMealsKey) {
        if (!cancelled) setServerPrice(null)
        return
      }
      try {
        const res = await api.get("subscriptions/price-preview/", {
          params: {
            meal_type: subscriptionMealsKey,
            plan_cycle: planCycle,
            people_count: peopleCount,
          },
        })
        if (!cancelled) setServerPrice(Number(res?.data?.price_inr) || null)
      } catch {
        if (!cancelled) setServerPrice(null)
      }
    }

    fetchServerPrice()
    return () => {
      cancelled = true
    }
  }, [subscriptionMealsKey, planCycle, peopleCount])

  const price = useMemo(() => {
    if (typeof serverPrice === "number" && Number.isFinite(serverPrice)) return serverPrice
    const mealCount = subscriptionMeals.length || 1
    const monthly = {
      "1-2": { 1: 5000, 2: 7500, 3: 9500 },
      "4-6": { 1: 6500, 2: 9500, 3: 13500 },
    }
    const weekly = {
      "1-2": { 1: 1750, 2: 2400, 3: 2800 },
      "4-6": { 1: 2250, 2: 2800, 3: 3500 },
    }
    const table = planCycle === "weekly" ? weekly : monthly
    return table[peopleTier][mealCount] || table[peopleTier][1]
  }, [planCycle, subscriptionMeals, peopleTier, serverPrice])

  const handleSubscribe = async () => {
    if (!assignedChef) {
      setError("Assign a chef before subscribing.")
      return
    }

    if (!subscriptionMeals.length) {
      setError("Select at least one meal slot in AI Menu before subscribing.")
      return
    }

    setSubmitting(true)
    setError("")
    try {
      const subscriptionPayload = {
        chef: assignedChef.id,
        meal_type: subscriptionMeals,
        meal_wave: mealWave,
        plan_cycle: planCycle,
        people_count: peopleCount,
      }
      if (isUpdate) {
        // Existing active subscribers can switch chef without paying again.
        await api.post("subscriptions/create/", subscriptionPayload)
      } else {
        const orderRes = await api.post("payments/create-order/", {
          subscription_payload: subscriptionPayload,
        })
        const order = orderRes?.data || {}
        const paymentResult = await openRazorpayCheckout(order)
        await api.post("payments/verify/", {
          razorpay_order_id: paymentResult.razorpay_order_id || order.order_id,
          razorpay_payment_id: paymentResult.razorpay_payment_id,
          razorpay_signature: paymentResult.razorpay_signature,
        })
        await api.post("subscriptions/create/", { ...subscriptionPayload, price: order.price_inr || price })
      }

      const existing = parsePlan() || {}
      localStorage.setItem(
        "subscription_plan",
        JSON.stringify({
          ...existing,
          selected_meals: subscriptionMeals,
          meal_wave: mealWave,
          plan_cycle: planCycle,
        })
      )
      window.location.replace(`/dashboard?updated=${Date.now()}`)
      return
    } catch (err) {
      const payload = err?.response?.data
      if (err?.response?.status === 409 && payload?.detail) setError(payload.detail)
      else setError(payload?.detail || "Failed to save subscription. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const isUpdate = Boolean(activeSubscription)

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F9F7] to-[#EEF3EF]">
      <AppNavbar />

      <main className="max-w-5xl mx-auto px-6 py-14">
        <div className="mb-10">
          <h1 className="text-4xl font-medium tracking-tight">Review and Confirm</h1>
          <p className="mt-2 text-[var(--color-muted)] text-lg">Confirm your chef and meal plan.</p>
        </div>

        {loading && (
          <PageState kind="loading" title="Loading your subscription summary" message="Fetching chef, menu, and preference details." className="mb-6" />
        )}

          {!loading && error && (
            <PageState kind="error" title="Action required" message={error} className="mb-6" />
          )}

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            <div className="bg-white rounded-3xl p-8 border border-[rgba(0,0,0,0.06)] shadow-[0_18px_36px_rgba(0,0,0,0.06)]">
              <h3 className="text-xl font-medium mb-6">Your Chef</h3>
              {assignedChef ? (
                <div>
                  <p className="text-lg font-medium">{assignedChef.name}</p>
                  <p className="text-sm text-[var(--color-muted)]">⭐ {assignedChef.rating} • {assignedChef.speciality}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-[var(--color-muted)]">No chef assigned yet.</p>
                  <div className="mt-4">
                    <Button variant="outline" onClick={() => navigate("/find-chef")}>Assign Chef</Button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl p-8 border border-[rgba(0,0,0,0.06)] shadow-[0_18px_36px_rgba(0,0,0,0.06)]">
              <h3 className="text-xl font-medium mb-6">Your Plan</h3>

              <div className="grid sm:grid-cols-2 gap-6 text-sm">
                <Detail label="Plan cycle" value={planCycle} />
                <Detail label="Meals" value={subscriptionMeals.length ? subscriptionMeals.join(", ") : "Not selected"} />
                <Detail label="Goal" value={preference?.goal || "Not set"} />
                <Detail label="Preference" value={preference?.food_type || "Not set"} />
                <Detail label="People" value={`${peopleCount} (${peopleTier})`} />
                <Detail label="Dinner" value={dinnerSelected ? "Included" : "Not included"} />
                <Detail label="Allergies" value={preference?.allergies || "None"} />
                <Detail label="Selected time slot" value={selectedSlotSummary} />
                <Detail label="Status" value={isUpdate ? "Active (will update)" : "Pending"} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-[rgba(0,0,0,0.06)] shadow-[0_20px_40px_rgba(0,0,0,0.08)] flex flex-col">
            <p className="text-sm uppercase tracking-wide text-[var(--color-muted)]">Price</p>

            <div className="mt-3 mb-6">
              <span className="text-4xl font-medium">Rs {price}</span>
              <span className="text-sm text-[var(--color-muted)]"> / {planCycle === "weekly" ? "week" : "month"}</span>
            </div>

            <ul className="text-sm space-y-2 mb-8">
              <li>- Plan can be updated any time</li>
              <li>- Meals follow your AI selection</li>
              <li>- Support included</li>
            </ul>

            <Button
              className="w-full py-3 text-base rounded-xl"
              onClick={handleSubscribe}
              loading={submitting}
              disabled={loading || !assignedChef}
            >
              {isUpdate ? (submitting ? "Updating..." : "Update Subscription") : (submitting ? "Starting..." : "Start My Service")}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function openRazorpayCheckout(order) {
  return new Promise(async (resolve, reject) => {
    try {
      const loaded = await ensureRazorpayScript()
      if (!loaded || !window.Razorpay) {
        reject(new Error("Payment SDK failed to load"))
        return
      }
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency || "INR",
        name: order.name || "Chefos",
        description: order.description || "Subscription payment",
        order_id: order.order_id,
        handler: function (response) {
          resolve({
            ...order,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          })
        },
        modal: {
          ondismiss: function () {
            reject(new Error("Payment cancelled"))
          },
        },
      }
      const rz = new window.Razorpay(options)
      rz.open()
    } catch (error) {
      reject(error)
    }
  })
}

function ensureRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const existing = document.querySelector('script[data-razorpay-sdk="1"]')
    if (existing) {
      existing.addEventListener("load", () => resolve(true))
      existing.addEventListener("error", () => resolve(false))
      return
    }
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    script.dataset.razorpaySdk = "1"
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 font-medium capitalize">{value}</p>
    </div>
  )
}
