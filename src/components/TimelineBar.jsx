import { useDrones } from "../context/DroneContext"

export default function TimelineBar() {
  const {
    drones,
    mode,
    setMode,
    currentTs,
    setCurrentTs,
    minTs,
    maxTs,
  } = useDrones()

  const isConnected = drones.length > 0
  const dotColor = isConnected ? "#2ecc71" : "#ff3b30"
  const isPlayEnabled = Boolean(currentTs && maxTs && currentTs < maxTs)
  const isLiveActive = mode === "live"

  function onScrub(ts) {
    setMode("pause")
    setCurrentTs(ts)
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <div style={styles.statusRow}>
          <span style={{ ...styles.dot, background: dotColor }} />
          <span style={styles.statusText}>{isConnected ? "Connected" : "Disconnected"}</span>
          <br />
          <div>TOTAL DRONES: {drones.length}</div>
        </div>

        <div style={styles.controlsRow}>
          <div style={styles.controlsLeft}>
            <button
              style={{ ...styles.btn, ...(isLiveActive ? styles.btnPrimary : null) }}
              onClick={() => setMode("live")}
            >
              LIVE
            </button>
            <button
              style={{ ...styles.btn, ...(isPlayEnabled ? null : styles.btnDisabled) }}
              onClick={() => setMode("play")}
              disabled={!isPlayEnabled}
            >
              ▶ Play
            </button>
          </div>

          <div />
        </div>

        <div style={styles.timelineRow}>
          <span style={styles.edgeLabel}>
            {minTs ? new Date(minTs).toLocaleTimeString() : "--:--:--"}
          </span>
          <input
            type="range"
            step={50}
            min={minTs || 0}
            max={maxTs || 100}
            value={currentTs || 0}
            onChange={(e) => onScrub(Number(e.target.value))}
            style={styles.timelineRange}
          />
          <span style={styles.timeLabel}>
            {currentTs ? new Date(currentTs).toLocaleTimeString() : "--:--:--"}
          </span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    background: "#fff",
    color: "#0b1220",
    gap: 10,
    padding: "12px 0 14px",
    zIndex: 10,
    borderTop: "1px solid #e6eaf2",
    boxShadow: "0 -8px 24px rgba(15, 23, 42, 0.08)",
  },
  inner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 10px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#334155",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  statusText: {
    fontWeight: 600,
  },
  controlsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  controlsLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  btn: {
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#1e293b",
    borderRadius: 10,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnPrimary: {
    background: "#fe0000",
    color: "#ffffff",
    borderColor: "#ce0505",
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  timelineRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  edgeLabel: {
    minWidth: 90,
    fontSize: 12,
    color: "#64748b",
    textAlign: "left",
  },
  timelineRange: {
    flex: 1,
  },
  timeLabel: {
    minWidth: 80,
    fontSize: 12,
    color: "#475569",
    textAlign: "right",
  },
}
