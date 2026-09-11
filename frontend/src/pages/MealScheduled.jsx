import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import LiveTrackMap from "../components/common/LiveTrackMap"
import PageState from "../components/common/PageState"
import api from "../services/api"

const DEFAULT_MEAL_TIMES = {
  breakfast: "8:30 AM",
  lunch: "1:00 PM",
  dinner: "8:00 PM",
}


export default function MealSchedule() {
  const navigate = useNavigate()
  const [today, setToday] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState("")
  const [nextInSeconds, setNextInSeconds] = useState(null)
  const [lastPollAt, setLastPollAt] = useState("")
  const [pollInSeconds, setPollInSeconds] = useState(10)

  const loadToday = ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    api.get("menu/today/")
      .then((res) => {
        setToday(res.data)
        setLastPollAt(new Date().toLocaleTimeString())
        setPollInSeconds(10)
      })
      .catch(() => {
        if (!silent) setToday(null)
      })
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }

  useEffect(() => {
    loadToday()
    const timer = setInterval(() => loadToday({ silent: true }), 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setPollInSeconds((prev) => (prev <= 0 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const mins = Number(today?.time_context?.next_in_minutes)
    if (!Number.isFinite(mins) || mins < 0) {
      setNextInSeconds(null)
      return
    }
    setNextInSeconds(Math.round(mins * 60))
  }, [today?.time_context?.next_in_minutes])

  useEffect(() => {
    if (!Number.isFinite(nextInSeconds) || nextInSeconds <= 0) return undefined
    const timer = setInterval(() => {
      setNextInSeconds((prev) => {
        if (!Number.isFinite(prev)) return prev
        return prev > 0 ? prev - 1 : 0
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [nextInSeconds])

  const mealRows = useMemo(() => {
    if (!today) return []
    const phase = today?.time_context?.meal_phase || {}
    const selectedMeals = Array.isArray(today?.selected_meals)
      ? new Set(today.selected_meals.map((meal) => String(meal).toLowerCase()))
      : null

    const rows = [
      { key: "breakfast", label: "Breakfast", dish: toText(today.breakfast), time: mealTime(today, "breakfast"), phase: phase.breakfast || "later" },
      { key: "lunch", label: "Lunch", dish: toText(today.lunch), time: mealTime(today, "lunch"), phase: phase.lunch || "later" },
      { key: "dinner", label: "Dinner", dish: toText(today.dinner), time: mealTime(today, "dinner"), phase: phase.dinner || "later" },
    ]

    return rows.filter((row) => {
      const hasDish = String(row.dish || "").trim().length > 0
      const isSelected = selectedMeals ? selectedMeals.has(row.key) : true
      return isSelected && hasDish && row.phase !== "completed" && row.phase !== "not_captured"
    })
  }, [today])

  const upcomingHeroImage = useMemo(() => {
    return (
      today?.menu_image_url ||
      "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1600&q=80"
    )
  }, [today?.menu_image_url])

  const serviceRows = useMemo(() => {
    const sessions = Array.isArray(today?.service_otps) ? today.service_otps : []
    return sessions.filter((session) =>
      ["start_otp_generated", "end_otp_generated", "in_progress"].includes(String(session?.status || ""))
    )
  }, [today?.service_otps])

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

  const updateMeal = (key, value) => {
    setSavingKey(key)
    api.patch("menu/today/", { [key]: value })
      .then((res) => setToday(res.data))
      .finally(() => setSavingKey(""))
  }

  return (
    <div className="page-shell">
      <AppNavbar />

      <main className="page-container py-8 md:py-10">
        <section className="rounded-[30px] overflow-hidden border border-[rgba(17,33,26,0.12)] shadow-[0_20px_48px_rgba(20,39,31,0.18)] bg-white">
          <div className="grid lg:grid-cols-[1.24fr_0.76fr]">
            <div className="relative min-h-[320px]">
              <img src={upcomingHeroImage} alt="Upcoming meal" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[rgba(12,30,23,0.84)] via-[rgba(12,30,23,0.56)] to-[rgba(12,30,23,0.22)]" />

              <div className="relative h-full p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/80">Meal Timeline</p>
                  <h1 className="serif-title mt-2 text-3xl md:text-4xl text-white">Today’s meal schedule</h1>
                  <p className="mt-2 text-sm md:text-base text-white/88 max-w-xl">
                    Only today’s plan is shown here. Update any meal item live and keep your day on track.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <InfoChipDark label={`Current: ${toTitle(today?.time_context?.current_slot || "none")}`} />
                  <InfoChipDark label={`Next: ${toTitle(today?.time_context?.next_slot || "breakfast")}`} />
                  <InfoChipDark label="Editable items" />
                  <InfoChipDark label={`Live refresh in ${pollInSeconds}s`} />
                  {lastPollAt ? <InfoChipDark label={`Last sync ${lastPollAt}`} /> : null}
                  {today?.auto_refreshed ? <InfoChipDark label="Auto refreshed" /> : null}
                </div>
              </div>
            </div>

            <div className="p-5 md:p-6 bg-[linear-gradient(165deg,#f4fbf7_0%,#ecf5ff_100%)] border-l border-[rgba(17,33,26,0.1)]">
              <img src={upcomingHeroImage} alt="Upcoming meal preview" className="h-36 w-full rounded-2xl object-cover soft-border" />

              <div className="mt-4 grid gap-3">
                <HeroStat label="Date" value={today?.date || "-"} />
                <HeroStat label="Current Meal" value={toTitle(today?.time_context?.current_slot || "none")} />
                <HeroStat label="Next In" value={formatSeconds(nextInSeconds)} />
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={loadToday}>Refresh</Button>
                <Button variant="secondary" onClick={() => navigate("/user/weekly-menu")}>View Weekly</Button>
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <PageState kind="loading" title="Loading schedule" message="Preparing your meal timeline for today." className="mt-8" />
        )}

        {!loading && !today && (
          <PageState
            kind="empty"
            title="No schedule available"
            message="Save your menu preferences and generate a plan first."
            actionLabel="Generate Menu"
            onAction={() => navigate("/user/ai-menu")}
            className="mt-8"
          />
        )}

        {!loading && today && (
          <>
            {tracking ? (
              <section className="mt-8 panel p-5 border border-[rgba(15,122,94,0.24)] bg-[linear-gradient(165deg,#ecfaf3_0%,#f7fffb_100%)]">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Chef Live Tracking</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)] capitalize">
                  {tracking.meal} • Distance {tracking.distanceKm} km • ETA {tracking.etaMin} min
                </p>
                <div className="mt-3">
                  <LiveTrackMap
                    chefLat={tracking.chefLat}
                    chefLng={tracking.chefLng}
                    userLat={tracking.userLat}
                    userLng={tracking.userLng}
                    height={250}
                  />
                </div>
              </section>
            ) : null}

            {Array.isArray(today?.doorstep_alerts) && today.doorstep_alerts.length > 0 ? (
              <section className="mt-8 panel p-5 border border-[rgba(15,122,94,0.24)] bg-[linear-gradient(165deg,#ecfaf3_0%,#f7fffb_100%)]">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Live Arrival Update</h2>
                <div className="mt-3 space-y-2">
                  {today.doorstep_alerts.map((alert, idx) => (
                    <p key={`${alert.meal || "meal"}-${idx}`} className="text-sm text-[#0b654f] font-semibold">
                      {alert.message} {typeof alert.distance_km === "number" ? `(${alert.distance_km} km)` : ""}
                    </p>
                  ))}
                </div>
              </section>
            ) : null}

            {!!serviceRows.length && (
              <section className="mt-8 panel p-6 border border-[rgba(15,122,94,0.2)] bg-[linear-gradient(165deg,#f2fbf7_0%,#f8fffd_100%)]">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Service OTP</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">Share this OTP with your chef when they start or complete your service.</p>
                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  {serviceRows.map((session) => (
                    <OtpCard key={session.service_session_id} session={session} />
                  ))}
                </div>
              </section>
            )}

            {today?.upcoming_order ? (
              <section className="mt-8 panel p-6 border border-[rgba(15,122,94,0.2)] bg-[linear-gradient(165deg,#f4fbf7_0%,#f8fffd_100%)]">
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Upcoming Order</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)] capitalize">
                  {today.upcoming_order.meal} {today.upcoming_order.time ? `• ${today.upcoming_order.time}` : ""}
                </p>
                <p className="mt-2 text-sm text-[var(--color-text)]">{today.upcoming_order.dish || "Menu is being prepared."}</p>
                {today.upcoming_order.service_session?.start_otp ? (
                  <p className="mt-3 text-sm text-[var(--color-muted)]">
                    Start OTP: <span className="font-semibold tracking-[0.1em] text-[#0b654f]">{today.upcoming_order.service_session.start_otp}</span>
                  </p>
                ) : null}
                {today.upcoming_order.service_session?.end_otp ? (
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    End OTP: <span className="font-semibold tracking-[0.1em] text-[#0b654f]">{today.upcoming_order.service_session.end_otp}</span>
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="mt-8 grid gap-5">
              {mealRows.map((meal) => (
                <EditableMealCard
                  key={meal.key}
                  meal={meal}
                  saving={savingKey === meal.key}
                  onSave={(val) => updateMeal(meal.key, val)}
                />
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function OtpCard({ session }) {
  const isStart = session?.status === "start_otp_generated"
  const code = isStart ? session?.start_otp : session?.end_otp
  const title = isStart ? "Start OTP" : session?.status === "end_otp_generated" ? "End OTP" : "Service In Progress"
  const subtitle = isStart
    ? "Chef requested to start service."
    : session?.status === "end_otp_generated"
      ? "Chef requested to complete service."
      : "Service has started."

  return (
    <div className="rounded-2xl border border-[rgba(15,122,94,0.2)] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--color-text)] capitalize">
          {session?.meal || "Instant"} {session?.wave ? `• ${session.wave}` : ""}
        </p>
        <span className="text-[10px] uppercase tracking-[0.08em] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
          {title}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{subtitle}</p>
      {code ? (
        <p className="mt-3 text-2xl font-bold tracking-[0.22em] text-[#0b654f]">{code}</p>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-muted)]">Waiting for OTP request.</p>
      )}
      {session?.chef_name ? <p className="mt-2 text-xs text-[var(--color-muted)]">Chef: {session.chef_name}</p> : null}
    </div>
  )
}

function mealTime(today, mealKey) {
  const slotTimes = today?.time_context?.slot_start_times || {}
  return slotTimes[mealKey] || DEFAULT_MEAL_TIMES[mealKey] || "-"
}

function EditableMealCard({ meal, onSave, saving }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(meal.dish)

  useEffect(() => {
    setValue(meal.dish)
  }, [meal.dish])

  return (
    <article className="panel p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-[var(--color-muted)]">{meal.time}</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-[var(--color-text)]">{meal.label}</h3>
          <MealPhaseBadge phase={meal.phase} />
        </div>

        {!editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setValue(meal.dish)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button
              loading={saving}
              onClick={() => {
                onSave(value)
                setEditing(false)
              }}
            >
              Save
            </Button>
          </div>
        )}
      </div>

      {!editing ? (
        <p className="mt-3 text-sm md:text-base text-[var(--color-muted)]">{meal.dish || "Not set"}</p>
      ) : (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />
      )}
    </article>
  )
}

function MealPhaseBadge({ phase }) {
  const text = {
    now: "Now",
    next: "Next",
    completed: "Completed",
    not_captured: "Not Captured",
    later: "Later",
  }
  const styles = {
    now: "bg-[#eaf8f3] text-[#0b654f] border-[#b7e8cf]",
    next: "bg-[#e7f0ff] text-[#2458a4] border-[#b9d2ff]",
    completed: "bg-[#f0f3f6] text-[#5d6c7a] border-[#d3dde6]",
    not_captured: "bg-[#fff1f1] text-[#9f1d1d] border-[#f8caca]",
    later: "bg-[#fff6e7] text-[#8a6326] border-[#f2d49e]",
  }
  return (
    <span className={`inline-flex mt-2 text-xs px-2 py-1 rounded-full border font-semibold ${styles[phase] || styles.later}`}>
      {text[phase] || "Later"}
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

function toText(value) {
  if (Array.isArray(value)) {
    return value.join(", ")
  }
  if (value === null || value === undefined) {
    return ""
  }
  return String(value)
}

function toTitle(value) {
  const text = String(value || "")
  if (!text) return "-"
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatMinutes(value) {
  if (typeof value !== "number" || value < 0) return "-"
  const h = Math.floor(value / 60)
  const m = value % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatSeconds(value) {
  if (!Number.isFinite(value) || value < 0) return "-"
  const total = Math.floor(value)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
  return `${m}m ${String(s).padStart(2, "0")}s`
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
