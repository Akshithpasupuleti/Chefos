import axios from "axios"
import Constants from "expo-constants"

let authAccessor = () => ({ accessToken: "", refreshToken: "", role: null })
let logoutHandler = async () => {}

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "http://192.168.94.68:8000/api/"

export const api = axios.create({
  baseURL: apiBaseUrl,
})

export function configureApi({ getAuthState, onLogout }) {
  authAccessor = getAuthState
  logoutHandler = onLogout
}

api.interceptors.request.use((config) => {
  const { accessToken } = authAccessor()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original?._retry) {
      const { refreshToken } = authAccessor()
      if (!refreshToken) {
        await logoutHandler()
        return Promise.reject(error)
      }
      original._retry = true
      try {
        const res = await axios.post(`${apiBaseUrl}token/refresh/`, { refresh: refreshToken })
        const current = authAccessor()
        await current.setSession?.({
          role: current.role,
          accessToken: res.data.access,
          refreshToken,
          username: current.username,
        })
        original.headers.Authorization = `Bearer ${res.data.access}`
        return api(original)
      } catch (refreshError) {
        await logoutHandler()
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  }
)
