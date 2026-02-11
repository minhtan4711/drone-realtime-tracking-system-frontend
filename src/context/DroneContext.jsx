/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState } from "react"
import { DroneContext } from "./DroneContextBase"
import { connectWS, sendFilter } from "../services/wsClient"
import { fetchSnapshotAt } from "../services/replayApi"
import {
  REPLAY_TICK_MS,
  MIN_WINDOW_MS
} from "../constants/drone"
import {
  normalizeStatusFilter,
  stopReplayLoop,
  stopWS,
  applySnapshot,
} from "../helpers/drone"



export function DroneProvider({ children }) {
  // state
  const [liveDrones, setLiveDrones] = useState([]) // for live mode
  const [renderDrones, setRenderDrones] = useState([]) // for replay mode

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
  function setStatusFilter(next) {
    setStatusFilterRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next
      return normalizeStatusFilter(value)
    })
  }

  // live mode
  function startLiveMode() {
    stopReplayLoop(replayTimerRef)
    if (liveDrones.length > 0) {
      setRenderDrones(liveDrones)
      if (maxTs) setCurrentTs(maxTs)
    }
  }

  // pause mode
  async function startPauseMode(ts) {
    stopReplayLoop(replayTimerRef)
    if (!ts) return

    try {
      const snapshot = await fetchSnapshotAt(ts, statusFilter)
      if (snapshot?.drones) {
        const snapTs = snapshot.ts ? Number(snapshot.ts) : ts
        applySnapshot(setRenderDrones, snapshot.drones.map((d) => ({ ...d, ts: snapTs })))
      }
    } catch (err) {
      console.error("Pause replay failed:", err)
    }
  }

  // play mode
  function startPlayMode(startTs) {
    stopReplayLoop(replayTimerRef)
    if (!startTs || !maxTs) return

    replayTimerRef.current = setInterval(() => {
      setCurrentTs((prev) => {
        if (!prev) return prev

        const next = prev + REPLAY_TICK_MS * speed

        if (next >= maxTs) {
          stopReplayLoop(replayTimerRef)
          setMode("live")
        }

        fetchSnapshotAt(next, statusFilterRef.current)
          .then((res) => {
            if (res?.drones) {
              const snapTs = res.ts ? Number(res.ts) : next
              applySnapshot(setRenderDrones, res.drones.map((d) => ({ ...d, ts: snapTs })))
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

    return () => stopReplayLoop(replayTimerRef)
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

    return () => stopWS(wsRef)
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
