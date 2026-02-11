import {
    REPLAY_WINDOW_MS,
    MIN_ZOOM_FOR_TRAIL,
    MAX_TRAIL_POINTS
} from "../constants/map"
import { fetchTrailByDrone } from "../services/trailApi"

// remove trail for selected drone
export function clearTrail({
    map,
    trailLayerRef,
    trailSourceRef,
    trailPointsRef,
    trailCacheRef,
    selectedDroneId,
    clearCache
}) {
    if (
        !map ||
        !trailLayerRef ||
        !trailSourceRef ||
        !trailPointsRef ||
        !trailCacheRef
    ) return

    if (trailLayerRef.current && map.getLayer(trailLayerRef.current)) {
        map.removeLayer(trailLayerRef.current)
    }
    if (trailSourceRef.current && map.getSource(trailSourceRef.current)) {
        map.removeSource(trailSourceRef.current)
    }

    trailLayerRef.current = null
    trailSourceRef.current = null
    trailPointsRef.current = []

    if (clearCache && selectedDroneId) {
        trailCacheRef.current.delete(selectedDroneId)
    }
}

// append realtime point (live mode)
export function appendLiveTrailPoint({
    map,
    drones,
    selectedDroneId,
    trailSourceRef,
    trailPointsRef,
    maxTrailPoints = MAX_TRAIL_POINTS
}) {
    if (!map || !selectedDroneId || !trailSourceRef?.current) return

    const source = map.getSource(trailSourceRef.current)
    if (!source) return

    const drone = drones.find((d) => d.id === selectedDroneId)
    if (!drone) return

    const last = trailPointsRef.current.at(-1)
    if (last && last.lat === drone.lat && last.lng === drone.lng) return

    const newPoint = { lat: drone.lat, lng: drone.lng }
    trailPointsRef.current.push(newPoint)
    if (trailPointsRef.current.length > maxTrailPoints) {
        trailPointsRef.current = trailPointsRef.current.slice(-maxTrailPoints)
    }

    source.setData({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: trailPointsRef.current.map((p) => [p.lng, p.lat]),
        },
    })
}

// draw line from a list of points -> trail
export function renderTrailPoints({
    map,
    points,
    trailSourceRef,
    trailLayerRef,
    trailPointsRef,
    trailCacheRef,
    selectedDroneId,
    clearCache
}) {
    if (
        !map ||
        !trailSourceRef ||
        !trailLayerRef ||
        !trailPointsRef ||
        !trailCacheRef
    ) return

    if (!points || points.length < 2) {
        clearTrail({
            map,
            trailLayerRef,
            trailSourceRef,
            trailPointsRef,
            trailCacheRef,
            selectedDroneId,
            clearCache,
        })
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
export function renderTrailSlice({
    mapRef,
    trailSourceRef,
    trailLayerRef,
    trailPointsRef,
    trailCacheRef,
    selectedDroneId,
    mode,
    currentTs,
    clearCache = false
}) {
    if (
        !mapRef ||
        !trailLayerRef ||
        !trailSourceRef ||
        !trailPointsRef ||
        !trailCacheRef
    ) return

    const map = mapRef.current
    if (!map || !selectedDroneId) return

    const allPoints = trailCacheRef.current.get(selectedDroneId) || []
    if (allPoints.length < 2) {
        clearTrail({
            map,
            trailLayerRef,
            trailSourceRef,
            trailPointsRef,
            trailCacheRef,
            selectedDroneId,
            clearCache
        })
        return
    }

    let slicePoints = allPoints
    if (mode !== "live" && currentTs) {
        const from = currentTs - REPLAY_WINDOW_MS
        slicePoints = allPoints.filter((p) => p.ts >= from && p.ts <= currentTs)
    }

    trailPointsRef.current = slicePoints
    renderTrailPoints({
        map,
        points: slicePoints,
        trailSourceRef,
        trailLayerRef,
        trailPointsRef,
        trailCacheRef,
        selectedDroneId,
        clearCache
    })
}

// get trail for selected drone
export async function loadTrailForSelected({
    mapRef,
    selectedDroneId,
    abortRef,
    trailSourceRef,
    trailLayerRef,
    trailPointsRef,
    trailCacheRef,
    mode,
    currentTs,
    clearCache = false
}) {
    if (
        !mapRef ||
        !trailLayerRef ||
        !trailSourceRef ||
        !trailPointsRef ||
        !trailCacheRef ||
        !abortRef ||
        !selectedDroneId
    ) return

    const map = mapRef.current
    if (map.getZoom() < MIN_ZOOM_FOR_TRAIL) {
        clearTrail({
            map,
            trailLayerRef,
            trailSourceRef,
            trailPointsRef,
            trailCacheRef,
            selectedDroneId,
            clearCache: true
        })
        return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
        const res = await fetchTrailByDrone(selectedDroneId, {
            signal: controller.signal
        })
        const points = res.positions || []
        const trimmed = points.slice(-MAX_TRAIL_POINTS)
        trailCacheRef.current.set(selectedDroneId, trimmed)
        trailPointsRef.current = trimmed
        renderTrailSlice({
            mapRef,
            trailSourceRef,
            trailLayerRef,
            trailPointsRef,
            trailCacheRef,
            selectedDroneId,
            mode,
            currentTs,
            clearCache
        })
    } catch (err) {
        if (err.name !== "AbortError") console.error(err)
    }
}
