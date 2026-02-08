import MapView from "./components/MapView"
import TimelineBar from "./components/TimelineBar"
import Header from "./components/Header"

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <MapView />
        <TimelineBar />
      </div>
    </div>
  )
}
