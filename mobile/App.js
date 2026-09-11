import "react-native-gesture-handler"

import { NavigationContainer, DefaultTheme } from "@react-navigation/native"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { ErrorBoundary } from "./src/components/ErrorBoundary"
import { AuthProvider } from "./src/auth/AuthContext"
import { AppNavigator } from "./src/navigation/AppNavigator"
import { palette } from "./src/theme"

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.canvas,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
    primary: palette.primary,
  },
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="dark" />
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}
