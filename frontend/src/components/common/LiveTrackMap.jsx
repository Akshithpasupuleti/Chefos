import { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

const chefIcon = L.divIcon({
  className: "chef-map-icon",
  html: '<div style="width:34px;height:34px;border-radius:999px;background:#ffffff;border:2px solid #0f7a5e;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 6px 14px rgba(0,0,0,.2)">👨‍🍳</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -30],
})

const userIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  iconRetinaUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

export default function LiveTrackMap({ chefLat, chefLng, userLat, userLng, height = 250 }) {
  const [route, setRoute] = useState([])
  const [followChef, setFollowChef] = useState(true)
  const [recenterTick, setRecenterTick] = useState(0)
  const [animatedChefPos, setAnimatedChefPos] = useState([chefLat, chefLng])
  const animationRef = useRef(null)

  const fallbackRoute = useMemo(
    () => [
      [animatedChefPos[0], animatedChefPos[1]],
      [userLat, userLng],
    ],
    [animatedChefPos, userLat, userLng]
  )

  const coordsValid = useMemo(() => {
    const clat = Number(chefLat)
    const clng = Number(chefLng)
    const ulat = Number(userLat)
    const ulng = Number(userLng)
    if (![clat, clng, ulat, ulng].every(Number.isFinite)) return false
    if (Math.abs(clat) > 90 || Math.abs(ulat) > 90 || Math.abs(clng) > 180 || Math.abs(ulng) > 180) return false
    // Guard against missing coordinate defaults.
    if (Math.abs(ulat) < 0.0001 && Math.abs(ulng) < 0.0001) return false
    if (Math.abs(clat) < 0.0001 && Math.abs(clng) < 0.0001) return false
    return true
  }, [chefLat, chefLng, userLat, userLng])

  useEffect(() => {
    if (!coordsValid) {
      setRoute([])
      return undefined
    }
    const controller = new AbortController()
    const url = `https://router.project-osrm.org/route/v1/driving/${chefLng},${chefLat};${userLng},${userLat}?overview=full&geometries=geojson`
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (!Array.isArray(coords) || !coords.length) {
          setRoute([])
          return
        }
        setRoute(coords.map(([lng, lat]) => [lat, lng]))
      })
      .catch(() => setRoute([]))
    return () => controller.abort()
  }, [chefLat, chefLng, userLat, userLng, coordsValid])

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    const fromLat = Number(animatedChefPos[0])
    const fromLng = Number(animatedChefPos[1])
    const toLat = Number(chefLat)
    const toLng = Number(chefLng)
    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
      setAnimatedChefPos([chefLat, chefLng])
      return undefined
    }

    const start = performance.now()
    const duration = 1400
    const animate = (ts) => {
      const progress = Math.min(1, (ts - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextLat = fromLat + (toLat - fromLat) * eased
      const nextLng = fromLng + (toLng - fromLng) * eased
      setAnimatedChefPos([nextLat, nextLng])
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        animationRef.current = null
      }
    }
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [chefLat, chefLng])

  const polyline = route.length > 1 ? route : fallbackRoute

  if (!coordsValid) {
    return (
      <div className="rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-cream)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
        Live tracking is waiting for valid location coordinates.
      </div>
    )
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-[var(--color-border)]">
      <div className="absolute top-2 right-2 z-[500] flex gap-2">
        <button
          type="button"
          onClick={() => setFollowChef((prev) => !prev)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border shadow ${
            followChef
              ? "bg-[#0f7a5e] text-white border-[#0f7a5e]"
              : "bg-white/95 text-[var(--color-text)] border-[var(--color-border)]"
          }`}
        >
          {followChef ? "Following Chef" : "Follow Chef"}
        </button>
        <button
          type="button"
          onClick={() => setRecenterTick((prev) => prev + 1)}
          className="rounded-lg bg-white/95 border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow"
        >
          Recenter
        </button>
      </div>
      <MapContainer center={[userLat, userLng]} zoom={14} scrollWheelZoom={false} className="w-full" style={{ height: `${height}px` }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <TrackFit
          chefLat={animatedChefPos[0]}
          chefLng={animatedChefPos[1]}
          userLat={userLat}
          userLng={userLng}
          followChef={followChef}
          recenterTick={recenterTick}
        />
        <Polyline positions={polyline} pathOptions={{ color: "#0f7a5e", weight: 5 }} />
        <Marker position={[animatedChefPos[0], animatedChefPos[1]]} icon={chefIcon}>
          <Popup>Chef live location</Popup>
        </Marker>
        <Marker position={[userLat, userLng]} icon={userIcon}>
          <Popup>Your location</Popup>
        </Marker>
        <Circle center={[userLat, userLng]} radius={120} pathOptions={{ color: "#d32f2f", fillOpacity: 0.08 }} />
      </MapContainer>
    </div>
  )
}

function TrackFit({ chefLat, chefLng, userLat, userLng, followChef, recenterTick }) {
  const map = useMap()

  useEffect(() => {
    if (!followChef) return
    const bounds = L.latLngBounds([chefLat, chefLng], [userLat, userLng])
    map.fitBounds(bounds, { padding: [35, 35], animate: true })
  }, [map, chefLat, chefLng, userLat, userLng, followChef])

  useEffect(() => {
    if (!recenterTick) return
    const bounds = L.latLngBounds([chefLat, chefLng], [userLat, userLng])
    map.fitBounds(bounds, { padding: [35, 35], animate: true })
  }, [map, chefLat, chefLng, userLat, userLng, recenterTick])

  return null
}
