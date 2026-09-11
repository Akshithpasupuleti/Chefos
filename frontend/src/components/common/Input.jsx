export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  required = false,
  error = "",
  helper = "",
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-sm font-semibold text-[var(--color-text)]">
          {label}
        </label>
      )}

      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        className={`h-11 px-3.5 rounded-xl border text-sm bg-white/95 transition shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] focus:outline-none focus:ring-2 ${error ? "border-red-300 focus:ring-red-300" : "border-[var(--color-border)] focus:ring-[var(--color-primary)]"}`}
      />

      {helper && !error && <p className="text-xs text-[var(--color-muted)]">{helper}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
