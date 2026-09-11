import { useEffect, useState } from "react"

import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"

export default function UserHistory() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState("")
  const [draft, setDraft] = useState({})

  const load = () => {
    setLoading(true)
    setError("")
    api.get("chefs/history/instant/")
      .then((res) => setRows(Array.isArray(res?.data?.history) ? res.data.history : []))
      .catch((err) => setError(err?.response?.data?.detail || "Unable to load history"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const submitFeedback = async (item) => {
    const key = String(item.id)
    const rating = Number(draft[key]?.rating || 0)
    const comment = String(draft[key]?.comment || "")
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setError("Please provide a rating from 1 to 5.")
      return
    }
    setSubmitting(key)
    setError("")
    try {
      await api.post(`chefs/history/instant/${item.id}/feedback/`, { rating, comment })
      await load()
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to submit feedback")
    } finally {
      setSubmitting("")
    }
  }

  return (
    <div className="page-shell">
      <AppNavbar />
      <main className="page-container py-8 md:py-10">
        <section className="panel p-6">
          <h1 className="serif-title text-3xl text-[var(--color-text)]">Service History</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Completed instant orders and feedback.</p>
        </section>

        {loading ? (
          <PageState kind="loading" title="Loading history" message="Fetching completed instant orders." className="mt-6" />
        ) : null}
        {!loading && error ? <PageState kind="error" title="Action required" message={error} className="mt-6" /> : null}
        {!loading && !error && rows.length === 0 ? (
          <PageState kind="empty" title="No history yet" message="Completed instant orders will appear here." className="mt-6" />
        ) : null}

        {!loading && rows.length > 0 ? (
          <section className="mt-6 grid gap-4">
            {rows.map((item) => {
              const key = String(item.id)
              const existing = item.feedback_submitted
              return (
                <article key={item.id} className="panel p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[var(--color-text)]">{item.chef_name}</p>
                    <span className="text-xs px-2 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-muted)]">
                      {existing ? "Feedback submitted" : "Feedback pending"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Completed: {item.service_completed_at ? new Date(item.service_completed_at).toLocaleString() : "-"}
                  </p>
                  {item.notes ? <p className="mt-2 text-sm text-[var(--color-muted)]">Notes: {item.notes}</p> : null}

                  {existing ? (
                    <p className="mt-3 text-sm text-[var(--color-muted)]">Your feedback: {item.rating}/5 {item.comment ? `• ${item.comment}` : ""}</p>
                  ) : (
                    <div className="mt-3 grid gap-2 md:grid-cols-[120px_1fr_auto]">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={draft[key]?.rating || ""}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: { ...prev[key], rating: e.target.value } }))}
                        placeholder="Rating (1-5)"
                        className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                      <input
                        value={draft[key]?.comment || ""}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: { ...prev[key], comment: e.target.value } }))}
                        placeholder="Write feedback (optional)"
                        className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                      <Button
                        className="h-10"
                        loading={submitting === key}
                        onClick={() => submitFeedback(item)}
                      >
                        Submit
                      </Button>
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        ) : null}
      </main>
    </div>
  )
}
