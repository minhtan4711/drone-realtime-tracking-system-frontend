export async function fetchSnapshotAt(ts) {
    const res = await fetch(`/api/replay?ts=${ts}`)
    if (!res.ok) throw new Error("Failed to fetch snapshot")
    return res.json()
}
