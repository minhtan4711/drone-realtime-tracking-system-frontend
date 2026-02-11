import { STATUS_OPTIONS } from "../constants/drone"
import { closeWS } from "../services/wsClient"

export function normalizeStatusFilter(next) {
    if (!Array.isArray(next)) return []
    const normalized = next
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => STATUS_OPTIONS.includes(s))
    return Array.from(new Set(normalized))
}

export function stopReplayLoop(replayTimerRef) {
    if (!replayTimerRef) return

    if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current)
        replayTimerRef.current = null
    }
}

export function stopWS(wsRef) {
    if (!wsRef) return

    if (wsRef.current) {
        closeWS()
        wsRef.current = null
    }
}

export function applySnapshot(setRenderDrones, snapshot) {
    setRenderDrones(snapshot)
}
