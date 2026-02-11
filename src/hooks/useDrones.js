import { useContext } from "react"
import { DroneContext } from "../context/DroneContextBase"

export function useDrones() {
  return useContext(DroneContext)
}
