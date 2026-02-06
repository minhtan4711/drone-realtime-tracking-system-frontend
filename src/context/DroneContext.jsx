import { createContext, useContext, useEffect, useState } from 'react'
import { connectWS, closeWS } from '../services/wsClient'

const DroneContext = createContext()

export function DroneProvider({ children }) {
    const [drones, setDrones] = useState([])
    const [trails, setTrails] = useState({}) // { droneId: [{lat, lng}, ...] }

    useEffect(() => {
        const socket = connectWS((msg) => {
            if (msg.type === "snapshot" && Array.isArray(msg.data)) {
                let incoming = msg.data
                setDrones(incoming)
                setTrails((prev) => {
                    const next = { ...prev }

                    incoming.forEach((d) => {
                        if (!next[d.id]) next[d.id] = []
                        next[d.id] = [...next[d.id], { lat: d.lat, lng: d.lng}].slice(-50)
                    });

                    return next
                })
            }
        })

        return () => closeWS()
    }, [])

    return (
        <DroneContext.Provider value ={{ drones, trails }}>
            {children}
        </DroneContext.Provider>
    )
}

export function useDrones() {
    return useContext(DroneContext)
}
