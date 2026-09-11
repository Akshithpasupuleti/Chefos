import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { api, configureApi } from "../api/client"
import { ROLE_CHEF, ROLE_USER, clearSession, loadSession, persistSession } from "./session"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [booting, setBooting] = useState(true)
  const [role, setRole] = useState(null)
  const [accessToken, setAccessToken] = useState("")
  const [refreshToken, setRefreshToken] = useState("")
  const [username, setUsername] = useState("")

  useEffect(() => {
    loadSession()
      .then((data) => {
        setRole(data.role)
        setAccessToken(data.access)
        setRefreshToken(data.refresh)
        setUsername(data.username)
      })
      .finally(() => setBooting(false))
  }, [])

  const setSession = async ({ role: nextRole, accessToken: nextAccess, refreshToken: nextRefresh, username: nextUsername }) => {
    setRole(nextRole)
    setAccessToken(nextAccess || "")
    setRefreshToken(nextRefresh || "")
    setUsername(nextUsername || "")
    await persistSession(nextRole, {
      access: nextAccess,
      refresh: nextRefresh,
      username: nextUsername,
    })
  }

  const logout = async (targetRole = role) => {
    if (targetRole) {
      await clearSession(targetRole)
    }
    setRole(null)
    setAccessToken("")
    setRefreshToken("")
    setUsername("")
  }

  useEffect(() => {
    configureApi({
      getAuthState: () => ({
        role,
        accessToken,
        refreshToken,
        username,
        setSession,
      }),
      onLogout: logout,
    })
  }, [role, accessToken, refreshToken, username])

  const value = useMemo(
    () => ({
      booting,
      role,
      username,
      accessToken,
      refreshToken,
      isAuthenticated: Boolean(role && accessToken),
      setSession,
      logout,
      login: async ({ role: authRole, username: nextUsername, password }) => {
        const res = await api.post("token/", { username: nextUsername, password })
        await setSession({
          role: authRole,
          accessToken: res.data.access,
          refreshToken: res.data.refresh,
          username: nextUsername,
        })
        if (authRole === ROLE_CHEF) {
          try {
            await api.get("chefs/partner/me/")
          } catch (error) {
            await logout(authRole)
            throw new Error(error?.response?.data?.detail || "This account is not a chef partner account.")
          }
        } else {
          try {
            await api.get("chefs/partner/me/")
            await logout(authRole)
            throw new Error("This account is a chef partner account. Please use chef login.")
          } catch (error) {
            if ([401, 403, 404].includes(error?.response?.status)) {
              return
            }
            if (error?.message) {
              throw error
            }
          }
        }
      },
      signupUser: async ({ username: nextUsername, email, password }) => {
        await api.post("register/", { username: nextUsername, email, password })
      },
      registerChef: async (payload) => {
        await api.post("chefs/partner/register/", payload)
      },
    }),
    [booting, role, username, accessToken, refreshToken]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}

export { ROLE_USER, ROLE_CHEF }
