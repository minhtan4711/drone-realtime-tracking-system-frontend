export default function Header() {
  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>Drone Simulation System</h1>
        </div>
      </div>
    </header>
  )
}

const styles = {
  header: {
    width: "100%",
    background: "linear-gradient(90deg, #2b5de5 0%, #1f49c9 100%)",
    color: "white",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
  },
  inner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "14px 20px 16px",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 0.2,
  }
}
