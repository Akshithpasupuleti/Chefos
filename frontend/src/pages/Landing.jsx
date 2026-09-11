import { Link, useNavigate } from "react-router-dom"

import Button from "../components/common/Button"
import { ROLE_CHEF, ROLE_USER, isRoleAuthenticated } from "../services/authSession"

export default function Landing() {
  const navigate = useNavigate()
  const userLoggedIn = isRoleAuthenticated(ROLE_USER)
  const chefLoggedIn = isRoleAuthenticated(ROLE_CHEF)

  return (
    <div className="bg-[var(--color-cream)] text-[var(--color-text)]">
      <nav className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/src/assets/chefos.jpeg" alt="Chefos logo" className="h-9 w-auto" />
          <span className="text-xl font-semibold text-[var(--color-text)]">Chefos</span>
        </div>

        <div className="flex gap-4">
          <Link to={chefLoggedIn ? "/chef/dashboard" : "/chef/login"}>
            <Button variant="secondary">{chefLoggedIn ? "Partner App" : "Become a Chef"}</Button>
          </Link>
          {chefLoggedIn && (
            <Link to="/chef/console">
              <Button variant="secondary">Chef Console</Button>
            </Link>
          )}
          <Link to={userLoggedIn ? "/user/dashboard" : "/user/login"}>
            <Button variant="outline">{userLoggedIn ? "Dashboard" : "Login"}</Button>
          </Link>
          {!userLoggedIn && (
            <Link to="/signup">
              <Button>Get Started</Button>
            </Link>
          )}
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-14 items-center">
        <div>
          <h2 className="text-4xl md:text-5xl font-semibold leading-tight">
            A personal chef, <br />
            <span className="text-[var(--color-primary)]">at your home.</span>
          </h2>

          <p className="mt-6 text-lg text-[var(--color-muted)] max-w-lg">
            Subscribe to trusted home chefs for daily meals personalised to your taste and schedule.
          </p>

          <div className="mt-8 flex gap-4">
            <Button className="px-7 py-3 text-lg" onClick={() => navigate(userLoggedIn ? "/user/find-chef" : "/user/login")}>
              Find a Chef
            </Button>
            <Button variant="outline" onClick={() => navigate(userLoggedIn ? "/user/ai-menu" : "/user/login")}>
              Build My Menu
            </Button>
          </div>
        </div>

        <div className="relative">
          <img src="/src/assets/banner.png" alt="Home chef cooking" className="rounded-3xl shadow-lg object-cover w-full h-[420px]" />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <Feature title="Verified Home Chefs" desc="Background-checked chefs experienced in home-style cooking." />
          <Feature title="AI-Based Menu Planning" desc="Meals customised to your diet and goals." />
          <Feature title="Flexible Subscriptions" desc="Breakfast, lunch, dinner with monthly plans." />
        </div>
      </section>

      <section className="bg-white border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <img src="https://images.unsplash.com/photo-1556910103-1c02745aae4d" alt="Healthy home food" className="rounded-2xl shadow-sm" />

          <div>
            <h3 className="text-3xl font-semibold">Built for busy lives</h3>
            <p className="mt-4 text-[var(--color-muted)] text-lg">
              No daily cooking stress and no unhealthy outside food, just consistent home-style meals.
            </p>
          </div>
        </div>
      </section>

      <footer className="text-center py-8 text-sm text-[var(--color-muted)]">© {new Date().getFullYear()} Chefos. All rights reserved.</footer>
    </div>
  )
}

function Feature({ title, desc }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[var(--color-border)] shadow-sm">
      <h4 className="font-semibold text-lg">{title}</h4>
      <p className="mt-2 text-[var(--color-muted)] text-sm">{desc}</p>
    </div>
  )
}
