import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useDrones } from "../context/DroneContext";
import droneIcon from "../assets/drone.png";

mapboxgl.accessToken = "pk.eyJ1IjoibWluaHRhbjQ3MTEwMCIsImEiOiJjbWw5aHRmc2IwMzU2M2VxNGs1dGU3NHhrIn0.O4ErCdPrP5AY8oCpx0w7Rg";

export default function MapView() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const popupsRef = useRef({})
  const { drones, trails } = useDrones()

  // init map
  useEffect(() => {
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [105.8, 21.0],
      zoom: 12,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl());
  }, []);

  // update drones
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    drones.forEach((d) => {
      let marker = markersRef.current[d.id]
      let popup = popupsRef.current[d.id]

      const popupHTML = `
        <div style="font-size:12px">
          <b>Drone:</b> ${d.id.slice(0, 8)}<br/>
          Speed: ${d.speed.toFixed(1)} m/s<br/>
          Heading: ${d.heading.toFixed(0)}°<br/>
          Status: ${d.status}
        </div>
      `

      if (!marker) {
        const el = document.createElement("img")
        el.src = droneIcon
        el.style.width = "32px"
        el.style.height = "32px"
        el.style.cursor = "pointer"

        popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 25,
        }).setHTML(popupHTML)

        el.addEventListener("mouseenter", () => popup.addTo(map))
        el.addEventListener("mouseleave", () => popup.remove())

        marker = new mapboxgl.Marker(el)
          .setLngLat([d.lng, d.lat])
          .addTo(map)

        markersRef.current[d.id] = marker
        popupsRef.current[d.id] = popup
      } else {
        marker.setLngLat([d.lng, d.lat])
        popup.setLngLat([d.lng, d.lat]).setHTML(popupHTML)
      }
    })
  }, [drones])

  // update trails
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    Object.entries(trails).forEach(([id, points]) => {
      const sourceId = `trail-${id}`
      const data = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: points.map((p) => [p.lng, p.lat]),
        },
      }

      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(data)
      } else {
        map.addSource(sourceId, {
          type: "geojson",
          data,
        })

        map.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#00ffff",
            "line-width": 3,
            "line-opacity": 0.8,
          },
        })
      }
    })
  }, [trails])

  return <div ref={mapContainer} style={{ width: "100vw", height: "100vh" }} />;
}
