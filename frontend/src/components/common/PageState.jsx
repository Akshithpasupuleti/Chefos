import Button from "./Button"

const styles = {
  loading: {
    wrapper: "bg-blue-50 border-blue-200 text-blue-900",
    badge: "bg-blue-100 text-blue-700",
    label: "Loading",
  },
  error: {
    wrapper: "bg-red-50 border-red-200 text-red-900",
    badge: "bg-red-100 text-red-700",
    label: "Error",
  },
  empty: {
    wrapper: "bg-amber-50 border-amber-200 text-amber-900",
    badge: "bg-amber-100 text-amber-700",
    label: "No Data",
  },
}

export default function PageState({
  kind = "loading",
  title,
  message,
  actionLabel,
  onAction,
  className = "",
}) {
  const state = styles[kind] || styles.loading

  return (
    <div className={`rounded-2xl border p-5 ${state.wrapper} ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`inline-block text-xs font-semibold px-2 py-1 rounded-full ${state.badge}`}>
            {state.label}
          </p>
          <p className="mt-2 font-medium">{title}</p>
          {message && <p className="text-sm mt-1 opacity-80">{message}</p>}
        </div>

        {actionLabel && onAction && (
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
