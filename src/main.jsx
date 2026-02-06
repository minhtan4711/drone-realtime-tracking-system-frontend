import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "./index.css"
import App from './App.jsx'
import { DroneProvider } from './context/DroneContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DroneProvider>
      <App />
    </DroneProvider>
  </StrictMode>,
)
