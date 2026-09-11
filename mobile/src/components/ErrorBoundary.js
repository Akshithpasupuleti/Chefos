import { Component } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"

import { palette } from "../theme"

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("Chefos runtime error:", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>App crashed while rendering</Text>
            <Text style={styles.subtitle}>This is the runtime error that was previously showing up as a white screen.</Text>
            <Text style={styles.errorText}>{String(this.state.error?.message || this.state.error)}</Text>
          </View>
        </ScrollView>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: palette.canvas,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.muted,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.danger,
    fontWeight: "600",
  },
})
