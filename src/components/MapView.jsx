/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useDrones } from "../context/DroneContext"
import { fetchTrailByDrone } from "../services/trailApi"
import droneIcon from "../assets/drone.png"
import FilterPanel from "./FilterPanel"

mapboxgl.accessToken =
  "pk.eyJ1IjoibWluaHRhbjQ3MTEwMCIsImEiOiJjbWw5aHRmc2IwMzU2M2VxNGs1dGU3NHhrIn0.O4ErCdPrP5AY8oCpx0w7Rg"

const MIN_ZOOM_FOR_TRAIL = 10
const REPLAY_WINDOW_MS = 5 * 60 * 1000
const MAX_TRAIL_POINTS = 200

export default function MapView() {
  // refs
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const popupRef = useRef(null)

  const trailSourceRef = useRef(null)
  const trailLayerRef = useRef(null)
  const trailPointsRef = useRef([])

  const trailCacheRef = useRef(new Map())
  const abortRef = useRef(null)
  const selectedStatusRef = useRef(null)
  const needsTrailReloadRef = useRef(false)

  // state
  const {
    drones,
    liveDrones,
    selectedDroneId,
    setSelectedDroneId,
    mode, // live | play | pause
    currentTs,
  } = useDrones()

  // map init
  useEffect(() => {
    if (mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [105.8, 21.0],
      zoom: 5,
    })

    map.addControl(new mapboxgl.NavigationControl())

    map.on("load", async () => {
      await ensureDroneIcon(map)
      setupDroneSource(map)
      setupDroneLayers(map)
      bindMapEvents(map, setSelectedDroneId, popupRef)
    })

    mapRef.current = map
  }, [setSelectedDroneId])

  // drone source update
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    const source = map.getSource("drones")
    if (!source) return

    source.setData({
      type: "FeatureCollection",
      features: drones.map((d) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [d.lng, d.lat] },
        properties: {
          id: d.id,
          speed: d.speed,
          heading: d.heading,
          status: d.status,
          ts: d.ts,
        },
      })),
    })
  }, [drones])

  // select highlight
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    if (!map.getLayer("selected-drone")) return

    map.setFilter("selected-drone", [
      "all",
      ["!", ["has", "point_count"]],
      ["==", ["get", "id"], selectedDroneId || ""],
    ])
  }, [selectedDroneId])

  // trail helpers
  // remove trail for selected drone
  function clearTrail(map, clearCache = false) {
    if (trailLayerRef.current && map.getLayer(trailLayerRef.current))
      map.removeLayer(trailLayerRef.current)
    if (trailSourceRef.current && map.getSource(trailSourceRef.current))
      map.removeSource(trailSourceRef.current)

    trailLayerRef.current = null
    trailSourceRef.current = null
    trailPointsRef.current = []

    if (clearCache && selectedDroneId) {
      trailCacheRef.current.delete(selectedDroneId)
    }
  }

  // draw line from a list of points -> trail
  function renderTrailPoints(map, points) {
    if (!points || points.length < 2) {
      clearTrail(map)
      return
    }

    const geojson = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map((p) => [p.lng, p.lat]),
      },
    }

    if (!trailSourceRef.current) {
      const sourceId = "selected-drone-trail-src"
      const layerId = "selected-drone-trail-layer"

      map.addSource(sourceId, { type: "geojson", data: geojson })
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#ff5500",
          "line-width": 3,
          "line-opacity": 0.85,
        },
      })

      trailSourceRef.current = sourceId
      trailLayerRef.current = layerId
    } else {
      map.getSource(trailSourceRef.current).setData(geojson)
    }
  }

  // slice trail by replay window
  function renderTrailSlice() {
    const map = mapRef.current
    if (!map || !selectedDroneId) return

    const all = trailCacheRef.current.get(selectedDroneId) || []
    if (all.length < 2) {
      clearTrail(map)
      return
    }

    let slice = all
    if (mode !== "live" && currentTs) {
      const from = currentTs - REPLAY_WINDOW_MS
      slice = all.filter((p) => p.ts >= from && p.ts <= currentTs)
    }

    trailPointsRef.current = slice
    renderTrailPoints(map, slice)
  }

  // fetch trail from BE for selected drone
  async function loadTrailForSelected() {
    if (!mapRef.current || !selectedDroneId) return
    const map = mapRef.current
    if (map.getZoom() < MIN_ZOOM_FOR_TRAIL) {
      clearTrail(map, true)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetchTrailByDrone(selectedDroneId, {
        signal: controller.signal,
      })
      const points = res.positions || []
      const trimmed = points.slice(-MAX_TRAIL_POINTS)
      trailCacheRef.current.set(selectedDroneId, trimmed)
      trailPointsRef.current = trimmed
      renderTrailSlice()
    } catch (err) {
      if (err.name !== "AbortError") console.error(err)
    }
  }

  // trail effect
  // reset status tracker when changing selected drone
  useEffect(() => {
    selectedStatusRef.current = null
  }, [selectedDroneId])

  // clear and reload trail when status changes but keep selection
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId) return
    const map = mapRef.current
    const sourceList = mode === "live" ? liveDrones : drones
    const drone = sourceList.find((d) => d.id === selectedDroneId)

    if (!drone) {
      clearTrail(map, true)
      selectedStatusRef.current = null
      needsTrailReloadRef.current = false
      return
    }

    if (selectedStatusRef.current && selectedStatusRef.current !== drone.status) {
      clearTrail(map, true)
      needsTrailReloadRef.current = true
    }

    if (selectedStatusRef.current === null || needsTrailReloadRef.current) {
      needsTrailReloadRef.current = false
      loadTrailForSelected()
    }

    selectedStatusRef.current = drone.status
  }, [drones, liveDrones, selectedDroneId, mode])

  // load trail when selecting a drone
  useEffect(() => {
    if (!selectedDroneId) return
    loadTrailForSelected()
  }, [selectedDroneId])

  // update trail slice on replay time changes
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId) return
    if (!trailCacheRef.current.has(selectedDroneId)) return
    if (mode === "live") return

    renderTrailSlice()
  }, [mode, currentTs, selectedDroneId])

  // append realtime points in live mode
  useEffect(() => {
    if (
      !mapRef.current ||
      !selectedDroneId ||
      !trailSourceRef.current ||
      mode !== "live"
    )
      return

    const map = mapRef.current
    const source = map.getSource(trailSourceRef.current)
    if (!source) return

    const drone = drones.find((d) => d.id === selectedDroneId)
    if (!drone) return

    const last = trailPointsRef.current.at(-1)
    if (last && last.lat === drone.lat && last.lng === drone.lng) return

    const newPoint = { lat: drone.lat, lng: drone.lng }
    trailPointsRef.current.push(newPoint)
    if (trailPointsRef.current.length > MAX_TRAIL_POINTS) {
      trailPointsRef.current = trailPointsRef.current.slice(-MAX_TRAIL_POINTS)
    }

    source.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: trailPointsRef.current.map((p) => [p.lng, p.lat]),
      },
    })
  }, [drones, selectedDroneId, mode])

  // switch live/play/pause
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId) return
    const map = mapRef.current

    if (mode === "live") {
      clearTrail(map, true)
      loadTrailForSelected()
    } else {
      clearTrail(map)
    }
  }, [mode, selectedDroneId])

  // clear trail when zooming out too far
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    const onZoom = () => {
      if (map.getZoom() < MIN_ZOOM_FOR_TRAIL && trailLayerRef.current) {
        clearTrail(map, true)
      }
    }

    map.on("zoom", onZoom)
    return () => map.off("zoom", onZoom)
  }, [selectedDroneId])

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />
      <FilterPanel />
    </div>
  )
}

