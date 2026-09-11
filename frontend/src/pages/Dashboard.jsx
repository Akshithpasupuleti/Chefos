import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import LiveTrackMap from "../components/common/LiveTrackMap"
import PageState from "../components/common/PageState"
import api from "../services/api"

const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80"
const SIDE_IMAGE_URL =
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1000&q=80"


export default function Dashboard() {
  const navigate = useNavigate()
  const [assignedChef, setAssignedChef] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [today, setToday] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastPollAt, setLastPollAt] = useState("")
  const [pollInSeconds, setPollInSeconds] = useState(10)

  const load = () => {
    setLoading(true)
    Promise.allSettled([api.get("chefs/assigned/"), api.get("subscription/active/"), api.get("menu/today/")])
      .then(([chefRes, subRes, todayRes]) => {
        setAssignedChef(chefRes.status === "fulfilled" ? chefRes.value.data.chef : null)
        setSubscription(subRes.status === "fulfilled" ? subRes.value.data : null)
        setToday(todayRes.status === "fulfilled" ? todayRes.value.data : null)
        setLastPollAt(new Date().toLocaleTimeString())
        setPollInSeconds(10)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      api.get("menu/today/")
        .then((res) => {
          setToday(res.data)
          setLastPollAt(new Date().toLocaleTimeString())
          setPollInSeconds(10)
        })
        .catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setPollInSeconds((prev) => (prev <= 0 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const mealSummary = useMemo(() => {
    const mealType = subscription?.meal_type
    if (Array.isArray(mealType) && mealType.length) {
      return mealType.map((m) => String(m).charAt(0).toUpperCase() + String(m).slice(1)).join(", ")
    }
    if (typeof mealType === "object" && mealType !== null) {
      return Object.values(mealType).join(", ")
    }
    return "No active subscription"
  }, [subscription])

  const cycleLabel = useMemo(() => {
    if (!subscription?.start_date || !subscription?.end_date) return ""
    const start = new Date(subscription.start_date)
    const end = new Date(subscription.end_date)
    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24))
    return diffDays <= 8 ? "Weekly" : "Monthly"
  }, [subscription])

  const tracking = useMemo(() => {
    const sessions = Array.isArray(today?.service_otps) ? today.service_otps : []
    const session = sessions.find((s) => {
      if (!s?.journey_started) return false
      const chefLat = Number(s?.chef_latitude)
      const chefLng = Number(s?.chef_longitude)
      const userLat = Number(s?.delivery_latitude)
      const userLng = Number(s?.delivery_longitude)
      return [chefLat, chefLng, userLat, userLng].every(Number.isFinite)
    })
    if (!session) return null
    const chefLat = Number(session.chef_latitude)
    const chefLng = Number(session.chef_longitude)
    const userLat = Number(session.delivery_latitude)
    const userLng = Number(session.delivery_longitude)
    if (![chefLat, chefLng, userLat, userLng].every(Number.isFinite)) return null
    const distanceKm = haversineKm(chefLat, chefLng, userLat, userLng)
    const etaMin = Math.max(1, Math.round((distanceKm / 22) * 60))
    return {
      meal: session.meal,
      chefLat,
      chefLng,
      userLat,
      userLng,
      distanceKm: Number(distanceKm.toFixed(2)),
      etaMin,
    }
  }, [today?.service_otps])

  return (
    <div className="page-shell">
      <AppNavbar />

      <main className="page-container py-8 md:py-10">
        <section className="rounded-[30px] overflow-hidden border border-[rgba(17,33,26,0.12)] shadow-[0_20px_48px_rgba(20,39,31,0.18)] bg-white">
          <div className="grid lg:grid-cols-[1.28fr_0.72fr]">
            <div className="relative min-h-[330px]">
              <img src={HERO_IMAGE_URL} alt="Kitchen overview" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[rgba(12,30,23,0.86)] via-[rgba(12,30,23,0.6)] to-[rgba(12,30,23,0.24)]" />

              <div className="relative h-full p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/80">Control Center</p>
                  <h1 className="serif-title mt-2 text-3xl md:text-4xl text-white">Welcome to your kitchen dashboard</h1>
                  <p className="mt-2 text-sm md:text-base text-white/88 max-w-xl">
                    Track chef assignment, subscription cycle, and today’s schedule in one focused workspace.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <InfoChipDark label={assignedChef ? "Chef Assigned" : "Chef Pending"} />
                  <InfoChipDark label={subscription ? "Plan Active" : "Plan Not Set"} />
                  <InfoChipDark label="Real-time Schedule" />
                </div>
              </div>
            </div>

            <div className="p-5 md:p-6 bg-[linear-gradient(165deg,#f4fbf7_0%,#ecf5ff_100%)] border-l border-[rgba(17,33,26,0.1)]">
              <img src={SIDE_IMAGE_URL} alt="Fresh ingredients" className="h-36 w-full rounded-2xl object-cover soft-border" />

              <div className="mt-4 grid gap-3">
                <HeroStat label="Subscription" value={subscription ? "Active" : "Not set"} />
                <HeroStat label="Plan" value={subscription ? `${cycleLabel ? `${cycleLabel} - ` : ""}${mealSummary}` : "No active plan"} />
                <HeroStat label="Chef" value={assignedChef ? assignedChef.name : "Not assigned"} />
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={load}>Refresh</Button>
                <Button onClick={() => navigate("/user/confirm")}>Manage</Button>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <PageState
            kind="loading"
            title="Loading your dashboard"
            message="Fetching your current chef and subscription details."
            className="mt-8"
          />
        ) : (
          <section className="mt-8 grid md:grid-cols-3 gap-5 md:gap-6">
            <DashboardCard
              title="Assigned Chef"
              status={assignedChef ? "Active" : "Not Set"}
              desc={assignedChef ? `${assignedChef.name} - ${assignedChef.speciality}` : "No chef assigned yet"}
              action={assignedChef ? "View Chef" : "Find Chef"}
              onAction={() => navigate(assignedChef ? "/user/chef" : "/user/find-chef")}
              tone={assignedChef ? "good" : "warn"}
            />

            <DashboardCard
              title="Meal Plan"
              status={subscription ? "Active" : "Not Set"}
              desc={subscription ? `${cycleLabel ? `${cycleLabel} - ` : ""}${mealSummary}` : "No active subscription"}
              action={subscription ? "View Plan" : "Create Plan"}
              onAction={() => navigate(subscription ? "/user/confirm" : "/user/ai-menu")}
              tone="brand"
            />

            <DashboardCard
              title="Today’s Schedule"
              status="Live"
              desc="See and edit today’s breakfast, lunch, and dinner slots."
              action="Open Schedule"
              onAction={() => navigate("/user/schedule")}
              tone="neutral"
            />
          </section>
        )}

        {tracking ? (
          <section className="mt-8 panel p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Chef Live Tracking</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)] capitalize">
              {tracking.meal} • Distance {tracking.distanceKm} km • ETA {tracking.etaMin} min
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Live refresh in {pollInSeconds}s{lastPollAt ? ` • Last sync ${lastPollAt}` : ""}
            </p>
            <div className="mt-3">
              <LiveTrackMap
                chefLat={tracking.chefLat}
                chefLng={tracking.chefLng}
                userLat={tracking.userLat}
                userLng={tracking.userLng}
                height={240}
              />
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const r = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return r * c
}

function DashboardCard({ title, desc, status, action, onAction, tone }) {
  const toneClass = {
    good: "from-[#f5fff9] to-[#eefbf3]",
    warn: "from-[#fffdf3] to-[#fff7e9]",
    brand: "from-[#f2fffb] to-[#ebfbf6]",
    neutral: "from-[#fbfbfb] to-[#f5f8f6]",
  }

  return (
    <article className={`panel p-6 bg-gradient-to-br ${toneClass[tone] || toneClass.neutral}`}>
      <div className="flex justify-between items-start gap-4">
        <h3 className="text-lg font-bold tracking-tight text-[var(--color-text)]">{title}</h3>
        <StatusBadge status={status} />
      </div>

      <p className="mt-3 text-sm text-[var(--color-muted)] min-h-[44px]">{desc}</p>

      <div className="mt-6">
        <Button variant="secondary" onClick={onAction}>{action}</Button>
      </div>
    </article>
  )
}

function StatusBadge({ status }) {
  const styles = {
    Active: "bg-[#dcfbe9] text-[#0f7a5e] border-[#aee6cc]",
    Live: "bg-[#ddefff] text-[#235aa8] border-[#b7d8ff]",
    "Not Set": "bg-[#fff2d9] text-[#99601a] border-[#ffdca5]",
  }

  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${styles[status] || styles.Live}`}>
      {status}
    </span>
  )
}

function HeroStat({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-3 soft-border">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--color-text)]">{value}</p>
    </div>
  )
}

function InfoChipDark({ label }) {
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/18 text-white border border-white/30">
      {label}
    </span>
  )
}
