import { StyleSheet } from "react-native"

export const palette = {
  canvas: "#f6f3ea",
  canvasStrong: "#efeadf",
  surface: "#ffffff",
  surfaceAlt: "#f8f5ee",
  primary: "#0f7a5e",
  primaryDark: "#0a5b46",
  secondary: "#1f2a24",
  accent: "#e98f3f",
  success: "#0f7a5e",
  warning: "#c8742a",
  danger: "#c14d46",
  text: "#1f2a24",
  muted: "#607065",
  border: "#d6dfd8",
  white: "#ffffff",
  shadow: "rgba(16, 38, 28, 0.10)",
}

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
}

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
}

export const typography = StyleSheet.create({
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: palette.muted,
    fontWeight: "700",
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    color: palette.text,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: palette.text,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: palette.text,
    fontWeight: "700",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.muted,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
    fontWeight: "600",
  },
})

export const shadows = {
  soft: {
    shadowColor: "#10261c",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
}
