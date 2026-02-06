import { createContext, useContext, useEffect, useState } from 'react'
import { connectWS, closeWS } from '../services/wsClient'

const DroneContext = createContext()

export function DroneProvider({ children }) {
    const [drones, setDrones] = useState([])

    useEffect(() => {
        const socket = connectWS((msg) => {
        if (msg.type === "snapshot" && Array.isArray(msg.data)) {
            setDrones(msg.data)
        }
        });

        return () => closeWS();
    }, [])

    return (
        <DroneContext.Provider value ={{ drones }}>
            {children}
        </DroneContext.Provider>
    )
}

export function useDrones() {
    return useContext(DroneContext)
}
