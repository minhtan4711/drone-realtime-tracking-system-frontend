let socket = null
let pendingFilter = null

export function connectWS(onMessage) {
    socket = new WebSocket("ws://localhost:3000/ws/drones")

    socket.onopen = () => {
        console.log("WebSocket connection established")
        if (pendingFilter !== null) {
            sendFilter(pendingFilter)
        }
    }

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        onMessage(data)
    }

    socket.onclose = () => {
        console.log("WebSocket connection closed")
    }

    socket.onerror = (error) => {
        console.error("WebSocket error:", error)
    }

    return socket
}

export function sendFilter(status) {
    const payload = JSON.stringify({
        type: "filter",
        status: status || "",
    })

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(payload)
        pendingFilter = null
    } else {
        pendingFilter = status || ""
    }
}

export function closeWS() {
    if (socket) {
        socket.close()
    }
}
