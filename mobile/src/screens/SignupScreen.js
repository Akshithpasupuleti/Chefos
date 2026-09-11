import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"

import { useAuth } from "../auth/AuthContext"
import { Button, Input, Screen, SectionCard } from "../components/ui"
import { typography } from "../theme"

export function SignupScreen({ navigation }) {
  const { signupUser } = useAuth()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const submit = async () => {
    setLoading(true)
    setError("")
    setMessage("")
    try {
      await signupUser({ username, email, password })
      setMessage("Account created. You can login now.")
      navigation.goBack()
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to create account.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen contentContainerStyle={styles.content}>
      <SectionCard>
        <Text style={typography.title}>Create your customer account.</Text>
        <Text style={[typography.body, { marginTop: 10 }]}>This matches the backend registration flow already used by your web app.</Text>
      </SectionCard>
      <SectionCard>
        <View style={styles.form}>
          <Input label="Username" value={username} onChangeText={setUsername} placeholder="choose a username" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="minimum 8 characters" secureTextEntry />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.good}>{message}</Text> : null}
          <Button label={loading ? "Creating account..." : "Create account"} onPress={submit} loading={loading} />
        </View>
      </SectionCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    justifyContent: "center",
    minHeight: "100%",
  },
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
