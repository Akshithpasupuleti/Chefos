import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import Button from "../components/common/Button"
import Input from "../components/common/Input"
import api from "../services/api"
import { ROLE_CHEF, setRoleSession } from "../services/authSession"

export default function ChefPartnerRegister() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    name: "",
    speciality: "",
    phone: "",
    city: "",
    latitude: "",
    longitude: "",
  })
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState("")

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.")
      return
    }
    setLocating(true)
    setError("")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setField("latitude", String(position.coords.latitude))
        setField("longitude", String(position.coords.longitude))
        setLocating(false)
      },
      () => {
        setError("Unable to fetch location. You can enter coordinates manually.")
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      await api.post("chefs/partner/register/", form)
      const loginRes = await api.post("token/", {
        username: form.username,
        password: form.password,
      })
      setRoleSession(ROLE_CHEF, {
        access: loginRes.data.access,
        refresh: loginRes.data.refresh,
        username: form.username,
      })
      navigate("/chef/dashboard")
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to create chef partner account.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl bg-white p-8 rounded-2xl border border-[var(--color-border)] shadow-[0_10px_30px_rgba(0,0,0,0.05)]">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Create Chef Partner Account</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Register as a chef partner to receive subscription and instant cooking requests.
        </p>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        <form className="mt-6 grid sm:grid-cols-2 gap-4" onSubmit={submit}>
          <Input label="Username" value={form.username} onChange={(e) => setField("username", e.target.value)} required />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setField("password", e.target.value)} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
          <Input label="Full name" value={form.name} onChange={(e) => setField("name", e.target.value)} required />
          <Input label="Speciality" value={form.speciality} onChange={(e) => setField("speciality", e.target.value)} required />
          <Input label="Phone" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          <Input label="City" value={form.city} onChange={(e) => setField("city", e.target.value)} />
          <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4">
            <Input label="Latitude" value={form.latitude} onChange={(e) => setField("latitude", e.target.value)} />
            <Input label="Longitude" value={form.longitude} onChange={(e) => setField("longitude", e.target.value)} />
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-3 mt-2">
            <Button type="button" variant="outline" loading={locating} onClick={detectLocation}>
              {locating ? "Detecting..." : "Use Current Location"}
            </Button>
            <Button type="submit" loading={loading}>{loading ? "Creating..." : "Create Partner Account"}</Button>
          </div>
        </form>

        <p className="mt-6 text-sm text-[var(--color-muted)]">
          Already registered? <Link to="/chef/login" className="text-[var(--color-primary)] font-medium hover:underline">Login as chef partner</Link>
        </p>
      </div>
    </div>
  )
}
