import { useMemo } from "react"
import { useDrones } from "../context/DroneContext"

const OPTIONS = ["ACTIVE", "PENDING", "OFFLINE"]

export default function FilterPanel() {
  const { statusFilter, setStatusFilter, drones } = useDrones()

  const selected = useMemo(() => new Set(statusFilter), [statusFilter])
  const counts = useMemo(() => {
    const map = new Map()
    for (const s of OPTIONS) map.set(s, 0)
    for (const d of drones) {
      const key = String(d.status || "").toUpperCase()
      if (map.has(key)) map.set(key, map.get(key) + 1)
    }
    return map
  }, [drones])
  const total = drones.length

  function toggleStatus(status) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return Array.from(next)
    })
  }

  function clearAll() {
    setStatusFilter([])
  }

  const isAll = statusFilter.length === 0

  return (
    <div style={styles.wrapper}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Filters</span>
          <button style={styles.clearBtn} onClick={clearAll} disabled={isAll}>
            Clear
          </button>
        </div>

        <div style={styles.sectionLabel}>Status</div>
        <div style={styles.list}>
          {OPTIONS.map((s) => (
            <label key={s} style={styles.option}>
              <input
                type="checkbox"
                checked={selected.has(s)}
                onChange={() => toggleStatus(s)}
              />
              <span style={styles.optionLabel}>{s}</span>
              <span style={styles.count}>{counts.get(s) || 0}</span>
            </label>
          ))}
        </div>

        <div style={styles.totalRow}>
          <span>Total</span>
          <span style={styles.count}>{total}</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    position: "absolute",
    right: 16,
    top: 120,
    zIndex: 5,
    pointerEvents: "none",
  },
  panel: {
    width: 200,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    pointerEvents: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontWeight: 700,
    fontSize: 13,
    color: "#0f172a",
  },
  clearBtn: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#334155",
    borderRadius: 8,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: 0.5,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#0f172a",
    justifyContent: "space-between",
  },
  optionLabel: {
    flex: 1,
  },
  count: {
    minWidth: 28,
    textAlign: "right",
    fontWeight: 700,
    color: "#0f172a",
  },
  hint: {
    fontSize: 11,
    color: "#64748b",
  },
  totalRow: {
    marginTop: 2,
    paddingTop: 8,
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 12,
    fontWeight: 700,
    color: "#0f172a",
  },
}
