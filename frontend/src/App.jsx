import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import ProtectedRoute from "./routes/ProtectedRoute"
import AIMenu from "./pages/AIMenu"
import AssignChef from "./pages/AssignChef"
import ChefProfile from "./pages/ChefsProfile"
import ConfirmSubscription from "./pages/ConfirmSubscription"
import ChefConsole from "./pages/ChefConsole"
import ChefPartnerDashboard from "./pages/ChefPartnerDashboard"
import ChefHistory from "./pages/ChefHistory"
import ChefPartnerLogin from "./pages/ChefPartnerLogin"
import ChefPartnerRegister from "./pages/ChefPartnerRegister"
import Dashboard from "./pages/Dashboard"
import FindChef from "./pages/FindChef"
import Landing from "./pages/Landing"
import Login from "./pages/Login"
import MealSchedule from "./pages/MealScheduled"
import Signup from "./pages/Signup"
import UserHistory from "./pages/UserHistory"
import WeeklyMenu from "./pages/WeeklyMenu"

function protectedElement(element, role) {
  return <ProtectedRoute role={role}>{element}</ProtectedRoute>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Navigate to="/user/login" replace />} />
        <Route path="/user/login" element={<Login />} />
        <Route path="/user/signup" element={<Signup />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/chef-partner/login" element={<Navigate to="/chef/login" replace />} />
        <Route path="/chef/login" element={<ChefPartnerLogin />} />
        <Route path="/chef/register" element={<ChefPartnerRegister />} />
        <Route path="/chef-partner/register" element={<ChefPartnerRegister />} />

        <Route path="/user/dashboard" element={protectedElement(<Dashboard />, "user")} />
        <Route path="/user/find-chef" element={protectedElement(<FindChef />, "user")} />
        <Route path="/user/assign-chef" element={protectedElement(<AssignChef />, "user")} />
        <Route path="/user/chef" element={protectedElement(<ChefProfile />, "user")} />
        <Route path="/user/ai-menu" element={protectedElement(<AIMenu />, "user")} />
        <Route path="/user/weekly-menu" element={protectedElement(<WeeklyMenu />, "user")} />
        <Route path="/user/schedule" element={protectedElement(<MealSchedule />, "user")} />
        <Route path="/user/confirm" element={protectedElement(<ConfirmSubscription />, "user")} />
        <Route path="/user/history" element={protectedElement(<UserHistory />, "user")} />

        <Route path="/chef/dashboard" element={protectedElement(<ChefPartnerDashboard />, "chef")} />
        <Route path="/chef/history" element={protectedElement(<ChefHistory />, "chef")} />
        <Route path="/chef/console" element={protectedElement(<ChefConsole />, "chef")} />

        <Route path="/dashboard" element={<Navigate to="/user/dashboard" replace />} />
        <Route path="/find-chef" element={<Navigate to="/user/find-chef" replace />} />
        <Route path="/assign-chef" element={<Navigate to="/user/assign-chef" replace />} />
        <Route path="/chef" element={<Navigate to="/user/chef" replace />} />
        <Route path="/ai-menu" element={<Navigate to="/user/ai-menu" replace />} />
        <Route path="/weekly-menu" element={<Navigate to="/user/weekly-menu" replace />} />
        <Route path="/schedule" element={<Navigate to="/user/schedule" replace />} />
        <Route path="/confirm" element={<Navigate to="/user/confirm" replace />} />
        <Route path="/history" element={<Navigate to="/user/history" replace />} />
        <Route path="/chef-console" element={<Navigate to="/chef/console" replace />} />
        <Route path="/chef-partner/dashboard" element={<Navigate to="/chef/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
