function buildStatusParam(statusFilter) {
    if (!statusFilter) return ""
    if (Array.isArray(statusFilter) && statusFilter.length > 0) {
        return statusFilter.join(",")
    }
    if (typeof statusFilter === "string" && statusFilter.trim().length > 0) {
        return statusFilter.trim()
    }
    return ""
}

export async function fetchSnapshotAt(ts, statusFilter) {
    const params = new URLSearchParams({ ts: String(ts) })
    const status = buildStatusParam(statusFilter)
    if (status) params.set("status", status)

    const res = await fetch(`/api/replay?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch snapshot")
    return res.json()
}
