let socket = null

export function connectWS(onMessage) {
    socket = new WebSocket("ws://localhost:3000/ws/drones")

    socket.onopen = () => {
        console.log("WebSocket connection established")
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

export function closeWS() {
    if (socket) {
        socket.close()
    }
}
