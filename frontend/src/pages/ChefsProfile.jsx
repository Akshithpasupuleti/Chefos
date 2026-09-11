import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"

const WAVE_OPTIONS = {
  breakfast: ["B1", "B2", "B3"],
  lunch: ["L1", "L2", "L3"],
  dinner: ["D1", "D2", "D3"],
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

export default function ChefProfile() {
  const navigate = useNavigate()
  const [chef, setChef] = useState(null)
  const [loading, setLoading] = useState(true)

  const [meal, setMeal] = useState("dinner")
  const [wave, setWave] = useState("D2")
  const [instantReq, setInstantReq] = useState(null)
  const [instantLoading, setInstantLoading] = useState(false)
  const [instantError, setInstantError] = useState("")

  useEffect(() => {
    api.get("chefs/assigned/")
      .then((res) => setChef(res.data.chef))
      .catch(() => setChef(null))
      .finally(() => setLoading(false))

    api.get("chefs/instant/request/latest/")
      .then((res) => setInstantReq(res.data))
      .catch(() => setInstantReq(null))
  }, [])

  useEffect(() => {
    const waves = WAVE_OPTIONS[meal] || []
    setWave(waves[1] || waves[0] || "")
  }, [meal])

  useEffect(() => {
    if (!instantReq?.id || instantReq?.status !== "searching") return undefined

    const poll = () => {
      api.get(`chefs/instant/request/${instantReq.id}/`)
        .then((res) => {
          setInstantReq(res.data)
          if (res.data?.status === "accepted") {
            setChef((prev) => (res.data?.accepted_chef ? { ...(prev || {}), id: res.data.accepted_chef.chef_id, name: res.data.accepted_chef.chef_name } : prev))
          }
        })
        .catch(() => {
          // ignore poll hiccups and keep trying
        })
    }

    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [instantReq?.id, instantReq?.status])

  const currentOffer = instantReq?.current_offer
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
      const payload = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        meal,
        wave,
      }
      const res = await api.post("chefs/instant/request/", payload)
      setInstantReq(res.data)
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.message || "Unable to request instant chef"
      setInstantError(msg)
    } finally {
      setInstantLoading(false)
    }
  }

  const cancelInstantChef = () => {
    if (!instantReq?.id) return
    setInstantLoading(true)
    api.delete(`chefs/instant/request/${instantReq.id}/`)
      .then((res) => setInstantReq(res.data))
      .catch((error) => setInstantError(error?.response?.data?.detail || "Unable to cancel request"))
      .finally(() => setInstantLoading(false))
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)]">
      <AppNavbar />

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <section className="bg-white rounded-2xl p-6 border border-[rgba(0,0,0,0.06)] shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
          <h2 className="text-xl font-semibold">Instant Chef (On-demand)</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Nearby chefs are contacted one-by-one. Each chef gets 1 minute to accept, then request moves to next nearest chef.
          </p>

          <div className="mt-4 grid md:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Meal</span>
              <select
                value={meal}
                onChange={(e) => setMeal(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--color-border)] px-3 py-2"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Slot</span>
              <select
                value={wave}
                onChange={(e) => setWave(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--color-border)] px-3 py-2"
              >
                {(WAVE_OPTIONS[meal] || []).map((slot) => (
                  <option key={slot} value={slot}>{WAVE_TIME_LABELS?.[meal]?.[slot] || slot}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <Button loading={instantLoading} onClick={requestInstantChef}>Request Instant Chef</Button>
              {instantReq?.status === "searching" ? (
                <Button variant="outline" onClick={cancelInstantChef}>Cancel</Button>
              ) : null}
            </div>
          </div>

          {instantError ? (
            <p className="mt-3 text-sm text-red-600">{instantError}</p>
          ) : null}

          {instantReq ? (
            <div className="mt-5 rounded-xl border border-[rgba(0,0,0,0.08)] p-4 bg-[var(--color-cream)]">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>Request #{instantReq.id}</Badge>
                <Badge>Status: {toTitle(instantReq.status)}</Badge>
                <Badge>Meal: {toTitle(instantReq.meal || "-")}</Badge>
                <Badge>Time: {WAVE_TIME_LABELS?.[instantReq.meal]?.[instantReq.wave] || "-"}</Badge>
              </div>

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

              {instantReq?.accepted_chef ? (
                <p className="mt-4 text-sm text-green-700 font-medium">
                  Accepted by {instantReq.accepted_chef.chef_name} ({instantReq.accepted_chef.distance_km} km)
                </p>
              ) : null}

              <div className="mt-4 space-y-2 max-h-64 overflow-auto pr-1">
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

        {loading ? (
          <PageState kind="loading" title="Loading chef profile" message="Fetching your currently assigned chef." />
        ) : !chef ? (
          <PageState
            kind="empty"
            title="No chef assigned"
            message="Pick a chef to continue with your subscription flow."
            actionLabel="Find Chef"
            onAction={() => navigate("/find-chef")}
          />
        ) : (
          <div className="bg-white rounded-2xl p-8 border border-[rgba(0,0,0,0.06)] shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col md:flex-row gap-8">
              <div className="w-40 h-40 rounded-2xl bg-[var(--color-primary)] text-white flex items-center justify-center text-5xl font-semibold">
                {chef.name?.[0] || "C"}
              </div>

              <div className="flex-1">
                <h1 className="text-2xl font-medium">{chef.name}</h1>
                <p className="mt-1 text-[var(--color-muted)]">{chef.speciality || "Chef"}</p>

                <div className="mt-4 flex gap-4 text-sm">
                  {chef.rating ? <Badge>⭐ {chef.rating} rating</Badge> : null}
                  {typeof chef.is_available === "boolean" ? <Badge>{chef.is_available ? "Available" : "Unavailable"}</Badge> : null}
                </div>

                <p className="mt-4 text-sm text-[var(--color-muted)] max-w-lg">
                  Your assigned chef details are synced with backend data.
                </p>

                <div className="mt-6 flex gap-4">
                  <Button onClick={() => navigate("/confirm")}>Continue</Button>
                  <Button variant="outline" onClick={() => navigate("/find-chef")}>Change Chef</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Badge({ children }) {
  return <span className="bg-[var(--color-cream)] px-3 py-1 rounded-full text-xs font-medium">{children}</span>
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
