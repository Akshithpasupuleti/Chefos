import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import Button from "../components/common/Button"
import Input from "../components/common/Input"
import api from "../services/api"
import { ROLE_USER, clearRoleSession, getRoleHomePath, isRoleAuthenticated, setRoleSession } from "../services/authSession"

export default function Login() {
  const navigate = useNavigate()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (isRoleAuthenticated(ROLE_USER)) {
      navigate(getRoleHomePath(ROLE_USER), { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await api.post("token/", { username, password })
      setRoleSession(ROLE_USER, {
        access: res.data.access,
        refresh: res.data.refresh,
        username,
      })
      try {
        await api.get("chefs/partner/me/")
        clearRoleSession(ROLE_USER)
        setError("This account is a chef partner. Please login from Chef Login.")
        return
      } catch {
        // Not a chef partner account; continue user login.
      }
      navigate("/user/dashboard")
    } catch {
      setError("Invalid username or password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-[var(--color-border)] shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)]">Welcome back</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">Login to manage your meals and chefs</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Username"
            type="text"
            placeholder="your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            error={error ? "Please check your credentials" : ""}
          />

          <Button type="submit" className="w-full py-3 text-base" loading={loading}>
            {loading ? "Logging in..." : "Login"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px bg-[var(--color-border)] flex-1" />
          <span className="text-xs text-[var(--color-muted)]">or</span>
          <div className="h-px bg-[var(--color-border)] flex-1" />
        </div>

        <p className="text-sm text-center text-[var(--color-muted)]">
          New to Chefos?{" "}
          <Link to="/signup" className="text-[var(--color-primary)] font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
