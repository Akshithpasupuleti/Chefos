import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import PageState from "../components/common/PageState"
import api from "../services/api"

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1600&q=80"
const SIDE_IMAGE_URL =
  "https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=900&q=80"

export default function WeeklyMenu() {
  const navigate = useNavigate()
  const [menu, setMenu] = useState(null)
  const [preference, setPreference] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = () => {
    setLoading(true)
    setError("")
    Promise.allSettled([api.get("menu/weekly/"), api.get("menu/preference/")])
      .then(([menuRes, prefRes]) => {
        setMenu(menuRes.status === "fulfilled" ? menuRes.value.data : null)
        setPreference(prefRes.status === "fulfilled" ? prefRes.value.data : null)
        if (menuRes.status === "rejected") {
          setError("No weekly menu yet. Generate one first.")
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const dayRows = useMemo(() => {
    if (!menu) return []

    const breakfast = toWeekList(menu.breakfast)
    const lunch = toWeekList(menu.lunch)
    const dinner = toWeekList(menu.dinner)

    return WEEK_DAYS.map((day, idx) => ({
      day,
      idx,
      breakfast: breakfast[idx] || "Not set",
      lunch: lunch[idx] || "Not set",
      dinner: dinner[idx] || "Not set",
    }))
  }, [menu])

  const todayIndex = Number.isInteger(menu?.day_index) ? menu.day_index : -1

  return (
    <div className="page-shell">
      <AppNavbar />

      <main className="page-container py-8 md:py-10">
        <section className="rounded-[30px] overflow-hidden border border-[rgba(17,33,26,0.12)] shadow-[0_20px_48px_rgba(20,39,31,0.18)] bg-white">
          <div className="grid lg:grid-cols-[1.3fr_0.7fr]">
            <div className="relative min-h-[330px]">
              <img src={HERO_IMAGE_URL} alt="Fresh meal ingredients" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[rgba(10,28,21,0.84)] via-[rgba(10,28,21,0.55)] to-[rgba(10,28,21,0.2)]" />

              <div className="relative h-full p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/80">Weekly Planner</p>
                  <h1 className="serif-title mt-2 text-3xl md:text-4xl text-white">Your 7-day personalized meal calendar</h1>
                  <p className="mt-2 max-w-xl text-sm md:text-base text-white/88">
                    Built around your profile and food preferences. Use this as your daily execution guide.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <InfoChipDark label={`Goal: ${preference?.goal || "Not set"}`} />
                  <InfoChipDark label={`Food: ${preference?.food_type || "Not set"}`} />
                  <InfoChipDark label={`Cuisine: ${preference?.cuisine_style || "Not set"}`} />
                </div>
              </div>
            </div>

            <div className="relative min-h-[330px] bg-[linear-gradient(165deg,#f4fbf7_0%,#ecf5ff_100%)] p-5 md:p-6 border-l border-[rgba(17,33,26,0.1)]">
              <img src={SIDE_IMAGE_URL} alt="Prepared healthy meals" className="h-36 w-full rounded-2xl object-cover soft-border" />

              <div className="mt-4 grid gap-3">
                <div className="rounded-xl bg-white p-3 soft-border">
                  <p className="text-xs text-[var(--color-muted)]">Menu source</p>
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {menu?.generation?.provider ? `Chefos AI (${menu.generation.provider})` : "Chefos AI"}
                  </p>
                </div>

                <div className="rounded-xl bg-white p-3 soft-border">
                  <p className="text-xs text-[var(--color-muted)]">Allergies</p>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{preference?.allergies || "None"}</p>
                </div>

                {todayIndex >= 0 && todayIndex < 7 ? (
                  <div className="rounded-xl bg-[#eaf8f3] p-3 border border-[#b7e8cf]">
                    <p className="text-xs text-[#0b654f]">Current focus</p>
                    <p className="text-sm font-semibold text-[#0b654f]">Today is {WEEK_DAYS[todayIndex]}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={load}>Refresh</Button>
                <Button variant="secondary" onClick={() => navigate("/schedule")}>Today View</Button>
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <PageState kind="loading" title="Loading menu" message="Fetching your latest weekly plan." className="mt-8" />
        )}

        {!loading && error && (
          <PageState
            kind="empty"
            title="No weekly menu found"
            message={error}
            actionLabel="Generate Menu"
            onAction={() => navigate("/ai-menu")}
            className="mt-8"
          />
        )}

        {!loading && menu && (
          <section className="mt-8 panel overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-primary)_6%,white)] flex justify-between items-center gap-3">
              <h2 className="text-lg font-bold tracking-tight">7-Day Meal Calendar</h2>
              {todayIndex >= 0 && todayIndex < 7 ? (
                <span className="text-xs px-2.5 py-1 rounded-full border bg-[#eaf8f3] text-[#0b654f] border-[#b7e8cf] font-semibold">
                  Today: {WEEK_DAYS[todayIndex]}
                </span>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="bg-[rgba(15,122,94,0.06)] text-left">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Day</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Breakfast</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Lunch</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">Dinner</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((row) => (
                    <tr
                      key={row.day}
                      className={`border-t border-[var(--color-border)] align-top ${row.idx === todayIndex ? "bg-[rgba(233,143,63,0.08)]" : "bg-white"}`}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--color-text)]">{row.day}</td>
                      <td className="px-4 py-3 text-sm text-[var(--color-muted)]">{row.breakfast}</td>
                      <td className="px-4 py-3 text-sm text-[var(--color-muted)]">{row.lunch}</td>
                      <td className="px-4 py-3 text-sm text-[var(--color-muted)]">{row.dinner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-wrap justify-between items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/ai-menu")}>Modify Preferences</Button>
          <Button onClick={() => navigate("/find-chef")}>Find Chef for this Menu</Button>
        </div>
      </main>
    </div>
  )
}

function toWeekList(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined || value === "") return []
  return [String(value)]
}

function InfoChipDark({ label }) {
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/18 text-white border border-white/30">
      {label}
    </span>
  )
}
