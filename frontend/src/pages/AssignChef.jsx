import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "../services/api"

export default function AssignChef() {
  const navigate = useNavigate()
  const [chefs, setChefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchChefs = async () => {
      try {
        const res = await api.get("chefs/") // list chefs
        setChefs(res.data)
      } catch (err) {
        setError("Failed to load chefs")
      } finally {
        setLoading(false)
      }
    }

    fetchChefs()
  }, [])

  const assignChef = async (chefId) => {
    try {
      await api.post("chefs/assign/", {
        chef_id: chefId,
      })

      navigate("/confirm")
    } catch (err) {
      alert("Chef assignment failed")
    }
  }

  if (loading) return <p className="p-6">Loading chefs...</p>
  if (error) return <p className="p-6 text-red-600">{error}</p>

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-6">Choose Your Chef</h2>

      <div className="grid md:grid-cols-3 gap-6">
        {chefs.map((chef) => (
          <div
            key={chef.id}
            className="border rounded-xl p-4 shadow-sm"
          >
            <h3 className="text-lg font-medium">{chef.name}</h3>
            <p className="text-sm text-gray-600">{chef.speciality}</p>

            <button
              onClick={() => assignChef(chef.id)}
              className="mt-4 w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
            >
              Assign Chef
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
