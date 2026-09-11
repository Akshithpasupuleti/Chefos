import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import Button from "../components/common/Button"
import Input from "../components/common/Input"
import api from "../services/api"
import { ROLE_CHEF, clearRoleSession, getRoleHomePath, isRoleAuthenticated, setRoleSession } from "../services/authSession"

export default function ChefPartnerLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (isRoleAuthenticated(ROLE_CHEF)) {
      navigate(getRoleHomePath(ROLE_CHEF), { replace: true })
    }
  }, [navigate])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await api.post("token/", { username, password })
      setRoleSession(ROLE_CHEF, {
        access: res.data.access,
        refresh: res.data.refresh,
        username,
      })
      try {
        await api.get("chefs/partner/me/")
      } catch {
        clearRoleSession(ROLE_CHEF)
        setError("This account is not a chef partner account.")
        return
      }
      navigate("/chef/dashboard")
    } catch {
      setError("Invalid username or password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-[var(--color-border)] shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Chef Partner Login</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Manage your orders, availability and location.</p>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" loading={loading}>{loading ? "Logging in..." : "Login"}</Button>
        </form>

        <p className="mt-6 text-sm text-[var(--color-muted)]">
          New chef partner? <Link to="/chef/register" className="text-[var(--color-primary)] font-medium hover:underline">Create account</Link>
        </p>
      </div>
    </div>
  )
}
