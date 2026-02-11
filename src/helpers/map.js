import droneIcon from "../assets/drone.png"

export async function ensureDroneIcon(map) {
    if (map.hasImage("drone-icon")) return
    const img = new Image(28, 28)
    img.src = droneIcon
    await img.decode()
    map.addImage("drone-icon", img)
}

export function setupDroneSource(map) {
    map.addSource("drones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 12,
    })
}

export function setupDroneLayers(map) {
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

export function buildPopupHTML(props) {
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

export function bindMapEvents(mapboxgl, map, setSelectedDroneId, popupRef) {
    if (!popupRef) return
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