// map setup helpers
async function ensureDroneIcon(map) {
  if (map.hasImage("drone-icon")) return
  const img = new Image(28, 28)
  img.src = droneIcon
  await img.decode()
  map.addImage("drone-icon", img)
}

function setupDroneSource(map) {
  map.addSource("drones", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 12,
  })
}

function setupDroneLayers(map) {
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "drones",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#51bbd6",
        50,
        "#f1f075",
        200,
        "#f28cb1",
      ],
      "circle-radius": ["step", ["get", "point_count"], 18, 50, 24, 200, 30],
    },
  })

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "drones",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 12,
    },
  })

  map.addLayer({
    id: "unclustered-drone",
    type: "symbol",
    source: "drones",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": "drone-icon",
      "icon-size": 1,
      "icon-allow-overlap": true,
    },
  })

  map.addLayer({
    id: "selected-drone",
    type: "circle",
    source: "drones",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], ""]],
    paint: {
      "circle-radius": 18,
      "circle-color": "#ff5500",
      "circle-opacity": 0.3,
    },
  })
}

function bindMapEvents(map, setSelectedDroneId, popupRef) {
  map.on("click", "clusters", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })
    const clusterId = features[0].properties.cluster_id
    map
      .getSource("drones")
      .getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return
        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom,
        })
      })
  })

  map.on("click", "unclustered-drone", (e) => {
    const f = e.features[0]
    const droneId = f.properties.id
    setSelectedDroneId(droneId)
    map.easeTo({
      center: f.geometry.coordinates,
      zoom: Math.max(map.getZoom(), 12),
    })
  })

  map.on("mouseenter", "unclustered-drone", (e) => {
    map.getCanvas().style.cursor = "pointer"
    const f = e.features[0]
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 15,
    })
      .setLngLat(f.geometry.coordinates)
      .setHTML(buildPopupHTML(f.properties))
      .addTo(map)
  })

  map.on("mouseleave", "unclustered-drone", () => {
    map.getCanvas().style.cursor = ""
    popupRef.current?.remove()
    popupRef.current = null
  })
}

function buildPopupHTML(props) {
  return `
    <div style="
      min-width: 180px;
      font-family: 'Manrope', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      font-size: 12px;
      color: #0f172a;
    ">
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      ">
        <div style="font-weight: 700; letter-spacing: .2px;">
          Drone ${String(props.id).slice(0, 8)}
        </div>
        <span style="
          background: #e2e8f0;
          color: #334155;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 700;
        ">
          ${props.status}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr auto; row-gap: 4px; column-gap: 8px;">
        <span style="color:#64748b;">Speed</span>
        <span style="font-weight:600;">${Number(props.speed).toFixed(1)} m/s</span>

        <span style="color:#64748b;">Heading</span>
        <span style="font-weight:600;">${Number(props.heading).toFixed(0)}°</span>
      </div>
    </div>
  `
}
