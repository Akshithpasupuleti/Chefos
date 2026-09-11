import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"
import { ROLE_CHEF, clearRoleSession } from "../services/authSession"

const MEAL_WAVES = {
  breakfast: ["B1", "B2", "B3", "B4", "B5"],
  lunch: ["L1", "L2", "L3", "L4", "L5"],
  dinner: ["D1", "D2", "D3", "D4", "D5"],
}

const WAVE_TIME_LABELS = {
  breakfast: {
    B1: "06:00 - 07:20",
    B2: "07:30 - 08:50",
    B3: "09:00 - 10:20",
  },
  lunch: {
    L1: "12:00 - 13:20",
    L2: "13:30 - 14:50",
    L3: "15:00 - 16:20",
  },
  dinner: {
    D1: "18:30 - 19:50",
    D2: "20:00 - 21:20",
    D3: "21:30 - 22:50",
  },
}

export default function ChefPartnerDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [offerLoading, setOfferLoading] = useState("")
  const [serviceActionLoading, setServiceActionLoading] = useState("")
  const [otpInputs, setOtpInputs] = useState({})
  const [slotSaveLoading, setSlotSaveLoading] = useState(false)
  const [liveLocationEnabled, setLiveLocationEnabled] = useState(true)
  const [lastLocationSyncAt, setLastLocationSyncAt] = useState("")
  const [locationError, setLocationError] = useState("")
  const [slotSettings, setSlotSettings] = useState({})
  const [slotLabels, setSlotLabels] = useState({})
  const [wavesCatalog, setWavesCatalog] = useState(MEAL_WAVES)
  const [nowTs, setNowTs] = useState(Date.now())
  const watchIdRef = useRef(null)
  const lastSentRef = useRef({ lat: null, lng: null, at: 0 })
  const locationSyncInFlightRef = useRef(false)
  const lastLocationAttemptAtRef = useRef(0)
  const loadInFlightRef = useRef(false)
  const lastLoadAtRef = useRef(0)

  const load = async ({ silent = false, force = false } = {}) => {
    const now = Date.now()
    if (!force && now - lastLoadAtRef.current < 3000) return
    if (loadInFlightRef.current) return
    loadInFlightRef.current = true
    lastLoadAtRef.current = now
    if (!silent) setLoading(true)
    try {
      const res = await api.get("chefs/partner/me/")
      const payload = res?.data || null
      setData(payload)
      if (payload?.slot_settings?.available_waves) {
        setSlotSettings(payload.slot_settings.available_waves)
      }
      if (payload?.slot_settings?.custom_wave_labels) {
        setSlotLabels(payload.slot_settings.custom_wave_labels)
      }
      if (payload?.slot_settings?.waves_catalog) {
        setWavesCatalog(payload.slot_settings.waves_catalog)
      }
      setError("")
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load chef dashboard.")
    } finally {
      if (!silent) setLoading(false)
      loadInFlightRef.current = false
    }
  }

  useEffect(() => {
    load({ force: true })
    const timer = setInterval(() => load({ silent: true }), 20000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const logout = () => {
    clearRoleSession(ROLE_CHEF)
    navigate("/")
  }

  const toggleAvailability = async () => {
    if (!data?.partner_profile?.chef) return
    setAvailabilityLoading(true)
    try {
      await api.post("chefs/partner/availability/", {
        is_available: !data.partner_profile.chef.is_available,
      })
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to update availability.")
    } finally {
      setAvailabilityLoading(false)
    }
  }

  const updateLocation = async () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.")
      return
    }
    setLocationLoading(true)
    setError("")
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await syncLocation(position.coords.latitude, position.coords.longitude, { silent: true })
        } catch (err) {
          setError(err?.response?.data?.detail || "Unable to update location.")
        } finally {
          setLocationLoading(false)
        }
      },
      () => {
        setError("Unable to fetch current location.")
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const syncLocation = async (latitude, longitude, { silent = false } = {}) => {
    if (locationSyncInFlightRef.current) return
    const now = Date.now()
    if (now - lastLocationAttemptAtRef.current < 15000) return
    locationSyncInFlightRef.current = true
    lastLocationAttemptAtRef.current = now
    if (!silent) setLocationLoading(true)
    setLocationError("")
    try {
      // Mark latest seen coordinates immediately to avoid rapid duplicate sends.
      lastSentRef.current = { lat: latitude, lng: longitude, at: now }
      await api.post("chefs/partner/location/", { latitude, longitude })
      setLastLocationSyncAt(new Date().toLocaleTimeString())
      setData((prev) => {
        if (!prev?.partner_profile?.chef) return prev
        return {
          ...prev,
          partner_profile: {
            ...prev.partner_profile,
            chef: {
              ...prev.partner_profile.chef,
              latitude,
              longitude,
            },
          },
        }
      })
    } catch (err) {
      setLocationError(err?.response?.data?.detail || "Unable to update location.")
    } finally {
      if (!silent) setLocationLoading(false)
      locationSyncInFlightRef.current = false
    }
  }

  useEffect(() => {
    if (!liveLocationEnabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported on this device.")
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const prev = lastSentRef.current
        const movedEnough =
          prev.lat === null ||
          prev.lng === null ||
          Math.abs(lat - prev.lat) > 0.0005 ||
          Math.abs(lng - prev.lng) > 0.0005
        const staleEnough = Date.now() - prev.at > 30000
        if (!movedEnough && !staleEnough) return
        await syncLocation(lat, lng, { silent: true })
      },
      () => {
        setLocationError("Unable to fetch live location.")
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [liveLocationEnabled])

  const respondToOffer = async (requestId, action) => {
    const key = `${requestId}:${action}`
    setOfferLoading(key)
    try {
      await api.post("chefs/partner/instant/respond/", { request_id: requestId, action })
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to update request.")
    } finally {
      setOfferLoading("")
    }
  }

  const requestStartOtp = async (session) => {
    const key = `start-request:${session.id}`
    setServiceActionLoading(key)
    setError("")
    try {
      if (session.mode === "instant") {
        await api.post("chefs/partner/service/start/request/", {
          mode: "instant",
          request_id: session.instant_request_id,
        })
      } else {
        await api.post("chefs/partner/service/start/request/", {
          mode: "subscription",
          subscription_id: session.subscription_id,
          meal: session.meal,
          service_date: session.service_date,
        })
      }
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to generate start OTP.")
    } finally {
      setServiceActionLoading("")
    }
  }

  const requestStartOtpForSubscription = async (subscriptionId, meal) => {
    const key = `start-request:sub:${subscriptionId}:${meal}`
    setServiceActionLoading(key)
    setError("")
    try {
      const todayIso = new Date().toISOString().slice(0, 10)
      await api.post("chefs/partner/service/start/request/", {
        mode: "subscription",
        subscription_id: subscriptionId,
        meal,
        service_date: todayIso,
      })
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to generate start OTP.")
    } finally {
      setServiceActionLoading("")
    }
  }

  const requestStartOtpForInstant = async (requestId) => {
    const key = `start-request:instant:${requestId}`
    setServiceActionLoading(key)
    setError("")
    try {
      await api.post("chefs/partner/service/start/request/", {
        mode: "instant",
        request_id: requestId,
      })
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to generate start OTP.")
    } finally {
      setServiceActionLoading("")
    }
  }

  const startJourneyForBooking = async (booking) => {
    if (!booking || booking.mode !== "subscription") return
    const key = `journey-start:${booking.subscription_id}:${booking.meal}`
    setServiceActionLoading(key)
    setError("")
    try {
      await api.post("chefs/partner/service/journey/start/", {
        mode: "subscription",
        subscription_id: booking.subscription_id,
        meal: booking.meal,
        service_date: booking.service_date,
      })
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to start journey.")
    } finally {
      setServiceActionLoading("")
    }
  }

  const verifyStartOtp = async (session) => {
    const otp = String(otpInputs?.[`${session.id}:start`] || "").trim()
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter a valid 6-digit start OTP.")
      return
    }
    const key = `start-verify:${session.id}`
    setServiceActionLoading(key)
    setError("")
    try {
      await api.post("chefs/partner/service/start/verify/", {
        service_session_id: session.id,
        otp,
      })
      setOtpInputs((prev) => ({ ...prev, [`${session.id}:start`]: "" }))
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to verify start OTP.")
    } finally {
      setServiceActionLoading("")
    }
  }

  const requestEndOtp = async (session) => {
    const key = `end-request:${session.id}`
    setServiceActionLoading(key)
    setError("")
    try {
      await api.post("chefs/partner/service/end/request/", {
        service_session_id: session.id,
      })
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to generate end OTP.")
    } finally {
      setServiceActionLoading("")
    }
  }

  const verifyEndOtp = async (session) => {
    const otp = String(otpInputs?.[`${session.id}:end`] || "").trim()
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter a valid 6-digit end OTP.")
      return
    }
    const key = `end-verify:${session.id}`
    setServiceActionLoading(key)
    setError("")
    try {
      await api.post("chefs/partner/service/end/verify/", {
        service_session_id: session.id,
        otp,
      })
      setOtpInputs((prev) => ({ ...prev, [`${session.id}:end`]: "" }))
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to verify end OTP.")
    } finally {
      setServiceActionLoading("")
    }
  }

  const toggleSlot = (meal, wave) => {
    setSlotSettings((prev) => {
      const current = Array.isArray(prev?.[meal]) ? prev[meal] : []
      const exists = current.includes(wave)
      let nextMeal
      if (exists) {
        nextMeal = current.filter((item) => item !== wave)
      } else {
        nextMeal = [...current, wave]
      }
      return {
        ...prev,
        [meal]: nextMeal,
      }
    })
  }

  const updateSlotLabel = (meal, wave, value) => {
    setSlotLabels((prev) => ({
      ...prev,
      [meal]: {
        ...(prev?.[meal] || {}),
        [wave]: value,
      },
    }))
  }

  const saveSlotSettings = async () => {
    setSlotSaveLoading(true)
    setError("")
    try {
      const normalized = {}
      const normalizedLabels = {}
      for (const meal of Object.keys(wavesCatalog)) {
        const selected = Array.isArray(slotSettings?.[meal]) ? slotSettings[meal] : []
        const waves = Array.isArray(wavesCatalog?.[meal]) ? wavesCatalog[meal] : []
        normalized[meal] = waves.filter((wave) => selected.includes(wave))
        normalizedLabels[meal] = {}
        for (const wave of waves) {
          normalizedLabels[meal][wave] = String(slotLabels?.[meal]?.[wave] || WAVE_TIME_LABELS?.[meal]?.[wave] || wave).trim()
        }
      }
      await api.post("chefs/partner/slots/", { available_waves: normalized, custom_wave_labels: normalizedLabels })
      await load({ silent: true, force: true })
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to save slot settings.")
    } finally {
      setSlotSaveLoading(false)
    }
  }

  const parseTimeLabelToMinutes = (label) => {
    if (!label || typeof label !== "string" || !label.includes("-")) return null
    const [startRaw, endRaw] = label.split("-").map((s) => s.trim())
    const parsePart = (part) => {
      const clean = String(part || "").toLowerCase()
      const isPm = clean.includes("pm")
      const isAm = clean.includes("am")
      const num = clean.replace("am", "").replace("pm", "").trim()
      const [hRaw, mRaw = "0"] = num.split(":")
      const h = Number(hRaw)
      const m = Number(mRaw)
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null
      let hour = h
      if (isPm && hour < 12) hour += 12
      if (isAm && hour === 12) hour = 0
      if (hour < 0 || hour > 23 || m < 0 || m > 59) return null
      return hour * 60 + m
    }
    const startMin = parsePart(startRaw)
    const endMin = parsePart(endRaw)
    if (startMin === null || endMin === null) return null
    return { startMin, endMin }
  }

  const getDirectionState = (sub) => {
    const startDate = sub?.start_date ? new Date(`${sub.start_date}T00:00:00`) : null
    const endDate = sub?.end_date ? new Date(`${sub.end_date}T23:59:59`) : null
    const nowDate = new Date(nowTs)
    if (!startDate || !endDate || nowDate < startDate || nowDate > endDate) return null

    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes()
    const meals = Array.isArray(sub?.meal_type) ? sub.meal_type : []
    const mealWave = typeof sub?.meal_wave === "object" && sub?.meal_wave ? sub.meal_wave : {}
    let best = null

    for (const mealRaw of meals) {
      const meal = String(mealRaw || "").toLowerCase().trim()
      const wave = String(mealWave?.[meal] || "").toUpperCase().trim()
      if (!meal || !wave) continue
      const label = slotLabels?.[meal]?.[wave] || WAVE_TIME_LABELS?.[meal]?.[wave] || ""
      const parsed = parseTimeLabelToMinutes(label)
      if (!parsed) continue

      const preStart = parsed.startMin - 30
      const activeEnd = parsed.endMin
      if (nowMin < preStart || nowMin > activeEnd) continue

      const startsIn = parsed.startMin - nowMin
      if (!best || startsIn < best.startsIn) {
        best = { meal, wave, label, startsIn }
      }
    }

    return best
  }

  const openDirections = async (sub) => {
    const destLat = Number(sub?.delivery_latitude)
    const destLng = Number(sub?.delivery_longitude)
    if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
      setError("Customer location is missing for this order.")
      return
    }

    const originLat = Number(chef?.latitude)
    const originLng = Number(chef?.longitude)
    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      setError("Chef location is missing. Please update your current location first.")
      return
    }

    const params = new URLSearchParams({
      api: "1",
      origin: `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      travelmode: "driving",
    })
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener,noreferrer")
  }

  const openDirectionsToRequest = (req) => {
    const destLat = Number(req?.request_latitude)
    const destLng = Number(req?.request_longitude)
    if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
      setError("Customer location is missing for this instant request.")
      return
    }
    const originLat = Number(chef?.latitude)
    const originLng = Number(chef?.longitude)
    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      setError("Chef location is missing. Please update your current location first.")
      return
    }

    const params = new URLSearchParams({
      api: "1",
      origin: `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      travelmode: "driving",
    })
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener,noreferrer")
  }

  const openDirectionsToBooking = (booking) => {
    if (!booking) return
    if (booking.mode === "instant") {
      openDirectionsToRequest({
        request_latitude: booking.request_latitude,
        request_longitude: booking.request_longitude,
      })
      return
    }
    openDirections({
      delivery_latitude: booking.delivery_latitude,
      delivery_longitude: booking.delivery_longitude,
    })
  }

  const chef = data?.partner_profile?.chef
  const subscriptions = data?.subscriptions || []
  const instantOffers = data?.pending_instant_offers || []
  const acceptedInstantOrders = data?.accepted_instant_orders || []
  const serviceSessions = data?.service_sessions || []
  const currentBooking = data?.current_booking || null
  const upcomingOrder = data?.upcoming_order || null
  const slotLoad = useMemo(() => {
    const seed = {}
    for (const meal of Object.keys(wavesCatalog)) {
      seed[meal] = {}
      for (const wave of wavesCatalog[meal]) {
        seed[meal][wave] = { count: 0, users: [] }
      }
    }

    for (const sub of subscriptions) {
      const mealType = Array.isArray(sub.meal_type) ? sub.meal_type : []
      const mealWave = typeof sub.meal_wave === "object" && sub.meal_wave ? sub.meal_wave : {}
      for (const rawMeal of mealType) {
        const meal = String(rawMeal || "").toLowerCase().trim()
        if (!wavesCatalog[meal]) continue
        const rawWave = String(mealWave[meal] || "").toUpperCase().trim()
        const wave = wavesCatalog[meal].includes(rawWave) ? rawWave : wavesCatalog[meal][1]
        seed[meal][wave].count += 1
        if (sub.username) seed[meal][wave].users.push(`@${sub.username}`)
      }
    }

    return seed
  }, [subscriptions, wavesCatalog])

  if (loading) {
    return <PageState kind="loading" title="Loading chef partner app" message="Fetching your orders and requests." className="min-h-screen" />
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dff5ee_0%,#f8faf8_40%,#ecf4ef_100%)]">
      <header className="border-b border-[rgba(26,47,38,0.1)] bg-white/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Chefos Partner</p>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">Chef Dashboard</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/chef/history"><Button variant="outline">History</Button></Link>
            <Link to="/"><Button variant="outline">Home</Button></Link>
            <Button variant="secondary" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {error && <PageState kind="error" title="Action required" message={error} />}
        {locationError && <PageState kind="error" title="Location update issue" message={locationError} />}

        <section className="rounded-3xl border border-[rgba(15,122,94,0.15)] bg-[linear-gradient(135deg,#0f7a5e_0%,#1b5f8f_62%,#eea35a_100%)] text-white p-6 md:p-8 shadow-[0_16px_40px_rgba(15,122,94,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/80">Partner Operations</p>
              <h2 className="mt-1 text-2xl md:text-3xl font-semibold">{chef?.name || "Chef"}</h2>
              <p className="mt-1 text-sm text-white/85">Manage live requests, subscription workload, availability and custom slots.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <HeroStat label="Rating" value={chef?.rating ? `⭐ ${chef.rating}` : "-"} />
              <HeroStat label="Subs" value={String(data?.stats?.active_subscriptions || 0)} />
              <HeroStat label="Instant" value={String(data?.stats?.pending_instant_requests || 0)} />
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <Card title="Chef Profile" subtle="Identity">
            <p className="text-xl font-semibold">{chef?.name || "-"}</p>
            <p className="text-sm text-[var(--color-muted)]">⭐ {chef?.rating} • {chef?.speciality}</p>
          </Card>
          <Card title="Subscription Orders" subtle="Current load">
            <p className="text-xl font-semibold">{data?.stats?.active_subscriptions || 0}</p>
          </Card>
          <Card title="Instant Requests" subtle="Pending now">
            <p className="text-xl font-semibold">{data?.stats?.pending_instant_requests || 0}</p>
          </Card>
        </section>

        <section className="panel p-6 border border-[rgba(15,122,94,0.16)] shadow-[0_14px_30px_rgba(20,35,28,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Availability Control</p>
              <p className="mt-1 font-semibold text-[var(--color-text)]">
                {chef?.is_available ? "Available for orders" : "Unavailable"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button loading={locationLoading} variant="outline" onClick={updateLocation}>
                {locationLoading ? "Updating location..." : "Update Current Location"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setLiveLocationEnabled((prev) => !prev)}
              >
                {liveLocationEnabled ? "Live Location: ON" : "Live Location: OFF"}
              </Button>
              <Button loading={availabilityLoading} onClick={toggleAvailability}>
                {chef?.is_available ? "Go Offline" : "Go Online"}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Current coordinates: {chef?.latitude || "-"}, {chef?.longitude || "-"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Last live sync: {lastLocationSyncAt || "Waiting for GPS..."}
          </p>
        </section>

        <section className="panel p-6 border border-[rgba(26,47,38,0.1)] shadow-[0_12px_26px_rgba(20,35,28,0.07)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Instant Orders</h2>
          {!instantOffers.length ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">No instant request assigned right now.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {instantOffers.map((offer) => (
                <div key={offer.offer_id} className="rounded-xl border border-[rgba(15,122,94,0.14)] p-4 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbf9_100%)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--color-text)]">@{offer.username}</p>
                      <p className="text-sm text-[var(--color-muted)]">Distance: {offer.distance_km} km • Expires in {offer.seconds_left || 0}s</p>
                    </div>
                    <div className="flex gap-2">
                      <Button loading={offerLoading === `${offer.request_id}:accept`} onClick={() => respondToOffer(offer.request_id, "accept")}>Accept</Button>
                      <Button variant="outline" loading={offerLoading === `${offer.request_id}:decline`} onClick={() => respondToOffer(offer.request_id, "decline")}>Decline</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {acceptedInstantOrders.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-[var(--color-text)]">Accepted Instant Orders</p>
              <div className="mt-3 grid gap-3">
                {acceptedInstantOrders.map((req) => (
                  <div key={req.request_id} className="rounded-xl border border-[rgba(15,122,94,0.14)] p-4 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbf9_100%)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--color-text)]">@{req.username}</p>
                        <p className="text-xs text-[var(--color-muted)]">Request #{req.request_id}</p>
                      </div>
                      <Button className="h-9 px-3 text-xs" onClick={() => openDirectionsToRequest(req)}>
                        Get Directions
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-6 border border-[rgba(26,47,38,0.1)] shadow-[0_12px_26px_rgba(20,35,28,0.07)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Upcoming Order</h2>
          {!upcomingOrder ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">No upcoming order in the near window.</p>
          ) : (
            <div className="mt-3 rounded-xl border border-[rgba(15,122,94,0.14)] p-4 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbf9_100%)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--color-text)]">
                    @{upcomingOrder.username} • {upcomingOrder.mode === "instant" ? "Instant" : "Subscription"}
                  </p>
                  {upcomingOrder.mode === "subscription" ? (
                    <p className="text-xs text-[var(--color-muted)] capitalize">
                      {upcomingOrder.meal} {upcomingOrder.wave ? `• ${upcomingOrder.wave}` : ""} {upcomingOrder.slot_label ? `• ${upcomingOrder.slot_label}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--color-muted)]">Request #{upcomingOrder.request_id}</p>
                  )}
                </div>
                {typeof upcomingOrder.starts_in_minutes === "number" ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
                    Starts in {upcomingOrder.starts_in_minutes} min
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Menu: {upcomingOrder.menu_item || "Menu will be shown soon"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="h-9 px-3 text-xs" onClick={() => openDirectionsToBooking(upcomingOrder)}>
                  Get Directions
                </Button>
                {upcomingOrder.mode === "subscription" && !upcomingOrder.journey_started ? (
                  <Button
                    className="h-9 px-3 text-xs"
                    loading={serviceActionLoading === `journey-start:${upcomingOrder.subscription_id}:${upcomingOrder.meal}`}
                    onClick={() => startJourneyForBooking(upcomingOrder)}
                  >
                    Start Journey
                  </Button>
                ) : null}
                {upcomingOrder.can_start_otp_now ? (
                  <Button
                    className="h-9 px-3 text-xs"
                    loading={
                      serviceActionLoading ===
                      (upcomingOrder.mode === "instant"
                        ? `start-request:instant:${upcomingOrder.request_id}`
                        : `start-request:sub:${upcomingOrder.subscription_id}:${upcomingOrder.meal}`)
                    }
                    onClick={() =>
                      upcomingOrder.mode === "instant"
                        ? requestStartOtpForInstant(upcomingOrder.request_id)
                        : requestStartOtpForSubscription(upcomingOrder.subscription_id, upcomingOrder.meal)
                    }
                  >
                    Start Service
                  </Button>
                ) : null}
              </div>
              {upcomingOrder.journey_started ? (
                <p className="mt-2 text-xs font-semibold text-[#0b654f]">
                  Journey started{upcomingOrder.journey_started_at ? ` at ${new Date(upcomingOrder.journey_started_at).toLocaleTimeString()}` : ""}.
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section className="panel p-6 border border-[rgba(26,47,38,0.1)] shadow-[0_12px_26px_rgba(20,35,28,0.07)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Service OTP Verification</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Start and complete service with customer OTP verification.</p>
          {currentBooking?.can_start_otp_now ? (
            <div className="mt-4 rounded-xl border border-[rgba(15,122,94,0.12)] bg-[rgba(15,122,94,0.04)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">Current Booking</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--color-text)]">
                  @{currentBooking.username} {currentBooking.mode === "subscription" ? `• ${currentBooking.meal}` : "• Instant"}
                </p>
                <Button
                  className="h-9 px-3 text-xs"
                  loading={
                    serviceActionLoading ===
                    (currentBooking.mode === "instant"
                      ? `start-request:instant:${currentBooking.request_id}`
                      : `start-request:sub:${currentBooking.subscription_id}:${currentBooking.meal}`)
                  }
                  onClick={() =>
                    currentBooking.mode === "instant"
                      ? requestStartOtpForInstant(currentBooking.request_id)
                      : requestStartOtpForSubscription(currentBooking.subscription_id, currentBooking.meal)
                  }
                >
                  Generate Start OTP
                </Button>
              </div>
            </div>
          ) : null}
          {!serviceSessions.length ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">No active service session at the moment.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {serviceSessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-[rgba(15,122,94,0.14)] p-4 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbf9_100%)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--color-text)]">
                        @{session.username} • {session.mode === "instant" ? "Instant" : "Subscription"}
                      </p>
                      <p className="text-xs text-[var(--color-muted)] capitalize">
                        {session.mode === "subscription" ? `${session.meal || "-"} ${session.wave ? `• ${session.wave}` : ""} • ${session.service_date || "-"}` : `Request #${session.instant_request_id || "-"}`}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.08em] px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
                      {String(session.status || "").replaceAll("_", " ")}
                    </span>
                  </div>

                  {session.status === "assigned" && currentBooking?.service_session_id === session.id ? (
                    <div className="mt-3">
                      <Button
                        className="h-9 px-3 text-xs"
                        loading={serviceActionLoading === `start-request:${session.id}`}
                        onClick={() => requestStartOtp(session)}
                      >
                        Generate Start OTP
                      </Button>
                    </div>
                  ) : null}

                  {session.status === "start_otp_generated" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={otpInputs?.[`${session.id}:start`] || ""}
                        onChange={(e) => setOtpInputs((prev) => ({ ...prev, [`${session.id}:start`]: e.target.value }))}
                        maxLength={6}
                        placeholder="Enter 6-digit start OTP"
                        className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-sm w-[220px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                      <Button
                        className="h-9 px-3 text-xs"
                        loading={serviceActionLoading === `start-verify:${session.id}`}
                        onClick={() => verifyStartOtp(session)}
                      >
                        Verify & Start
                      </Button>
                    </div>
                  ) : null}

                  {session.status === "in_progress" ? (
                    <div className="mt-3">
                      <Button
                        className="h-9 px-3 text-xs"
                        loading={serviceActionLoading === `end-request:${session.id}`}
                        onClick={() => requestEndOtp(session)}
                      >
                        Generate End OTP
                      </Button>
                    </div>
                  ) : null}

                  {session.status === "end_otp_generated" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={otpInputs?.[`${session.id}:end`] || ""}
                        onChange={(e) => setOtpInputs((prev) => ({ ...prev, [`${session.id}:end`]: e.target.value }))}
                        maxLength={6}
                        placeholder="Enter 6-digit end OTP"
                        className="h-9 rounded-lg border border-[var(--color-border)] px-3 text-sm w-[220px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                      <Button
                        className="h-9 px-3 text-xs"
                        loading={serviceActionLoading === `end-verify:${session.id}`}
                        onClick={() => verifyEndOtp(session)}
                      >
                        Verify & Complete
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel p-6 border border-[rgba(26,47,38,0.1)] shadow-[0_12px_26px_rgba(20,35,28,0.07)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Subscription Orders</h2>
          {!subscriptions.length ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">No active subscription order assigned yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <th className="pb-2 pr-3">User</th>
                    <th className="pb-2 pr-3">Meals</th>
                    <th className="pb-2 pr-3">Period</th>
                    <th className="pb-2 pr-3">Price</th>
                    <th className="pb-2 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="border-b border-[var(--color-border)] align-top">
                      <td className="py-2 pr-3 font-medium">@{sub.username}</td>
                      <td className="py-2 pr-3 capitalize">{Array.isArray(sub.meal_type) ? sub.meal_type.join(", ") : "-"}</td>
                      <td className="py-2 pr-3">{sub.start_date} to {sub.end_date}</td>
                      <td className="py-2 pr-3">Rs {sub.price}</td>
                      <td className="py-2 pr-3">
                        {(() => {
                          const dirState = getDirectionState(sub)
                          if (!dirState) {
                            return <span className="text-xs text-[var(--color-muted)]">Available 30 min before slot</span>
                          }
                          return (
                            <div className="flex flex-col gap-1">
                              <Button
                                className="h-9 px-3 text-xs"
                                onClick={() => openDirections(sub)}
                              >
                                Get Directions
                              </Button>
                              <span className="text-[11px] text-[var(--color-muted)] capitalize">
                                {dirState.meal} {dirState.wave} ({dirState.label})
                              </span>
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel p-6 border border-[rgba(26,47,38,0.1)] shadow-[0_12px_26px_rgba(20,35,28,0.07)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">My Time Slots</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Enable only the slots you want to accept for new subscriptions.</p>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            {Object.keys(wavesCatalog).map((meal) => (
              <div key={meal} className="rounded-2xl border border-[rgba(26,47,38,0.14)] bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{meal}</p>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-cream)] text-[var(--color-muted)] border border-[var(--color-border)]">
                    {wavesCatalog[meal].length} slots
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  {wavesCatalog[meal].map((wave) => {
                    const info = slotLoad?.[meal]?.[wave] || { count: 0, users: [] }
                    return (
                      <div key={wave} className="rounded-xl border border-[var(--color-border)] px-3 py-3 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf9_100%)]">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-text)]">
                            {wave}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSlot(meal, wave)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border transition ${
                              Array.isArray(slotSettings?.[meal]) && slotSettings[meal].includes(wave)
                                ? "bg-[#eaf8f3] text-[#0b654f] border-[#b7e8cf]"
                                : "bg-[#f7f7f7] text-[#6b7280] border-[#e5e7eb]"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                Array.isArray(slotSettings?.[meal]) && slotSettings[meal].includes(wave)
                                  ? "bg-[#0b654f]"
                                  : "bg-[#9ca3af]"
                              }`}
                            />
                            {Array.isArray(slotSettings?.[meal]) && slotSettings[meal].includes(wave) ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={slotLabels?.[meal]?.[wave] || WAVE_TIME_LABELS?.[meal]?.[wave] || wave}
                          onChange={(e) => updateSlotLabel(meal, wave, e.target.value)}
                          className="w-full text-xs text-[var(--color-text)] px-2.5 py-2 rounded-lg border border-[var(--color-border)]"
                          placeholder={WAVE_TIME_LABELS?.[meal]?.[wave] || wave}
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-[var(--color-text)]">
                            {info.count} active {info.count === 1 ? "order" : "orders"}
                          </p>
                        </div>
                        {info.users.length > 0 && (
                          <p className="mt-1 text-[11px] text-[var(--color-muted)] truncate">{info.users.join(", ")}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button loading={slotSaveLoading} onClick={saveSlotSettings}>
              {slotSaveLoading ? "Saving slots..." : "Save Slot Settings"}
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="panel p-5 border border-[rgba(26,47,38,0.1)] shadow-[0_10px_22px_rgba(20,35,28,0.06)]">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function HeroStat({ label, value }) {
  return (
    <div className="min-w-[88px] rounded-xl bg-white/16 border border-white/30 px-3 py-2 text-center backdrop-blur">
      <p className="text-[10px] uppercase tracking-[0.12em] text-white/80">{label}</p>
      <p className="text-base font-semibold text-white">{value}</p>
    </div>
  )
}
