import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import logoMark from "../assets/logo.svg"
import AppNavbar from "../components/common/AppNavbar"
import Button from "../components/common/Button"
import Input from "../components/common/Input"
import PageState from "../components/common/PageState"
import api from "../services/api"

const goals = ["Lose weight", "Maintain weight", "Gain muscle", "Improve health markers"]
const foodTypes = ["Vegetarian", "Eggetarian", "Non-vegetarian", "Vegan"]
const activityLevels = ["Sedentary", "Light", "Moderate", "Active", "Very Active"]
const genders = ["Male", "Female", "Other", "Prefer not to say"]
const mealOptions = ["breakfast", "lunch", "dinner"]
const defaultMealWave = {
  breakfast: "B2",
  lunch: "L2",
  dinner: "D2",
}

export default function AIMenu() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  const [planCycle, setPlanCycle] = useState("monthly")
  const [selectedMeals, setSelectedMeals] = useState(["breakfast", "lunch", "dinner"])
  const [peopleCount, setPeopleCount] = useState(1)

  const [goal, setGoal] = useState(goals[1])
  const [foodType, setFoodType] = useState(foodTypes[0])
  const [cuisineStyle, setCuisineStyle] = useState("North Indian")
  const [cuisineQuery, setCuisineQuery] = useState("North Indian")
  const [cuisineSuggestions, setCuisineSuggestions] = useState([])
  const [cuisineSearching, setCuisineSearching] = useState(false)
  const [isCuisineOpen, setCuisineOpen] = useState(false)
  const [activeCuisineIndex, setActiveCuisineIndex] = useState(-1)

  const [age, setAge] = useState("")
  const [gender, setGender] = useState(genders[0])
  const [heightCm, setHeightCm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [targetWeightKg, setTargetWeightKg] = useState("")
  const [activityLevel, setActivityLevel] = useState(activityLevels[2])
  const [allergies, setAllergies] = useState("")
  const [medicalConditions, setMedicalConditions] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const totalSteps = 7

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      if (!cancelled) setCuisineSearching(true)
      try {
        const res = await api.get("cuisines/search/", { params: { q: cuisineQuery } })
        if (!cancelled) {
          const items = res.data.results || []
          setCuisineSuggestions(items)
          setActiveCuisineIndex(items.length ? 0 : -1)
        }
      } catch {
        if (!cancelled) {
          setCuisineSuggestions([])
          setActiveCuisineIndex(-1)
        }
      } finally {
        if (!cancelled) setCuisineSearching(false)
      }
    }, 220)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cuisineQuery])

  const bmi = useMemo(() => {
    const h = Number(heightCm)
    const w = Number(weightKg)
    if (!h || !w) return null
    const hMeters = h / 100
    const v = w / (hMeters * hMeters)
    return Number.isFinite(v) ? v.toFixed(1) : null
  }, [heightCm, weightKg])

  const stepPercent = Math.round((step / totalSteps) * 100)

  const toggleMeal = (meal) => {
    setSelectedMeals((prev) => {
      if (prev.includes(meal)) {
        if (prev.length === 1) return prev
        return prev.filter((m) => m !== meal)
      }
      return [...prev, meal]
    })
  }

  const next = () => setStep((prev) => Math.min(totalSteps, prev + 1))
  const back = () => setStep((prev) => Math.max(1, prev - 1))

  const selectCuisine = (value) => {
    setCuisineStyle(value)
    setCuisineQuery(value)
    setCuisineOpen(false)
  }

  const onCuisineKeyDown = (e) => {
    if (!isCuisineOpen) {
      if (e.key === "ArrowDown" && cuisineSuggestions.length) {
        setCuisineOpen(true)
        setActiveCuisineIndex(0)
        e.preventDefault()
      }
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveCuisineIndex((prev) => Math.min(cuisineSuggestions.length - 1, prev + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveCuisineIndex((prev) => Math.max(0, prev - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (activeCuisineIndex >= 0 && cuisineSuggestions[activeCuisineIndex]) {
        selectCuisine(cuisineSuggestions[activeCuisineIndex])
      } else {
        selectCuisine(cuisineQuery.trim())
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setCuisineOpen(false)
    }
  }

  const submitProfileAndGenerate = async () => {
    setLoading(true)
    setError("")
    try {
      await api.post("menu/preference/", {
        goal,
        food_type: foodType,
        cuisine_style: cuisineStyle || cuisineQuery,
        allergies,
        age,
        gender,
        height_cm: heightCm,
        weight_kg: weightKg,
        target_weight_kg: targetWeightKg,
        activity_level: activityLevel,
        medical_conditions: medicalConditions,
        people_count: peopleCount,
      })

      await api.post("menu/generate/", {
        selected_meals: selectedMeals,
      })

      localStorage.setItem(
        "subscription_plan",
        JSON.stringify({
          plan_cycle: planCycle,
          selected_meals: selectedMeals,
          people_count: peopleCount,
          meal_wave: selectedMeals.reduce((acc, meal) => {
            acc[meal] = defaultMealWave[meal] || ""
            return acc
          }, {}),
        })
      )

      navigate("/weekly-menu")
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(detail || "Could not generate AI menu right now. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <AppNavbar />

      <main className="page-container py-8 md:py-10">
        <section className="glass-surface rounded-[28px] overflow-hidden mb-6">
          <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-6 p-6 md:p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Chefos AI Planner</p>
              <h1 className="serif-title mt-1 text-3xl md:text-4xl text-[var(--color-text)]">Create your personalized meal blueprint</h1>
              <p className="mt-2 text-sm md:text-base text-[var(--color-muted)]">Set your body profile, goals, cuisine preferences and schedule. Chefos AI will generate your weekly menu.</p>

              <div className="mt-4">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>Step {step} of {totalSteps}</span>
                  <span>{stepPercent}%</span>
                </div>
                <div className="h-2 bg-white/80 rounded-full overflow-hidden soft-border">
                  <div className="h-full bg-[var(--color-primary)] transition-all duration-300" style={{ width: `${stepPercent}%` }} />
                </div>
              </div>
            </div>

            <div className="relative rounded-2xl min-h-[220px] soft-border p-5 bg-[linear-gradient(140deg,#0f7a5e_0%,#1b5f8f_52%,#e98f3f_100%)] text-white flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/80">Plan Intelligence</p>
                <h3 className="mt-2 text-xl font-bold">Adaptive Nutrition Engine</h3>
                <p className="mt-2 text-sm text-white/85">Chefos AI personalizes each day using your activity, goal, cuisine, and restrictions.</p>
              </div>

              <div className="rounded-xl bg-white/15 border border-white/30 p-3 backdrop-blur">
                <div className="flex items-center gap-3">
                  <img src={logoMark} alt="Chefos AI" className="h-9 w-9 rounded-lg bg-white p-1.5" />
                  <div>
                    <p className="text-xs text-white/80">Personalized outcome</p>
                    <p className="text-sm font-semibold">Balanced, practical weekly meals</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="panel p-6 md:p-8">
          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Choose your subscription style</h2>
              <p className="mt-2 text-[var(--color-muted)]">Select duration and meal slots before generating your plan.</p>

              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <SelectField label="Plan cycle" value={planCycle} onChange={setPlanCycle} options={["weekly", "monthly"]} />
                <Input
                  label="Number of people"
                  type="number"
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                  helper="1 to 6 people"
                />
              </div>

              <div className="mt-5">
                <p className="text-sm font-semibold">Meals included</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mealOptions.map((meal) => (
                    <button
                      key={meal}
                      type="button"
                      onClick={() => toggleMeal(meal)}
                      className={`px-3 py-2 rounded-lg border text-sm capitalize font-medium transition ${selectedMeals.includes(meal) ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-cream)]"}`}
                    >
                      {meal}
                    </button>
                  ))}
                </div>
              </div>

              <Actions onBack={back} onNext={next} hideBack />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Goal and food preference</h2>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <SelectField label="Primary goal" value={goal} onChange={setGoal} options={goals} />
                <SelectField label="Food preference" value={foodType} onChange={setFoodType} options={foodTypes} />
              </div>

              <div className="mt-4 relative">
                <label className="text-sm font-semibold text-[var(--color-text)]">Cuisine style</label>
                <input
                  value={cuisineQuery}
                  onFocus={() => setCuisineOpen(true)}
                  onBlur={() => setTimeout(() => setCuisineOpen(false), 120)}
                  onKeyDown={onCuisineKeyDown}
                  onChange={(e) => {
                    setCuisineQuery(e.target.value)
                    setCuisineStyle(e.target.value)
                    setCuisineOpen(true)
                  }}
                  placeholder="Search cuisines (e.g. North Indian, Chettinad)"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />

                {isCuisineOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-[var(--color-border)] rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {cuisineSearching ? (
                      <div className="px-3 py-2 text-sm text-[var(--color-muted)]">Searching cuisines...</div>
                    ) : cuisineSuggestions.length > 0 ? (
                      cuisineSuggestions.map((item, index) => (
                        <button
                          key={item}
                          type="button"
                          onMouseDown={() => selectCuisine(item)}
                          className={`w-full text-left px-3 py-2 text-sm ${index === activeCuisineIndex ? "bg-[var(--color-cream)]" : "hover:bg-[var(--color-cream)]"}`}
                        >
                          {item}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-[var(--color-muted)]">
                        No exact match. Press Enter to use custom cuisine.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Actions onBack={back} onNext={next} />
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Body details</h2>
              <p className="mt-2 text-sm text-[var(--color-muted)]">These improve calorie and macro distribution.</p>

              <div className="mt-5 grid sm:grid-cols-2 gap-4">
                <Input label="Age" type="number" value={age} onChange={(e) => setAge(e.target.value)} helper="Years" />
                <SelectField label="Gender" value={gender} onChange={setGender} options={genders} />
                <Input label="Height" type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} helper="Centimeters" />
                <Input label="Current weight" type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} helper="Kilograms" />
              </div>

              <Actions onBack={back} onNext={next} />
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Target and activity</h2>
              <div className="mt-5 grid sm:grid-cols-2 gap-4">
                <Input
                  label="Target weight"
                  type="number"
                  value={targetWeightKg}
                  onChange={(e) => setTargetWeightKg(e.target.value)}
                  helper="Optional, kilograms"
                />
                <SelectField
                  label="Activity level"
                  value={activityLevel}
                  onChange={setActivityLevel}
                  options={activityLevels}
                />
              </div>

              {bmi && (
                <div className="mt-5 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] p-4 text-sm">
                  Estimated BMI: <span className="font-semibold">{bmi}</span>
                </div>
              )}

              <Actions onBack={back} onNext={next} />
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Allergies and restrictions</h2>
              <div className="mt-5 space-y-4">
                <Input
                  label="Allergies"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g. peanuts, shellfish, lactose"
                />
                <Input
                  label="Medical conditions"
                  value={medicalConditions}
                  onChange={(e) => setMedicalConditions(e.target.value)}
                  placeholder="e.g. diabetes, thyroid, hypertension"
                  helper="Optional, but helps safer meal recommendations"
                />
              </div>

              <Actions onBack={back} onNext={next} />
            </>
          )}

          {step === 6 && (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Review profile</h2>
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)] p-4 text-sm grid sm:grid-cols-2 gap-3">
                <Row label="Plan" value={planCycle} />
                <Row label="Meals" value={selectedMeals.map((m) => m[0].toUpperCase() + m.slice(1)).join(", ")} />
                <Row label="Goal" value={goal} />
                <Row label="Food Type" value={foodType} />
                <Row label="Cuisine" value={cuisineStyle || cuisineQuery} />
                <Row label="Age" value={age || "Not set"} />
                <Row label="Gender" value={gender} />
                <Row label="Height" value={heightCm ? `${heightCm} cm` : "Not set"} />
                <Row label="Weight" value={weightKg ? `${weightKg} kg` : "Not set"} />
                <Row label="Target Weight" value={targetWeightKg ? `${targetWeightKg} kg` : "Not set"} />
                <Row label="Activity" value={activityLevel} />
                <Row label="Allergies" value={allergies || "None"} />
                <Row label="Conditions" value={medicalConditions || "None"} />
              </div>

              <Actions onBack={back} onNext={next} nextLabel="Continue" />
            </>
          )}

          {step === 7 && (
            <>
              <h2 className="text-2xl font-bold tracking-tight">Chefos AI is generating your menu</h2>
              <p className="mt-2 text-[var(--color-muted)]">
                We are building a personalized weekly plan using your body profile, goals, cuisine style, and food restrictions.
              </p>

              {error && (
                <PageState kind="error" title="Generation failed" message={error} className="mt-5" />
              )}

              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={back}>Back</Button>
                <Button onClick={submitProfileAndGenerate} loading={loading}>
                  {loading ? "Generating..." : "Generate My AI Menu"}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-[var(--color-text)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}

function Actions({ onBack, onNext, nextLabel = "Next", hideBack = false }) {
  return (
    <div className="mt-6 flex justify-between">
      {hideBack ? <span /> : <Button variant="outline" onClick={onBack}>Back</Button>}
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  )
}
