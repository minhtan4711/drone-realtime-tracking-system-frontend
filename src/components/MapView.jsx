import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useDrones } from "../context/DroneContext";
import droneIcon from "../assets/drone.png";

mapboxgl.accessToken = "pk.eyJ1IjoibWluaHRhbjQ3MTEwMCIsImEiOiJjbWw5aHRmc2IwMzU2M2VxNGs1dGU3NHhrIn0.O4ErCdPrP5AY8oCpx0w7Rg";

export default function MapView() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const { drones } = useDrones();

  // Init map
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

  // Update drones
  useEffect(() => {
    if (!mapRef.current) return

    drones.forEach((drone) => {
      const { id, lng, lat, heading } = drone

      if (!markersRef.current[id]) {
        const el = document.createElement("img")
        el.src = droneIcon
        el.style.width = "32px"
        el.style.height = "32px"
        el.style.transformOrigin = "center"
        el.style.userSelect = "none"

        markersRef.current[id] = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .addTo(mapRef.current);
      }

      const marker = markersRef.current[id];
      marker.setLngLat([lng, lat]);

      marker.getElement().style.transform = `rotate(${heading}deg)`;
    });
  }, [drones]);

  return <div ref={mapContainer} style={{ width: "100vw", height: "100vh" }} />;
}
