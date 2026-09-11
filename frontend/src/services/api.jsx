import axios from "axios"
import {
  clearRoleSession,
  getActiveAccessToken,
  getActiveRefreshToken,
  getActiveRole,
  getRoleLoginPath,
  setRoleSession,
} from "./authSession"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/",
})

api.interceptors.request.use((config) => {
  const token = getActiveAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (clientTz) {
    config.headers["X-User-Timezone"] = clientTz
  }
  config.headers["X-User-UTC-Offset-Minutes"] = String(new Date().getTimezoneOffset())
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest?._retry) {
      const activeRole = getActiveRole()
      const refresh = getActiveRefreshToken()
      if (!refresh) {
        return Promise.reject(error)
      }

      originalRequest._retry = true
      try {
        const res = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL || "/api/"}token/refresh/`,
          { refresh }
        )

        if (activeRole) {
          setRoleSession(activeRole, { access: res.data.access })
        }
        originalRequest.headers.Authorization = `Bearer ${res.data.access}`
        return api(originalRequest)
      } catch (refreshError) {
        if (activeRole) {
          clearRoleSession(activeRole)
        }
        const loginPath = getRoleLoginPath(activeRole)
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath
        }

        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
