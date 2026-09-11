import { Navigate } from "react-router-dom"
import {
  getActiveRole,
  getRoleHomePath,
  getRoleLoginPath,
  isRoleAuthenticated,
  setActiveRole,
  ROLE_USER,
} from "../services/authSession"

export default function ProtectedRoute({ children, role = ROLE_USER }) {
  const roleLoggedIn = isRoleAuthenticated(role)
  if (!roleLoggedIn) {
    return <Navigate to={getRoleLoginPath(role)} replace />
  }

  const activeRole = getActiveRole()
  if (activeRole && activeRole !== role && isRoleAuthenticated(activeRole)) {
    return <Navigate to={getRoleHomePath(activeRole)} replace />
  }
  setActiveRole(role)
  return children
}
