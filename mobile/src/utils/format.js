export function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function currencyInr(value) {
  const amount = Number(value || 0)
  return `Rs ${amount.toLocaleString("en-IN")}`
}

export function joinMeals(meals) {
  if (!Array.isArray(meals) || !meals.length) return "Not selected"
  return meals.map(titleCase).join(", ")
}

export function inferPlanCycle(subscription) {
  if (!subscription?.start_date || !subscription?.end_date) return ""
  const start = new Date(subscription.start_date)
  const end = new Date(subscription.end_date)
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24))
  return days <= 8 ? "Weekly" : "Monthly"
}

export function safeArray(value) {
  return Array.isArray(value) ? value : []
}
