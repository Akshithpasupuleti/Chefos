export default function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  loading = false,
  disabled = false,
  ...props
}) {
  const base = "h-11 px-5 rounded-xl font-semibold text-sm tracking-[0.01em] transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-primary)]"

  const variants = {
    primary: "bg-[var(--color-primary)] text-white shadow-[0_10px_24px_rgba(15,122,94,0.22)] hover:bg-[var(--color-primary-strong)] hover:-translate-y-[1px]",
    outline: "bg-white text-[var(--color-primary)] border border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white",
    secondary: "bg-[color-mix(in_oklab,var(--color-primary)_11%,white)] text-[var(--color-primary-strong)] border border-[color-mix(in_oklab,var(--color-primary)_25%,white)] hover:bg-[color-mix(in_oklab,var(--color-primary)_18%,white)]",
  }

  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`}
      disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      <span>{children}</span>
    </button>
  )
}
