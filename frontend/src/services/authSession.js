export const ROLE_USER = "user"
export const ROLE_CHEF = "chef"

const KEY_MAP = {
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
}

function roleLoginPath(role) {
  return role === ROLE_CHEF ? "/chef/login" : "/user/login"
}

function roleHomePath(role) {
  return role === ROLE_CHEF ? "/chef/dashboard" : "/user/dashboard"
}

export function getRoleLoginPath(role) {
  return roleLoginPath(role)
}

export function getRoleHomePath(role) {
  return roleHomePath(role)
}

export function getActiveRole() {
  const explicit = localStorage.getItem("active_role")
  if (explicit === ROLE_USER || explicit === ROLE_CHEF) return explicit

  // Legacy fallback.
  const legacyAccess = localStorage.getItem("access")
  const legacyAccountType = localStorage.getItem("account_type")
  if (legacyAccess) {
    return legacyAccountType === "chef_partner" ? ROLE_CHEF : ROLE_USER
  }
  return null
}

export function setActiveRole(role) {
  if (role === ROLE_USER || role === ROLE_CHEF) {
    localStorage.setItem("active_role", role)
  }
}

export function isRoleAuthenticated(role) {
  const keys = KEY_MAP[role]
  if (!keys) return false
  return Boolean(localStorage.getItem(keys.access))
}

export function getRoleUsername(role) {
  const keys = KEY_MAP[role]
  if (!keys) return ""
  return localStorage.getItem(keys.username) || ""
}

export function setRoleSession(role, { access, refresh, username }) {
  const keys = KEY_MAP[role]
  if (!keys) return
  if (access) localStorage.setItem(keys.access, access)
  if (refresh) localStorage.setItem(keys.refresh, refresh)
  if (username) localStorage.setItem(keys.username, username)
  setActiveRole(role)
}

export function clearRoleSession(role) {
  const keys = KEY_MAP[role]
  if (!keys) return
  localStorage.removeItem(keys.access)
  localStorage.removeItem(keys.refresh)
  localStorage.removeItem(keys.username)
  const active = getActiveRole()
  if (active === role) {
    localStorage.removeItem("active_role")
  }
}

export function clearAllSessions() {
  clearRoleSession(ROLE_USER)
  clearRoleSession(ROLE_CHEF)
  // Cleanup legacy keys.
  localStorage.removeItem("access")
  localStorage.removeItem("refresh")
  localStorage.removeItem("username")
  localStorage.removeItem("account_type")
}

export function getAccessTokenForRole(role) {
  const keys = KEY_MAP[role]
  if (!keys) return ""
  return localStorage.getItem(keys.access) || ""
}

export function getRefreshTokenForRole(role) {
  const keys = KEY_MAP[role]
  if (!keys) return ""
  return localStorage.getItem(keys.refresh) || ""
}

export function getActiveAccessToken() {
  const role = getActiveRole()
  if (role) {
    const token = getAccessTokenForRole(role)
    if (token) return token
  }
  // Legacy fallback.
  return localStorage.getItem("access") || ""
}

export function getActiveRefreshToken() {
  const role = getActiveRole()
  if (role) {
    const token = getRefreshTokenForRole(role)
    if (token) return token
  }
  // Legacy fallback.
  return localStorage.getItem("refresh") || ""
}
