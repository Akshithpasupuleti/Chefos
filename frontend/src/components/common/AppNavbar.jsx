import { NavLink, useNavigate } from "react-router-dom"

import chefosLogo from "../../assets/chefos.jpeg"
import { ROLE_USER, clearRoleSession, getRoleUsername } from "../../services/authSession"
import Button from "./Button"

const links = [
  { label: "Dashboard", to: "/user/dashboard" },
  { label: "Menu", to: "/user/weekly-menu" },
  { label: "Today", to: "/user/schedule" },
  { label: "Chefs", to: "/user/find-chef" },
  { label: "History", to: "/user/history" },
]

export default function AppNavbar() {
  const username = getRoleUsername(ROLE_USER)
  const navigate = useNavigate()

  const logout = () => {
    clearRoleSession(ROLE_USER)
    navigate("/")
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[rgba(26,47,38,0.09)] bg-[rgba(251,250,246,0.86)] backdrop-blur">
      <div className="page-container py-3.5 flex justify-between items-center gap-4">
        <div className="flex items-center gap-5">
          <button
            type="button"
            className="flex items-center gap-2.5"
            onClick={() => navigate("/")}
          >
            <img src={chefosLogo} alt="Chefos" className="h-9 w-9 rounded-full object-cover soft-border" />
            <span className="text-lg font-extrabold tracking-tight text-[var(--color-text)]">Chefos</span>
          </button>

          <nav className="hidden md:flex items-center gap-2 rounded-xl p-1.5 bg-white/70 soft-border">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-3.5 py-2 text-sm rounded-lg transition ${
                    isActive
                      ? "bg-[var(--color-primary)] text-white shadow-[0_8px_18px_rgba(15,122,94,0.2)]"
                      : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-cream)]"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--color-muted)] hidden sm:block">Hi, {username || "there"}</span>
          <Button variant="outline" onClick={logout}>Logout</Button>
        </div>
      </div>
    </header>
  )
}
