export async function fetchTrailWindow(ts, windowMs = 5 * 60 * 1000) {
    const res = await fetch(
        `/api/trails/window?ts=${ts}&windowMs=${windowMs}`
    )

    if (!res.ok) {
        throw new Error("Failed to fetch trail window")
    }

    return res.json()
}

export async function fetchTrailByDrone(droneId, windowMs = 5 * 60 * 1000) {
    const res = await fetch(`/api/trails/${droneId}?windowMs=${windowMs}`)
    if (!res.ok) throw new Error("Failed to fet trail")
    return res.json()
}
