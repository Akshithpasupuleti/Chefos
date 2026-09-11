import AsyncStorage from "@react-native-async-storage/async-storage"

export const ROLE_USER = "user"
export const ROLE_CHEF = "chef"

const KEYS = {
  [ROLE_USER]: {
    access: "user_access",
    refresh: "user_refresh",
    username: "user_username",
  },
  [ROLE_CHEF]: {
    access: "chef_access",
    refresh: "chef_refresh",
    username: "chef_username",
  },
  activeRole: "active_role",
}

export async function loadSession() {
  const activeRole = await AsyncStorage.getItem(KEYS.activeRole)
  if (activeRole !== ROLE_USER && activeRole !== ROLE_CHEF) {
    return { role: null, access: "", refresh: "", username: "" }
  }
  const map = KEYS[activeRole]
  const [access, refresh, username] = await Promise.all([
    AsyncStorage.getItem(map.access),
    AsyncStorage.getItem(map.refresh),
    AsyncStorage.getItem(map.username),
  ])
  return { role: activeRole, access: access || "", refresh: refresh || "", username: username || "" }
}

export async function persistSession(role, payload) {
  const map = KEYS[role]
  if (!map) return
  const pairs = [[KEYS.activeRole, role]]
  if (payload.access) pairs.push([map.access, payload.access])
  if (payload.refresh) pairs.push([map.refresh, payload.refresh])
  if (payload.username) pairs.push([map.username, payload.username])
  await AsyncStorage.multiSet(pairs)
}

export async function clearSession(role) {
  const map = KEYS[role]
  if (!map) return
  await AsyncStorage.multiRemove([KEYS.activeRole, map.access, map.refresh, map.username])
}
