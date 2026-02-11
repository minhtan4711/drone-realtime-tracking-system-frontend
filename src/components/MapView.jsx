/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useDrones } from "../context/DroneContext"
import FilterPanel from "./FilterPanel"
import {
  // trail limits / window
  MAPBOX_ACCESS_TOKEN,
  MAX_TRAIL_POINTS,
  MIN_ZOOM_FOR_TRAIL,
  // drone source id
  DRONE_SOURCE_ID,
} from "../constants/map"
import { 
  clearTrail,
  renderTrailSlice,
  loadTrailForSelected,
  appendLiveTrailPoint,
} from "../helpers/trail"
import {
  ensureDroneIcon,
  setupDroneSource,
  setupDroneLayers,
  bindMapEvents
} from "../helpers/map"

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN

export default function MapView() {
  // refs: keep Mapbox + trail state without re-renders
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

  // state from context
  const {
    drones,
    liveDrones,
    selectedDroneId,
    setSelectedDroneId,
    mode, // live | play | pause
    currentTs,
  } = useDrones()

  /* map init */
  useEffect(() => {
    if (mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [105.8, 21.0],
      zoom: 5,
    })

    map.addControl(new mapboxgl.NavigationControl())

    // setup sources/layers + interactions after map is ready
    map.on("load", async () => {
      await ensureDroneIcon(map)
      setupDroneSource(map)
      setupDroneLayers(map)
      bindMapEvents(mapboxgl,map, setSelectedDroneId, popupRef)
    })

    mapRef.current = map
    // cleanup on unmount (release WebGL + listeners)
    return () => {
      popupRef.current?.remove()
      popupRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [setSelectedDroneId])

  // update source when drones change
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    const source = map.getSource(DRONE_SOURCE_ID)
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

  // highlight selected drone
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

  // trail: reset status tracker when changing selected drone
  useEffect(() => {
    selectedStatusRef.current = null
  }, [selectedDroneId])

  // trail: clear and reload when status changes (keep selection)
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId) return
    const map = mapRef.current
    // choose drones data to render
    const sourceList = mode === "live" ? liveDrones : drones
    const drone = sourceList.find((d) => d.id === selectedDroneId)

    if (!drone) {
      // drone got filtered out -> clear trail
      clearTrail({
        map,
        trailLayerRef,
        trailSourceRef,
        trailPointsRef,
        trailCacheRef,
        selectedDroneId,
        clearCache: true
      })
      selectedStatusRef.current = null
      needsTrailReloadRef.current = false
      return
    }

    if (selectedStatusRef.current && selectedStatusRef.current !== drone.status) {
      // status changed -> clear trail and mark for reload
      clearTrail({
        map,
        trailLayerRef,
        trailSourceRef,
        trailPointsRef,
        trailCacheRef,
        selectedDroneId,
        clearCache: true
      })
      needsTrailReloadRef.current = true
    }

    if (selectedStatusRef.current === null || needsTrailReloadRef.current) {
      // first time select or after status change -> reload trail
      needsTrailReloadRef.current = false
      loadTrailForSelected({
        mapRef,
        selectedDroneId,
        abortRef,
        trailSourceRef,
        trailLayerRef,
        trailPointsRef,
        trailCacheRef,
        mode: "live",
        currentTs,
        clearCache: false
      })
    }

    // remember current status for next compare
    selectedStatusRef.current = drone.status
  }, [drones, liveDrones, selectedDroneId, mode])

  // trail: load when selecting a drone
  useEffect(() => {
    if (!selectedDroneId) return
    loadTrailForSelected({
      mapRef,
      selectedDroneId,
      abortRef,
      trailSourceRef,
      trailLayerRef,
      trailPointsRef,
      trailCacheRef,
      mode: "live",
      currentTs,
      clearCache: false
    })
  }, [selectedDroneId])

  // trail: update slice on replay time changes
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId) return
    if (!trailCacheRef.current.has(selectedDroneId)) return
    if (mode === "live") return

    // replay window slice in last 5 minutes
    renderTrailSlice({
      mapRef,
      trailSourceRef,
      trailLayerRef,
      trailPointsRef,
      trailCacheRef,
      selectedDroneId,
      mode,
      currentTs,
      clearCache: false
    })
  }, [mode, currentTs, selectedDroneId])

  // trail: append realtime trail in live mode
  useEffect(() => {
    if (
      !mapRef.current ||
      !selectedDroneId ||
      !trailSourceRef.current ||
      mode !== "live"
    )
      return

    // push newest point and trim to MAX_TRAIL_POINTS
    appendLiveTrailPoint({
      map: mapRef.current,
      drones,
      selectedDroneId,
      trailSourceRef,
      trailPointsRef,
      maxTrailPoints: MAX_TRAIL_POINTS,
    })
  }, [drones, selectedDroneId, mode])

  // trail: switch live/play/pause behavior
  useEffect(() => {
    if (!mapRef.current || !selectedDroneId) return
    const map = mapRef.current

    if (mode === "live") {
      // live -> clear replay trail and reload full trail for realtime
      clearTrail({
        map,
        trailLayerRef,
        trailSourceRef,
        trailPointsRef,
        trailCacheRef,
        selectedDroneId,
        clearCache: true
      })
      loadTrailForSelected({
        mapRef,
        selectedDroneId,
        abortRef,
        trailSourceRef,
        trailLayerRef,
        trailPointsRef,
        trailCacheRef,
        mode,
        currentTs,
        clearCache: false
      })
    } else {
      // play/pause -> stop realtime append and clear live trail
      clearTrail({
        map,
        trailLayerRef,
        trailSourceRef,
        trailPointsRef,
        trailCacheRef,
        selectedDroneId,
      })
    }
  }, [mode, selectedDroneId])

  // trail: clear when zooming out too far
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    const onZoom = () => {
      if (map.getZoom() < MIN_ZOOM_FOR_TRAIL && trailLayerRef.current) {
        clearTrail({
          map,
          trailLayerRef,
          trailSourceRef,
          trailPointsRef,
          trailCacheRef,
          selectedDroneId,
          clearCache: true
        })
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
