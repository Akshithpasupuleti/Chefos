import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"

import { useAuth } from "../auth/AuthContext"
import { Button, Input, Screen, SectionCard } from "../components/ui"
import { typography } from "../theme"

export function ChefRegisterScreen() {
  const { registerChef } = useAuth()
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    phone: "",
    city: "",
    name: "",
    speciality: "",
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    setLoading(true)
    setError("")
    setMessage("")
    try {
      await registerChef(form)
      setMessage("Chef partner account created. You can login now.")
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to create chef partner account.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <SectionCard>
        <Text style={typography.title}>Bring chef partners into mobile too.</Text>
        <Text style={[typography.body, { marginTop: 10 }]}>This form posts straight to `chefs/partner/register/` on your backend.</Text>
      </SectionCard>
      <SectionCard>
        <View style={styles.form}>
          <Input label="Username" value={form.username} onChangeText={(value) => update("username", value)} placeholder="chef username" />
          <Input label="Password" value={form.password} onChangeText={(value) => update("password", value)} placeholder="secure password" secureTextEntry />
          <Input label="Email" value={form.email} onChangeText={(value) => update("email", value)} placeholder="chef@example.com" keyboardType="email-address" />
          <Input label="Phone" value={form.phone} onChangeText={(value) => update("phone", value)} placeholder="contact number" keyboardType="phone-pad" />
          <Input label="City" value={form.city} onChangeText={(value) => update("city", value)} placeholder="operating city" />
          <Input label="Chef name" value={form.name} onChangeText={(value) => update("name", value)} placeholder="display name" autoCapitalize="words" />
          <Input label="Speciality" value={form.speciality} onChangeText={(value) => update("speciality", value)} placeholder="North Indian, keto, etc." autoCapitalize="words" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.good}>{message}</Text> : null}
          <Button label={loading ? "Creating account..." : "Register chef partner"} onPress={submit} loading={loading} />
        </View>
      </SectionCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  error: {
    color: "#b84b45",
    fontSize: 14,
    fontWeight: "600",
  },
  good: {
    color: "#2d8a63",
    fontSize: 14,
    fontWeight: "600",
  },
})
