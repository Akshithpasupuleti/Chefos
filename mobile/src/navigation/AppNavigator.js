import { useEffect, useMemo, useState } from "react"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import Constants from "expo-constants"
import { Ionicons } from "@expo/vector-icons"

import { useAuth } from "../auth/AuthContext"
import { BrandSplashScreen } from "../components/ui"
import { palette } from "../theme"
import { AuthScreen } from "../screens/AuthScreen"
import { ChefHomeScreen } from "../screens/ChefHomeScreen"
import { ChefRegisterScreen } from "../screens/ChefRegisterScreen"
import { FindChefScreen } from "../screens/FindChefScreen"
import { ScheduleScreen } from "../screens/ScheduleScreen"
import { SignupScreen } from "../screens/SignupScreen"
import { SubscriptionScreen } from "../screens/SubscriptionScreen"
import { UserHomeScreen } from "../screens/UserHomeScreen"
import { WeeklyMenuScreen } from "../screens/WeeklyMenuScreen"

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()
const appVariant = Constants.expoConfig?.extra?.appVariant === "chef" ? "chef" : "user"

function UserTabs() {
  const iconMap = useMemo(
    () => ({
      Home: ["home", "home-outline"],
      Discover: ["search", "search-outline"],
      Menu: ["restaurant", "restaurant-outline"],
      Today: ["receipt", "receipt-outline"],
      Subscription: ["wallet", "wallet-outline"],
    }),
    []
  )

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: "#91a194",
        tabBarStyle: {
          backgroundColor: "rgba(251,250,246,0.98)",
          borderTopColor: "#d6dfd8",
          height: 76,
          paddingTop: 8,
          paddingBottom: 10,
          paddingHorizontal: 8,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
        },
        tabBarLabelStyle: {
          fontWeight: "700",
          fontSize: 11,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const [activeIcon, idleIcon] = iconMap[route.name] || ["ellipse", "ellipse-outline"]
          return <Ionicons name={focused ? activeIcon : idleIcon} size={size || 22} color={color} />
        },
      })}
    >
      <Tabs.Screen name="Home" component={UserHomeScreen} />
      <Tabs.Screen name="Discover" component={FindChefScreen} />
      <Tabs.Screen name="Menu" component={WeeklyMenuScreen} />
      <Tabs.Screen name="Today" component={ScheduleScreen} />
      <Tabs.Screen name="Subscription" component={SubscriptionScreen} />
    </Tabs.Navigator>
  )
}

function ChefStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChefHome" component={ChefHomeScreen} />
    </Stack.Navigator>
  )
}

export function AppNavigator() {
  const { booting, role, isAuthenticated } = useAuth()
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1700)
    return () => clearTimeout(timer)
  }, [])

  if (booting || showSplash) {
    return (
      <BrandSplashScreen
        label={appVariant === "chef" ? "Chefos Partner" : "Chefos"}
        subtitle={
          appVariant === "chef"
            ? "Chef partner operations, beautifully streamlined."
            : "Book chefs, manage meals, and stay on top of every day."
        }
      />
    )
  }

  if (isAuthenticated && role === "chef") {
    return <ChefStack />
  }

  if (isAuthenticated && role === "user") {
    return <UserTabs />
  }

  if (appVariant === "chef") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AuthChef" component={AuthScreen} initialParams={{ role: "chef" }} />
        <Stack.Screen name="ChefRegister" component={ChefRegisterScreen} />
      </Stack.Navigator>
    )
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AuthUser" component={AuthScreen} initialParams={{ role: "user" }} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  )
}
