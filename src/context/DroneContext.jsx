import { createContext, useContext, useEffect, useRef, useState } from "react"
import { connectWS, closeWS } from "../services/wsClient"
import { fetchSnapshotAt } from "../services/replayApi"

const DroneContext = createContext()

export function DroneProvider({ children }) {
  const [liveDrones, setLiveDrones] = useState([])
  const [renderDrones, setRenderDrones] = useState([])

  const [selectedDroneId, setSelectedDroneId] = useState(null)

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

  /* ---------------- LIVE MODE ---------------- */
  function startLiveMode() {
    stopReplayLoop()
    stopWS()

    wsRef.current = connectWS((msg) => {
      if (msg.type === "snapshot" && Array.isArray(msg.data)) {
        const incoming = msg.data
        const ts = incoming[0]?.ts || Date.now()

        setLiveDrones(incoming)
        setRenderDrones(incoming)

        setMinTs((prev) => (prev ? Math.min(prev, ts) : ts))
        setMaxTs(ts)
        setCurrentTs(ts)
      }
    })
  }

  /* ---------------- PAUSE MODE ---------------- */
  async function startPauseMode(ts) {
    stopReplayLoop()
    stopWS()
    if (!ts) return

    try {
      const snapshot = await fetchSnapshotAt(ts)
      if (snapshot?.drones) {
        applySnapshot(snapshot.drones)
      }
    } catch (err) {
      console.error("Pause replay failed:", err)
    }
  }

  /* ---------------- PLAY MODE ---------------- */
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
          setMode("live")
        }

        fetchSnapshotAt(next)
          .then((res) => {
            if (res?.drones) {
              applySnapshot(res.drones)
            }
          })
          .catch(console.error)

        return next
      })
    }, 1000)
  }

  /* ---------------- MODE SWITCH ---------------- */
  useEffect(() => {
    if (mode === "live") startLiveMode()
    if (mode === "pause") currentTs && startPauseMode(currentTs)
    if (mode === "play") currentTs && startPlayMode(currentTs)

    return () => stopReplayLoop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (mode === "pause" && currentTs) {
      startPauseMode(currentTs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTs])

  return (
    <DroneContext.Provider
      value={{
        drones: renderDrones,

        selectedDroneId,
        setSelectedDroneId,

        liveDrones,

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

// eslint-disable-next-line react-refresh/only-export-components
export function useDrones() {
  return useContext(DroneContext)
}
