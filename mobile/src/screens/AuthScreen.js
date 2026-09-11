import { useState } from "react"
import { Alert, StyleSheet, Text, View } from "react-native"

import { useAuth } from "../auth/AuthContext"
import { AppBadge, Button, Hero, Input, Screen, SectionCard } from "../components/ui"
import { palette, typography } from "../theme"

export function AuthScreen({ navigation, route }) {
  const role = route.params?.role === "chef" ? "chef" : "user"
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    setLoading(true)
    setError("")
    try {
      await login({ role, username, password })
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Unable to sign in."
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <Hero
        image={
          role === "chef"
            ? "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=80"
            : "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80"
        }
        eyebrow={role === "chef" ? "Chefos Partner" : "Chefos"}
        title={role === "chef" ? "Chef operations, built as a dedicated partner app." : "Chefos for customers, built like a modern food platform."}
        subtitle={
          role === "chef"
            ? "Availability, instant requests, service visibility, and location sync in one focused partner workflow."
            : "Chef discovery, meal planning, schedule tracking, and subscription management in a cleaner customer app."
        }
      >
        <AppBadge label={role === "chef" ? "Partner app" : "Customer app"} />
      </Hero>

      <SectionCard>
        <Text style={typography.eyebrow}>{role === "chef" ? "Partner Login" : "Customer Login"}</Text>
        <Text style={[typography.title, { marginTop: 8 }]}>
          {role === "chef" ? "Sign in to the chef partner app." : "Sign in to the customer app."}
        </Text>
        <Text style={[typography.body, { marginTop: 10 }]}>
          {role === "chef"
            ? "Built for chef partners managing live operations."
            : "Built for users managing meals, chefs, and subscriptions."}
        </Text>
      </SectionCard>

      <SectionCard>
        <View style={styles.form}>
          <Input label="Username" value={username} onChangeText={setUsername} placeholder={role === "chef" ? "chef username" : "your username"} />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="Enter password" secureTextEntry />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={loading ? "Signing in..." : "Login"} onPress={submit} loading={loading} />
          {role === "user" ? (
            <Button label="Create customer account" variant="outline" onPress={() => navigation.navigate("Signup")} />
          ) : (
            <Button label="Register chef partner" variant="outline" onPress={() => navigation.navigate("ChefRegister")} />
          )}
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={typography.cardTitle}>Setup note</Text>
        <Text style={[typography.body, { marginTop: 8 }]}>
          Set `EXPO_PUBLIC_API_BASE_URL` to your Django API, for example `http://192.168.x.x:8000/api/` when testing on a phone.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button
            label="Show setup reminder"
            variant="secondary"
            onPress={() => Alert.alert("API setup", "Point the app to a LAN URL so your device can reach the backend.")}
          />
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
    color: palette.danger,
    fontSize: 14,
    fontWeight: "600",
  },
})
