import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"
import { ROLE_CHEF, clearRoleSession } from "../services/authSession"

export default function ChefHistory() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await api.get("chefs/partner/history/")
      setData(res?.data || null)
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to load history.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const logout = () => {
    clearRoleSession(ROLE_CHEF)
    navigate("/")
  }

  const summary = data?.summary || {}
  const trips = Array.isArray(data?.trips) ? data.trips : []

  if (loading) {
    return <PageState kind="loading" title="Loading chef history" message="Fetching trips, earnings and ratings." className="min-h-screen" />
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dff5ee_0%,#f8faf8_40%,#ecf4ef_100%)]">
      <header className="border-b border-[rgba(26,47,38,0.1)] bg-white/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Chefos Partner</p>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">History</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/chef/dashboard"><Button variant="outline">Dashboard</Button></Link>
            <Link to="/"><Button variant="outline">Home</Button></Link>
            <Button variant="secondary" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {error ? <PageState kind="error" title="Action required" message={error} /> : null}

        <section className="grid md:grid-cols-4 gap-4">
          <StatCard label="Completed Trips" value={summary.completed_trips ?? 0} />
          <StatCard label="Earnings" value={`Rs ${summary.earnings_rupees_total ?? 0}`} />
          <StatCard label="Instant Rating" value={summary.rating_average_instant ? `${summary.rating_average_instant} (${summary.rating_count_instant || 0})` : "-"} />
          <StatCard label="Subscription Rating" value={summary.rating_average_subscription ? `${summary.rating_average_subscription} (${summary.rating_count_subscription || 0})` : "-"} />
        </section>

        <section className="panel p-5">
          <p className="text-sm text-[var(--color-muted)]">
            Subscription trips: {summary.completed_subscription_trips ?? 0} • Instant trips: {summary.completed_instant_trips ?? 0}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Subscription earnings: Rs {summary.earnings_rupees_subscription ?? 0} • Instant earnings: Rs {summary.earnings_rupees_instant ?? 0}
          </p>
        </section>

        {!trips.length ? (
          <PageState kind="empty" title="No completed trips yet" message="Completed services will appear here." />
        ) : (
          <section className="grid gap-3">
            {trips.map((item) => (
              <article key={item.service_session_id} className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--color-text)]">@{item.username || "user"}</p>
                  <span className="text-xs px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] capitalize">
                    {item.mode}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--color-muted)] capitalize">
                  {item.meal || "-"} {item.wave ? `• ${item.wave}` : ""} {item.service_date ? `• ${item.service_date}` : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Completed: {item.completed_at ? new Date(item.completed_at).toLocaleString() : "-"}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">Earned: Rs {item.earning_rupees ?? 0}</p>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <article className="panel p-5">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{value}</p>
    </article>
  )
}
