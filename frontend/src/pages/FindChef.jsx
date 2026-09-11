import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import L from "leaflet"
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"

const RADIUS_KM = 5

const chefIcon = L.divIcon({
  className: "chef-map-icon",
  html: '<div style="width:34px;height:34px;border-radius:999px;background:#ffffff;border:2px solid #0f7a5e;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 6px 14px rgba(0,0,0,.2)">👨‍🍳</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -30],
})

const userIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  iconRetinaUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function readPlan() {
  try {
    const raw = localStorage.getItem("subscription_plan")
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function FindChef() {
  const navigate = useNavigate()
  const [chefs, setChefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [assigningId, setAssigningId] = useState(null)
  const [error, setError] = useState("")
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState("Locating you...")
  const [selectedSlots, setSelectedSlots] = useState({})

  const [instantReq, setInstantReq] = useState(null)
  const [instantLoading, setInstantLoading] = useState(false)
  const [instantError, setInstantError] = useState("")
  const [activeSubscription, setActiveSubscription] = useState(null)

  const plan = readPlan()
  const selectedMeals = useMemo(() => {
    if (Array.isArray(activeSubscription?.meal_type) && activeSubscription.meal_type.length) return activeSubscription.meal_type
    if (Array.isArray(plan?.selected_meals) && plan.selected_meals.length) return plan.selected_meals
    return []
  }, [plan?.selected_meals, activeSubscription?.meal_type])
  const planCycle = useMemo(() => {
    if (plan?.plan_cycle) return plan.plan_cycle
    if (activeSubscription?.start_date && activeSubscription?.end_date) {
      const start = new Date(activeSubscription.start_date)
      const end = new Date(activeSubscription.end_date)
      const days = Math.round((end - start) / (1000 * 60 * 60 * 24))
      return days <= 8 ? "weekly" : "monthly"
    }
    return "monthly"
  }, [plan?.plan_cycle, activeSubscription?.start_date, activeSubscription?.end_date])
  const preferredMealWave = useMemo(() => {
    const fromPlan = plan?.meal_wave
    if (fromPlan && typeof fromPlan === "object") return fromPlan
    const fromSubscription = activeSubscription?.meal_wave
    if (fromSubscription && typeof fromSubscription === "object") return fromSubscription
    return {}
  }, [plan?.meal_wave, activeSubscription?.meal_wave])

  const load = (location = userLocation) => {
    setLoading(true)
    setError("")

    const params = {}
    if (location?.lat && location?.lng) {
      params.lat = location.lat
      params.lng = location.lng
      params.radius_km = RADIUS_KM
    }
    if (selectedMeals.length) {
      params.selected_meals = selectedMeals.join(",")
      params.plan_cycle = planCycle
    }

    api.get("chefs/", { params })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : []
        setChefs(list)
        const next = {}
        for (const chef of list) {
          const m = {}
          for (const meal of selectedMeals) {
            const options = chef?.available_slots?.[meal] || []
            if (!options.length) continue
            const preferredWave = String(preferredMealWave?.[meal] || "").toUpperCase()
            const preferredOption = options.find((opt) => String(opt.wave).toUpperCase() === preferredWave)
            m[meal] = preferredOption ? preferredOption.wave : options[0].wave
          }
          next[chef.id] = m
        }
        setSelectedSlots(next)
      })
      .catch(() => setError("Failed to load nearby chefs."))
      .finally(() => setLoading(false))
  }

  const locateAndLoad = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Geolocation is not supported in this browser.")
      load(null)
      return
    }

    setLocationStatus("Detecting your current location...")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        }
        setUserLocation(loc)
        setLocationStatus(`Showing chefs within ${RADIUS_KM} km`)
        load(loc)
      },
      () => {
        setLocationStatus("Location blocked. Showing all available chefs.")
        load(null)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    )
  }

  useEffect(() => {
    locateAndLoad()
    api.get("subscription/active/")
      .then((res) => setActiveSubscription(res.data))
      .catch(() => setActiveSubscription(null))
    api.get("chefs/instant/request/latest/")
      .then((res) => setInstantReq(res.data))
      .catch(() => setInstantReq(null))
  }, [])

  useEffect(() => {
    // Reload chefs when meal/cycle context changes (e.g., changing chef for existing subscription).
    if (selectedMeals.length) load()
  }, [selectedMeals.join(","), planCycle])

  useEffect(() => {
    if (!instantReq?.id || !["searching", "accepted"].includes(instantReq?.status)) return undefined

    const poll = () => {
      api.get(`chefs/instant/request/${instantReq.id}/`)
        .then((res) => setInstantReq(res.data))
        .catch(() => {})
    }

    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [instantReq?.id, instantReq?.status])

  const chefMarkers = useMemo(
    () => chefs.filter((chef) => chef.latitude !== null && chef.longitude !== null),
    [chefs]
  )

  const currentOffer = instantReq?.current_offer
  const acceptedChef = instantReq?.accepted_chef
  const serviceSession = instantReq?.service_session
  const trackingData = useMemo(() => {
    if (!acceptedChef || instantReq?.status !== "accepted") return null
    const chefLat = Number(acceptedChef?.latitude)
    const chefLng = Number(acceptedChef?.longitude)
    const userLat = Number(instantReq?.request_latitude)
    const userLng = Number(instantReq?.request_longitude)
    if (![chefLat, chefLng, userLat, userLng].every(Number.isFinite)) return null
    const distanceKm = haversineKm(chefLat, chefLng, userLat, userLng)
    const etaMin = Math.max(2, Math.round((distanceKm / 22) * 60)) // ~22km/h city average
    return {
      chefLat,
      chefLng,
      userLat,
      userLng,
      distanceKm: Number(distanceKm.toFixed(2)),
      etaMin,
    }
  }, [acceptedChef, instantReq?.request_latitude, instantReq?.request_longitude, instantReq?.status])
  const progress = useMemo(() => {
    const secondsLeft = Number(currentOffer?.seconds_left)
    if (!Number.isFinite(secondsLeft)) return 0
    return Math.max(0, Math.min(100, (secondsLeft / 60) * 100))
  }, [currentOffer?.seconds_left])

  const requestInstantChef = async () => {
    setInstantLoading(true)
    setInstantError("")
    try {
      const coords = await getCurrentLocation()
      const res = await api.post("chefs/instant/request/", {
        latitude: coords.latitude,
        longitude: coords.longitude,
      })
      setInstantReq(res.data)
    } catch (err) {
      setInstantError(err?.response?.data?.detail || err?.message || "Unable to request instant chef")
    } finally {
      setInstantLoading(false)
    }
  }

  const cancelInstantChef = () => {
    if (!instantReq?.id) return
    setInstantLoading(true)
    api.delete(`chefs/instant/request/${instantReq.id}/`)
      .then((res) => setInstantReq(res.data))
      .catch((err) => setInstantError(err?.response?.data?.detail || "Unable to cancel request"))
      .finally(() => setInstantLoading(false))
  }

  const trackAcceptedChef = () => {
    const chefLat = Number(acceptedChef?.latitude)
    const chefLng = Number(acceptedChef?.longitude)
    const userLat = Number(instantReq?.request_latitude)
    const userLng = Number(instantReq?.request_longitude)
    if (!Number.isFinite(chefLat) || !Number.isFinite(chefLng)) {
      setInstantError("Chef location is not available yet. Ask chef to update location.")
      return
    }
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      setInstantError("Your request location is not available.")
      return
    }
    const params = new URLSearchParams({
      api: "1",
      origin: `${chefLat},${chefLng}`,
      destination: `${userLat},${userLng}`,
      travelmode: "driving",
    })
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener,noreferrer")
  }

  const handleAssign = async (chefId) => {
    setAssigningId(chefId)
    setError("")
    try {
      await api.post("chefs/assign/", { chef_id: chefId })
      const existing = readPlan() || {}
      const merged = {
        ...existing,
        selected_meals: selectedMeals.length ? selectedMeals : existing.selected_meals || [],
        plan_cycle: planCycle,
        meal_wave: {
          ...(existing.meal_wave || {}),
          ...(selectedSlots[chefId] || {}),
        },
      }
      localStorage.setItem("subscription_plan", JSON.stringify(merged))
      navigate("/confirm")
    } catch {
      setError("Could not assign chef. Try again.")
    } finally {
      setAssigningId(null)
    }
  }

  return (
    <div className="page-shell">
      <AppNavbar />

      <main className="page-container py-8 md:py-10">
        <section className="panel p-6 md:p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Nearby chefs</p>
              <h1 className="serif-title mt-1 text-3xl md:text-4xl text-[var(--color-text)]">Find chefs near your current location</h1>
              <p className="mt-2 text-sm md:text-base text-[var(--color-muted)]">Only chefs within {RADIUS_KM} km are shown when location is available.</p>
              <p className="mt-2 text-xs font-semibold text-[var(--color-primary)]">{locationStatus}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => load()}>Refresh</Button>
              <Button variant="secondary" onClick={locateAndLoad}>Use My Location</Button>
            </div>
          </div>
        </section>

        <section className="mt-6 panel p-6">
          <h2 className="text-lg font-semibold">Instant Chef (On-demand)</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Nearest chefs are notified one by one. Each chef gets 1 minute to accept, then request moves to next chef.</p>

          <div className="mt-4 flex items-center gap-2">
              <Button loading={instantLoading} onClick={requestInstantChef}>Request Instant Chef</Button>
              {instantReq?.status === "searching" ? <Button variant="outline" onClick={cancelInstantChef}>Cancel</Button> : null}
          </div>

          {instantError ? <p className="mt-3 text-sm text-red-600">{instantError}</p> : null}

          {instantReq ? (
            <div className="mt-4 rounded-xl border border-[rgba(0,0,0,0.08)] p-4 bg-[var(--color-cream)]">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>Request #{instantReq.id}</Badge>
                <Badge>Status: {toTitle(instantReq.status)}</Badge>
              </div>
              <p className="mt-3 text-sm text-[var(--color-muted)]">{instantReq?.status_message || "Checking nearby chefs..."}</p>

              {currentOffer ? (
                <div className="mt-4">
                  <p className="text-sm font-medium">
                    Offering now: <span className="text-[var(--color-primary)]">{currentOffer.chef_name}</span>
                    {typeof currentOffer.seconds_left === "number" ? ` (${currentOffer.seconds_left}s left)` : ""}
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-white overflow-hidden border border-[rgba(0,0,0,0.08)]">
                    <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}

              {instantReq?.status === "accepted" && acceptedChef ? (
                <div className="mt-4 rounded-lg border border-[rgba(15,122,94,0.2)] bg-white px-3 py-3">
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    Chef accepted: <span className="text-[var(--color-primary)]">{acceptedChef.chef_name}</span>
                  </p>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    Live distance: {trackingData?.distanceKm ?? acceptedChef.distance_km} km
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    ETA: {trackingData?.etaMin ?? "--"} mins
                  </p>
                  {trackingData && trackingData.distanceKm <= 0.2 ? (
                    <p className="mt-1 text-xs font-semibold text-[#0b654f]">Chef is near to your doorstep.</p>
                  ) : null}
                  <div className="mt-2">
                    <Button className="h-9 px-3 text-xs" onClick={trackAcceptedChef}>Track Chef</Button>
                  </div>

                  {trackingData ? (
                    <div className="mt-3 rounded-lg overflow-hidden border border-[var(--color-border)]">
                      <MapContainer
                        center={[trackingData.userLat, trackingData.userLng]}
                        zoom={14}
                        scrollWheelZoom={false}
                        className="h-[240px] w-full"
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <TrackingMapFit trackingData={trackingData} />
                        <Polyline
                          positions={[
                            [trackingData.chefLat, trackingData.chefLng],
                            [trackingData.userLat, trackingData.userLng],
                          ]}
                          pathOptions={{ color: "#0f7a5e", weight: 4 }}
                        />
                        <Marker position={[trackingData.chefLat, trackingData.chefLng]} icon={chefIcon}>
                          <Popup>Chef location</Popup>
                        </Marker>
                        <Marker position={[trackingData.userLat, trackingData.userLng]} icon={userIcon}>
                          <Popup>Your location</Popup>
                        </Marker>
                      </MapContainer>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--color-muted)]">Waiting for live chef coordinates...</p>
                  )}

                  {serviceSession ? (
                    <div className="mt-3 rounded-lg border border-[rgba(15,122,94,0.2)] bg-[linear-gradient(165deg,#f3fbf7_0%,#f9fffd_100%)] p-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Service OTP</p>
                      {serviceSession?.status === "start_otp_generated" ? (
                        <>
                          <p className="mt-1 text-xs text-[var(--color-muted)]">Chef requested start OTP</p>
                          <p className="mt-1 text-xl font-bold tracking-[0.2em] text-[#0b654f]">{serviceSession?.start_otp || "-"}</p>
                        </>
                      ) : null}
                      {serviceSession?.status === "in_progress" ? (
                        <p className="mt-1 text-xs text-[var(--color-muted)]">Service has started. End OTP will be generated on completion.</p>
                      ) : null}
                      {serviceSession?.status === "end_otp_generated" ? (
                        <>
                          <p className="mt-1 text-xs text-[var(--color-muted)]">Chef requested end OTP</p>
                          <p className="mt-1 text-xl font-bold tracking-[0.2em] text-[#0b654f]">{serviceSession?.end_otp || "-"}</p>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 space-y-2 max-h-56 overflow-auto pr-1">
                {instantReq.offers?.map((offer) => (
                  <div key={offer.id} className="rounded-lg bg-white border border-[rgba(0,0,0,0.06)] px-3 py-2 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{offer.rank}. {offer.chef_name}</p>
                      <p className="text-xs text-[var(--color-muted)]">{offer.distance_km} km away</p>
                    </div>
                    <Badge>{toTitle(offer.status)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 panel overflow-hidden">
          {userLocation ? (
            <div className="relative">
              <MapContainer center={[userLocation.lat, userLocation.lng]} zoom={13} scrollWheelZoom className="h-[360px] w-full">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter userLocation={userLocation} />
                <Circle center={[userLocation.lat, userLocation.lng]} radius={RADIUS_KM * 1000} pathOptions={{ color: "#0f7a5e", fillOpacity: 0.1 }} />

                <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                  <Popup>Your current location</Popup>
                </Marker>

                {chefMarkers.map((chef) => (
                  <Marker key={chef.id} position={[Number(chef.latitude), Number(chef.longitude)]} icon={chefIcon}>
                    <Popup>
                      <div>
                        <p className="font-semibold">{chef.name}</p>
                        <p>{chef.speciality}</p>
                        {chef.distance_km !== null && chef.distance_km !== undefined ? <p>{chef.distance_km} km away</p> : null}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>

              <button
                type="button"
                onClick={locateAndLoad}
                className="absolute top-3 right-3 z-[500] bg-white/95 border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow"
              >
                Recenter
              </button>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm text-[var(--color-muted)] bg-[var(--color-cream)]">
              Enable location to view nearby chefs on map.
            </div>
          )}
        </section>

        <section className="mt-6">
          {loading && <PageState kind="loading" title="Loading chefs" message="Finding chefs near you." />}

          {!loading && error && <PageState kind="error" title="Could not load chefs" message={error} actionLabel="Retry" onAction={() => load()} />}

          {!loading && !error && chefs.length === 0 && (
            <PageState
              kind="empty"
              title="No chefs found nearby"
              message={`Try moving location or check again later. We currently show chefs up to ${RADIUS_KM} km.`}
            />
          )}

          {!loading && !error && chefs.length > 0 && (
            <div className="grid md:grid-cols-3 gap-6">
              {chefs.map((chef) => (
                <ChefCard
                  key={chef.id}
                  chef={chef}
                  selectedMeals={selectedMeals}
                  selectedWave={selectedSlots[chef.id] || {}}
                  onWaveChange={(meal, wave) =>
                    setSelectedSlots((prev) => ({
                      ...prev,
                      [chef.id]: {
                        ...(prev[chef.id] || {}),
                        [meal]: wave,
                      },
                    }))
                  }
                  assigning={assigningId === chef.id}
                  onAssign={() => handleAssign(chef.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function ChefCard({ chef, selectedMeals, selectedWave, onWaveChange, assigning, onAssign }) {
  return (
    <div className="panel p-6 flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-white font-medium">
          {chef.name?.[0] || "C"}
        </div>

        <div>
          <h3 className="font-medium">{chef.name}</h3>
          <p className="text-sm text-[var(--color-muted)]">⭐ {chef.rating} • {chef.speciality}</p>
          {chef.distance_km !== null && chef.distance_km !== undefined ? (
            <p className="text-xs mt-1 text-[var(--color-primary)] font-semibold">{chef.distance_km} km away</p>
          ) : null}
        </div>
      </div>

      {selectedMeals.length > 0 ? (
        <div className="space-y-3 mb-4">
          {selectedMeals.map((meal) => {
            const options = chef?.available_slots?.[meal] || []
            return (
              <div key={`${chef.id}-${meal}`}>
                <p className="text-xs text-[var(--color-muted)] capitalize mb-1">{meal} slot</p>
                {options.length ? (
                  <select
                    value={selectedWave?.[meal] || options[0].wave}
                    onChange={(e) => onWaveChange(meal, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    {options.map((slot) => (
                      <option key={slot.wave} value={slot.wave}>
                        {slot.time}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-red-600">No available slot</p>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="mt-auto">
        <Button
          className="w-full"
          onClick={onAssign}
          loading={assigning}
          disabled={selectedMeals.some((meal) => !(chef?.available_slots?.[meal] || []).length)}
        >
          {assigning ? "Assigning..." : "Select Chef"}
        </Button>
      </div>
    </div>
  )
}

function MapRecenter({ userLocation }) {
  const map = useMap()

  useEffect(() => {
    if (!userLocation) return
    map.setView([userLocation.lat, userLocation.lng], map.getZoom(), { animate: true })
  }, [map, userLocation])

  return null
}

function TrackingMapFit({ trackingData }) {
  const map = useMap()

  useEffect(() => {
    if (!trackingData) return
    const bounds = L.latLngBounds(
      [trackingData.chefLat, trackingData.chefLng],
      [trackingData.userLat, trackingData.userLng]
    )
    map.fitBounds(bounds, { padding: [40, 40], animate: true })
  }, [map, trackingData])

  return null
}

function Badge({ children }) {
  return <span className="bg-white px-3 py-1 rounded-full text-xs font-medium border border-[var(--color-border)]">{children}</span>
}

function toTitle(value) {
  const text = String(value || "")
  if (!text) return "-"
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err?.message || "Location permission denied")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
  })
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
