import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import Input from "../components/common/Input"
import Button from "../components/common/Button"
import api from "../services/api"

export default function Signup() {
  const navigate = useNavigate()

  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      await api.post("register/", { username, email, password })
      navigate("/login")
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(detail || "Signup failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-[var(--color-border)] shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)]">Create your account</h2>
          <p className="text-sm text-[var(--color-muted)] mt-1">Start your personalised chef subscription</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            label="Username"
            placeholder="your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            helper="This will be used for login"
          />
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helper="Use at least 8 characters"
          />

          <Button type="submit" className="w-full py-3 text-base" loading={loading}>
            {loading ? "Creating account..." : "Sign up"}
          </Button>
        </form>

        <p className="text-xs text-[var(--color-muted)] mt-4">By signing up, you agree to our Terms & Privacy Policy.</p>

        <p className="text-sm text-center text-[var(--color-muted)] mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-[var(--color-primary)] font-medium hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
