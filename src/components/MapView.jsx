import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useDrones } from "../context/DroneContext"
import { fetchTrailByDrone } from "../services/trailApi"
import droneIcon from "../assets/drone.png"

mapboxgl.accessToken =
  "pk.eyJ1IjoibWluaHRhbjQ3MTEwMCIsImEiOiJjbWw5aHRmc2IwMzU2M2VxNGs1dGU3NHhrIn0.O4ErCdPrP5AY8oCpx0w7Rg"

const MIN_ZOOM_FOR_TRAIL = 10

export default function MapView() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const popupRef = useRef(null)

  const trailSourceRef = useRef(null)
  const trailLayerRef = useRef(null)
  const trailPointsRef = useRef([])

  const trailCacheRef = useRef(new Map()) // droneId -> points[]
  const abortRef = useRef(null)

  const { drones, selectedDroneId, setSelectedDroneId } = useDrones()

  /* ---------------- INIT MAP ---------------- */
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
      if (!map.hasImage("drone-icon")) {
        const img = new Image(28, 28)
        img.src = droneIcon
        await img.decode()
        map.addImage("drone-icon", img)
      }

      map.addSource("drones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 12,
      })

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
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            50,
            24,
            200,
            30,
          ],
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

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        })
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
          .setHTML(`
            <div style="font-size:12px">
              <b>Drone:</b> ${f.properties.id.slice(0, 8)}<br/>
              Speed: ${Number(f.properties.speed).toFixed(1)} m/s<br/>
              Heading: ${Number(f.properties.heading).toFixed(0)}°<br/>
              Status: ${f.properties.status}
            </div>
          `)
          .addTo(map)
      })

      map.on("mouseleave", "unclustered-drone", () => {
        map.getCanvas().style.cursor = ""
        popupRef.current?.remove()
        popupRef.current = null
      })
    })

    mapRef.current = map
  }, [])

  /* ---------------- UPDATE DRONES ---------------- */
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
        },
      })),
    })
  }, [drones])

  /* ---------------- HIGHLIGHT SELECTED ---------------- */
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

  /* ---------------- LOAD TRAIL ---------------- */
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId) return
    const map = mapRef.current

    async function loadTrail() {
      if (map.getZoom() < MIN_ZOOM_FOR_TRAIL) {
        clearTrail(true)
        return
      }

      // cache hit
      if (trailCacheRef.current.has(selectedDroneId)) {
        trailPointsRef.current = [...trailCacheRef.current.get(selectedDroneId)]
        renderTrail(trailPointsRef.current)
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
        if (points.length < 2) return

        trailCacheRef.current.set(selectedDroneId, points)
        trailPointsRef.current = [...points]
        renderTrail(points)
      } catch (err) {
        if (err.name !== "AbortError") console.error(err)
      }
    }

    function renderTrail(points) {
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

    function clearTrail(clearCache = false) {
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

    loadTrail()
  }, [selectedDroneId])

  /* ---------------- REALTIME APPEND TRAIL ---------------- */
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId || !trailSourceRef.current) return
    const map = mapRef.current
    const source = map.getSource(trailSourceRef.current)
    if (!source) return

    const drone = drones.find((d) => d.id === selectedDroneId)
    if (!drone) return

    const last = trailPointsRef.current.at(-1)
    if (last && last.lat === drone.lat && last.lng === drone.lng) return

    const newPoint = { lat: drone.lat, lng: drone.lng }
    trailPointsRef.current.push(newPoint)

    source.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: trailPointsRef.current.map((p) => [p.lng, p.lat]),
      },
    })
  }, [drones, selectedDroneId])

  /* ---------------- CLEAR TRAIL ON ZOOM OUT ---------------- */
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    const onZoom = () => {
      if (map.getZoom() < MIN_ZOOM_FOR_TRAIL && trailLayerRef.current) {
        if (map.getLayer(trailLayerRef.current))
          map.removeLayer(trailLayerRef.current)
        if (map.getSource(trailSourceRef.current))
          map.removeSource(trailSourceRef.current)

        trailLayerRef.current = null
        trailSourceRef.current = null
        trailPointsRef.current = []

        if (selectedDroneId) trailCacheRef.current.delete(selectedDroneId)
      }
    }

    map.on("zoom", onZoom)
    return () => map.off("zoom", onZoom)
  }, [selectedDroneId])

  return <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />
}
