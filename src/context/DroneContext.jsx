/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { connectWS, closeWS, sendFilter } from "../services/wsClient"
import { fetchSnapshotAt } from "../services/replayApi"

const DroneContext = createContext()

export function DroneProvider({ children }) {
  const STATUS_OPTIONS = ["ACTIVE", "PENDING", "OFFLINE"]
  const REPLAY_TICK_MS = 1000
  const MIN_WINDOW_MS = 5 * 60 * 1000

  // state
  const [liveDrones, setLiveDrones] = useState([])
  const [renderDrones, setRenderDrones] = useState([])

  const [selectedDroneId, setSelectedDroneId] = useState(null)

  const [mode, setMode] = useState("live") // live | play | pause
  const [currentTs, setCurrentTs] = useState(null)
  const [minTs, setMinTs] = useState(null)
  const [maxTs, setMaxTs] = useState(null)
  const [speed, setSpeed] = useState(1)

  const [statusFilter, setStatusFilterRaw] = useState([])

  // refs
  const wsRef = useRef(null)
  const modeRef = useRef(mode)
  const statusFilterRef = useRef(statusFilter)
  const replayTimerRef = useRef(null)

  // helpers
  function normalizeStatusFilter(next) {
    if (!Array.isArray(next)) return []
    const normalized = next
      .map((s) => String(s).trim().toUpperCase())
      .filter((s) => STATUS_OPTIONS.includes(s))
    return Array.from(new Set(normalized))
  }

  function setStatusFilter(next) {
    setStatusFilterRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next
      return normalizeStatusFilter(value)
    })
  }

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

  // live mode
  function startLiveMode() {
    stopReplayLoop()
    if (liveDrones.length > 0) {
      setRenderDrones(liveDrones)
      if (maxTs) setCurrentTs(maxTs)
    }
  }

  // pause mode
  async function startPauseMode(ts) {
    stopReplayLoop()
    if (!ts) return

    try {
      const snapshot = await fetchSnapshotAt(ts, statusFilter)
      if (snapshot?.drones) {
        const snapTs = snapshot.ts ? Number(snapshot.ts) : ts
        applySnapshot(snapshot.drones.map((d) => ({ ...d, ts: snapTs })))
      }
    } catch (err) {
      console.error("Pause replay failed:", err)
    }
  }

  // play mode
  function startPlayMode(startTs) {
    stopReplayLoop()
    if (!startTs || !maxTs) return

    replayTimerRef.current = setInterval(() => {
      setCurrentTs((prev) => {
        if (!prev) return prev

        const next = prev + REPLAY_TICK_MS * speed

        if (next >= maxTs) {
          stopReplayLoop()
          setMode("live")
        }

        fetchSnapshotAt(next, statusFilterRef.current)
          .then((res) => {
            if (res?.drones) {
              const snapTs = res.ts ? Number(res.ts) : next
              applySnapshot(res.drones.map((d) => ({ ...d, ts: snapTs })))
            }
          })
          .catch(console.error)

        return next
      })
    }, REPLAY_TICK_MS)
  }

  // mode switch
  useEffect(() => {
    modeRef.current = mode
    if (mode === "live") startLiveMode()
    if (mode === "play") currentTs && startPlayMode(currentTs)

    return () => stopReplayLoop()
  }, [mode])

  // filter
  useEffect(() => {
    const status = statusFilter.join(",")
    statusFilterRef.current = statusFilter
    sendFilter(status)
  }, [statusFilter])

  // filer on pause
  useEffect(() => {
    if (mode !== "pause") return
    if (!currentTs) return
    startPauseMode(currentTs)
  }, [statusFilter, mode, currentTs])

  useEffect(() => {
    if (mode !== "pause") return
    if (!currentTs) return
    startPauseMode(currentTs)
  }, [mode, currentTs])

  // connect ws
  useEffect(() => {
    if (wsRef.current) return
    wsRef.current = connectWS((msg) => {
      if (msg.type === "snapshot" && Array.isArray(msg.data)) {
        const ts = msg.ts ? Number(msg.ts) : Date.now()
        const incoming = msg.data.map((d) => ({ ...d, ts }))

        setLiveDrones(incoming)
        setMinTs(ts - MIN_WINDOW_MS)
        setMaxTs(ts)

        if (modeRef.current === "live") {
          setRenderDrones(incoming)
          setCurrentTs(ts)
        }
      }
    })

    return () => stopWS()
  }, [])

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

        statusFilter,
        setStatusFilter,
      }}
    >
      {children}
    </DroneContext.Provider>
  )
}

export function useDrones() {
  return useContext(DroneContext)
}
