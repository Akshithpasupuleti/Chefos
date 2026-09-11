import { ActivityIndicator, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { SafeAreaView } from "react-native-safe-area-context"

import { palette, radius, shadows, spacing, typography } from "../theme"

import chefosLogo from "../assets/chefos-logo.jpeg"

export function Screen({ children, scroll = true, contentContainerStyle, background = palette.canvas }) {
  const content = scroll ? (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, contentContainerStyle]}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flexFill, contentContainerStyle]}>{children}</View>
  )

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}>
      {content}
    </SafeAreaView>
  )
}

export function Hero({ image, eyebrow, title, subtitle, children }) {
  return (
    <ImageBackground source={{ uri: image }} imageStyle={styles.heroImage} style={styles.heroWrap}>
      <LinearGradient colors={["rgba(16,38,28,0.88)", "rgba(15,122,94,0.60)", "rgba(233,143,63,0.26)"]} style={styles.heroOverlay}>
        <Text style={[typography.eyebrow, styles.heroEyebrow]}>{eyebrow}</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
        {children ? <View style={styles.heroFooter}>{children}</View> : null}
      </LinearGradient>
    </ImageBackground>
  )
}

export function SectionCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function AppBadge({ label }) {
  return (
    <View style={styles.appBadge}>
      <View style={styles.appBadgeDot} />
      <Text style={styles.appBadgeText}>{label}</Text>
    </View>
  )
}

export function SectionHeader({ eyebrow, title, subtitle, action }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flexFill}>
        {eyebrow ? <Text style={typography.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[typography.sectionTitle, eyebrow ? { marginTop: 6 } : null]}>{title}</Text>
        {subtitle ? <Text style={[typography.body, { marginTop: 6 }]}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  )
}

export function Button({ label, onPress, variant = "primary", disabled = false, loading = false, style }) {
  const appearance = buttonStyles[variant] || buttonStyles.primary
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        appearance.button,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={appearance.indicator} /> : <Text style={[styles.buttonText, appearance.text]}>{label}</Text>}
    </Pressable>
  )
}

export function Input({ label, value, onChangeText, placeholder, secureTextEntry = false, multiline = false, keyboardType, autoCapitalize = "none" }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9b9c96"
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
      />
    </View>
  )
}

export function Pill({ label, tone = "neutral" }) {
  const pill = pillStyles[tone] || pillStyles.neutral
  return (
    <View style={[styles.pill, pill.wrap]}>
      <Text style={[styles.pillText, pill.text]}>{label}</Text>
    </View>
  )
}

export function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

export function EmptyState({ title, message }) {
  return (
    <SectionCard style={styles.emptyState}>
      <Text style={typography.sectionTitle}>{title}</Text>
      <Text style={[typography.body, { marginTop: 8 }]}>{message}</Text>
    </SectionCard>
  )
}

export function LoadingState({ label = "Loading..." }) {
  return (
    <SectionCard style={styles.loadingState}>
      <ActivityIndicator color={palette.primary} />
      <Text style={[typography.body, { marginTop: 12 }]}>{label}</Text>
    </SectionCard>
  )
}

export function BrandSplashScreen({ label = "Chefos", subtitle = "Private chefs. Better meals. Beautifully managed." }) {
  return (
    <SafeAreaView style={styles.splashSafeArea}>
      <LinearGradient colors={["#0a5b46", "#0f7a5e", "#e98f3f"]} style={styles.splashGradient}>
        <View style={styles.splashLogoWrap}>
          <View style={styles.splashLogoOuter}>
            <View style={styles.splashLogoInner}>
              <Image source={chefosLogo} style={styles.splashLogoImage} resizeMode="cover" />
            </View>
          </View>
          <Text style={styles.splashTitle}>{label}</Text>
          <Text style={styles.splashSubtitle}>{subtitle}</Text>
        </View>
      </LinearGradient>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flexFill: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heroWrap: {
    minHeight: 312,
    borderRadius: 28,
    overflow: "hidden",
  },
  heroImage: {
    borderRadius: radius.lg,
  },
  heroOverlay: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "flex-end",
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.74)",
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "800",
    color: palette.white,
    maxWidth: 300,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.82)",
    maxWidth: 300,
  },
  heroFooter: {
    marginTop: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadows.soft,
  },
  appBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  appBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  appBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.secondary,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  button: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    paddingHorizontal: 16,
    color: palette.text,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 110,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  stat: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  statLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  emptyState: {
    alignItems: "flex-start",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
  },
  splashSafeArea: {
    flex: 1,
    backgroundColor: palette.primaryDark,
  },
  splashGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  splashLogoWrap: {
    alignItems: "center",
    gap: 16,
  },
  splashLogoOuter: {
    width: 108,
    height: 108,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  splashLogoInner: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  splashLogoImage: {
    width: "100%",
    height: "100%",
  },
  splashTitle: {
    fontSize: 34,
    fontWeight: "900",
    color: palette.white,
    letterSpacing: -0.5,
  },
  splashSubtitle: {
    maxWidth: 260,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.82)",
  },
})

const buttonStyles = {
  primary: {
    button: {
      backgroundColor: palette.primary,
      shadowColor: palette.primary,
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    text: {
      color: palette.white,
    },
    indicator: palette.white,
  },
  secondary: {
    button: {
      backgroundColor: palette.secondary,
    },
    text: {
      color: palette.white,
    },
    indicator: palette.white,
  },
  outline: {
    button: {
      backgroundColor: palette.white,
      borderWidth: 1,
      borderColor: palette.primary,
    },
    text: {
      color: palette.primary,
    },
    indicator: palette.primary,
  },
}

const pillStyles = {
  neutral: {
    wrap: {
      backgroundColor: "#f3f7fd",
      backgroundColor: "#f5f7f4",
      borderColor: palette.border,
    },
    text: {
      color: palette.muted,
    },
  },
  good: {
    wrap: {
      backgroundColor: "#e9f6f1",
      borderColor: "#b9ddd1",
    },
    text: {
      color: palette.success,
    },
  },
  warm: {
    wrap: {
      backgroundColor: "#fff2e5",
      borderColor: "#f3c89d",
    },
    text: {
      color: palette.accent,
    },
  },
}
