import { createContext, useContext, useEffect, useRef, useState } from "react"
import { connectWS, closeWS } from "../services/wsClient"
import { fetchSnapshotAt } from "../services/replayApi"
import { fetchTrailWindow } from "../services/trailApi"

const DroneContext = createContext()

export function DroneProvider({ children }) {
  const [liveDrones, setLiveDrones] = useState([])
  const [renderDrones, setRenderDrones] = useState([])
  const [trails, setTrails] = useState({})

  const [mode, setMode] = useState("live") // live | play | pause
  const [currentTs, setCurrentTs] = useState(null)
  const [minTs, setMinTs] = useState(null)
  const [maxTs, setMaxTs] = useState(null)
  const [speed, setSpeed] = useState(1)

  const wsRef = useRef(null)
  const replayTimerRef = useRef(null)


  function applySnapshot(snapshot) {
    setRenderDrones(snapshot)
  }

  function stopReplayLoop() {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current)
      replayTimerRef.current = null
    }
  }

  function stopWS() {
    if (wsRef.current) {
      closeWS()
      wsRef.current = null
    }
  }

  function appendTrailsFromSnapshot(snapshot) {
    const now = Date.now()
    const WINDOW_MS = 1 * 60 * 1000

    setTrails((prev) => {
      const next = { ...prev }

      snapshot.forEach((d) => {
        const arr = next[d.id] || []
        const updated = [...arr, { lat: d.lat, lng: d.lng, ts: d.ts }]
          .filter((p) => p.ts >= now - WINDOW_MS)

        next[d.id] = updated
      })

      return next
    })
  }
  
  function setTrailsFromWindow(windowRes) {
    const next = {}
    for (const [id, arr] of Object.entries(windowRes.positionsByDrone || {})) {
      next[id] = arr
    }
    setTrails(next)
  }


  function startLiveMode() {
    stopReplayLoop()
    stopWS()
    let trailLoadedRef = false

    wsRef.current = connectWS(async (msg) => {
      if (msg.type === "snapshot" && Array.isArray(msg.data)) {
        const incoming = msg.data
        const ts = incoming[0]?.ts || Date.now()

        setLiveDrones(incoming)
        setRenderDrones(incoming)

        setMinTs((prev) => (prev ? Math.min(prev, ts) : ts))
        setMaxTs(ts)
        setCurrentTs(ts)

        if (!trailLoadedRef) {
          trailLoadedRef = true
          try {
            const windowRes = await fetchTrailWindow(ts)
            if (windowRes?.positionsByDrone) {
              setTrailsFromWindow(windowRes)
            }
          } catch (e) {
            console.error("Fetch trail window failed", e)
          }
        }

        appendTrailsFromSnapshot(incoming)
      }
    })
  }


  async function startPauseMode(ts) {
    stopReplayLoop()
    stopWS()
    if (!ts) return

    try {
      const snapshot = await fetchSnapshotAt(ts)
      if (!snapshot?.drones) return

      applySnapshot(snapshot.drones)

      const trailRes = await fetchTrailWindow(ts)
      if (trailRes?.positionsByDrone) {
        setTrailsFromWindow(trailRes)
      }
    } catch (err) {
      console.error("Pause replay failed:", err)
    }
  }


  function startPlayMode(startTs) {
    stopWS()
    stopReplayLoop()
    if (!startTs || !maxTs) return

    replayTimerRef.current = setInterval(() => {
      setCurrentTs((prev) => {
        if (!prev) return prev

        const next = prev + 1000 * speed

        if (next >= maxTs) {
          stopReplayLoop()
          setMode("pause")
          return maxTs
        }

        fetchSnapshotAt(next)
          .then((res) => {
            if (res?.drones) {
              applySnapshot(res.drones)
              appendTrailsFromSnapshot(res.drones)
            }
          })
          .catch(console.error)

        return next
      })
    }, 1000)
  }

  useEffect(() => {
    if (mode === "live") startLiveMode()
    if (mode === "pause") currentTs && startPauseMode(currentTs)
    if (mode === "play") currentTs && startPlayMode(currentTs)

    return () => stopReplayLoop()
  }, [mode])

  
  useEffect(() => {
    if (mode === "pause" && currentTs) {
      startPauseMode(currentTs)
    }
  }, [currentTs])

  return (
    <DroneContext.Provider
      value={{
        // render
        drones: renderDrones,
        trails,

        // live
        liveDrones,

        // time & mode
        mode,
        setMode,
        currentTs,
        setCurrentTs,
        minTs,
        maxTs,
        speed,
        setSpeed,
      }}
    >
      {children}
    </DroneContext.Provider>
  )
}

export function useDrones() {
  return useContext(DroneContext)
}
