import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"

const STORAGE_KEY = "chef_console_id"

export default function ChefConsole() {
  const [chefs, setChefs] = useState([])
  const [selectedChefId, setSelectedChefId] = useState(localStorage.getItem(STORAGE_KEY) || "")
  const [dashboard, setDashboard] = useState(null)
  const [loadingChefs, setLoadingChefs] = useState(true)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [updatingAvailability, setUpdatingAvailability] = useState(false)
  const [offerActionLoading, setOfferActionLoading] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    const loadChefs = async () => {
      setLoadingChefs(true)
      setError("")
      try {
        const res = await api.get("chefs/console/chefs/")
        if (cancelled) return
        const items = Array.isArray(res?.data) ? res.data : []
        setChefs(items)
        if (!selectedChefId && items.length) {
          const id = String(items[0].id)
          setSelectedChefId(id)
          localStorage.setItem(STORAGE_KEY, id)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || "Unable to load chefs.")
        }
      } finally {
        if (!cancelled) setLoadingChefs(false)
      }
    }
    loadChefs()
    return () => {
      cancelled = true
    }
  }, [selectedChefId])

  useEffect(() => {
    if (!selectedChefId) {
      setDashboard(null)
      return
    }

    let cancelled = false
    const loadDashboard = async ({ silent = false } = {}) => {
      if (!silent) setLoadingDashboard(true)
      try {
        const res = await api.get("chefs/console/dashboard/", { params: { chef_id: selectedChefId } })
        if (!cancelled) setDashboard(res?.data || null)
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.detail || "Unable to load chef dashboard.")
      } finally {
        if (!cancelled && !silent) setLoadingDashboard(false)
      }
    }

    loadDashboard()
    const timer = setInterval(() => loadDashboard({ silent: true }), 20000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selectedChefId])

  const activeChef = useMemo(
    () => chefs.find((item) => String(item.id) === String(selectedChefId)) || null,
    [chefs, selectedChefId]
  )

  const handleChefChange = (event) => {
    const value = event.target.value
    setSelectedChefId(value)
    localStorage.setItem(STORAGE_KEY, value)
    setError("")
  }

  const toggleAvailability = async () => {
    if (!dashboard?.chef?.id) return
    setUpdatingAvailability(true)
    setError("")
    try {
      await api.post("chefs/console/availability/", {
        chef_id: dashboard.chef.id,
        is_available: !dashboard.chef.is_available,
      })
      const res = await api.get("chefs/console/dashboard/", { params: { chef_id: dashboard.chef.id } })
      setDashboard(res?.data || null)
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to update availability.")
    } finally {
      setUpdatingAvailability(false)
    }
  }

  const respondToOffer = async (requestId, action) => {
    if (!dashboard?.chef?.id) return
    const key = `${requestId}:${action}`
    setOfferActionLoading(key)
    setError("")
    try {
      await api.post(`chefs/instant/request/${requestId}/respond/`, {
        chef_id: dashboard.chef.id,
        action,
      })
      const res = await api.get("chefs/console/dashboard/", { params: { chef_id: dashboard.chef.id } })
      setDashboard(res?.data || null)
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to update offer.")
    } finally {
      setOfferActionLoading("")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8faf8] to-[#edf3ef]">
      <header className="border-b border-[rgba(26,47,38,0.1)] bg-white/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Chefos Operations</p>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">Chef Console</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="outline">Home</Button></Link>
            <Link to="/dashboard"><Button variant="secondary">User App</Button></Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {error && <PageState kind="error" title="Action required" message={error} />}

        <section className="panel p-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="w-full md:max-w-sm">
              <label className="text-sm font-semibold text-[var(--color-text)]">Select chef profile</label>
              <select
                value={selectedChefId}
                onChange={handleChefChange}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                {!chefs.length && <option value="">No chefs found</option>}
                {chefs.map((chef) => (
                  <option key={chef.id} value={chef.id}>
                    {chef.name} ({chef.speciality})
                  </option>
                ))}
              </select>
            </div>

            {activeChef && (
              <div className="text-sm text-[var(--color-muted)]">
                Current: <span className="font-semibold text-[var(--color-text)]">{activeChef.name}</span>
              </div>
            )}
          </div>
        </section>

        {(loadingChefs || loadingDashboard) && (
          <PageState kind="loading" title="Loading chef console" message="Fetching chef profile, assignments, and requests." />
        )}

        {!loadingChefs && !loadingDashboard && dashboard && (
          <>
            <section className="grid md:grid-cols-3 gap-4">
              <div className="panel p-5">
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Chef</p>
                <p className="mt-1 text-xl font-semibold">{dashboard.chef?.name}</p>
                <p className="text-sm text-[var(--color-muted)]">⭐ {dashboard.chef?.rating} • {dashboard.chef?.speciality}</p>
              </div>
              <div className="panel p-5">
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Subscribers</p>
                <p className="mt-1 text-xl font-semibold">{dashboard.stats?.active_subscriptions || 0}</p>
              </div>
              <div className="panel p-5">
                <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Instant Requests</p>
                <p className="mt-1 text-xl font-semibold">{dashboard.stats?.pending_instant_requests || 0}</p>
              </div>
            </section>

            <section className="panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--color-muted)]">Availability</p>
                  <p className="font-semibold text-[var(--color-text)]">
                    {dashboard.chef?.is_available ? "Available for assignments" : "Unavailable"}
                  </p>
                </div>
                <Button loading={updatingAvailability} onClick={toggleAvailability}>
                  {dashboard.chef?.is_available ? "Mark Unavailable" : "Mark Available"}
                </Button>
              </div>
            </section>

            <section className="panel p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Pending Instant Requests</h2>
              {!dashboard.pending_instant_offers?.length ? (
                <p className="mt-3 text-sm text-[var(--color-muted)]">No instant request is waiting for this chef right now.</p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {dashboard.pending_instant_offers.map((offer) => (
                    <div key={offer.offer_id} className="rounded-xl border border-[var(--color-border)] p-4 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--color-text)]">@{offer.username}</p>
                          <p className="text-sm text-[var(--color-muted)]">
                            Distance: {offer.distance_km} km • Expires in {offer.seconds_left ?? 0}s
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            loading={offerActionLoading === `${offer.request_id}:accept`}
                            onClick={() => respondToOffer(offer.request_id, "accept")}
                          >
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            loading={offerActionLoading === `${offer.request_id}:decline`}
                            onClick={() => respondToOffer(offer.request_id, "decline")}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Active Subscriptions</h2>
              {!dashboard.subscriptions?.length ? (
                <p className="mt-3 text-sm text-[var(--color-muted)]">No active subscription assigned to this chef.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                        <th className="pb-2 pr-3">User</th>
                        <th className="pb-2 pr-3">Meals</th>
                        <th className="pb-2 pr-3">Period</th>
                        <th className="pb-2 pr-3">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.subscriptions.map((sub) => (
                        <tr key={sub.id} className="border-b border-[var(--color-border)] align-top">
                          <td className="py-2 pr-3 font-medium">@{sub.username}</td>
                          <td className="py-2 pr-3 capitalize">{Array.isArray(sub.meal_type) ? sub.meal_type.join(", ") : "-"}</td>
                          <td className="py-2 pr-3">{sub.start_date} to {sub.end_date}</td>
                          <td className="py-2 pr-3">Rs {sub.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
