import React, { useRef } from 'react'
import ArchitectureDiagram from './components/ArchitectureDiagram'
import RoutingTest from './components/RoutingTest'
import RegionCard from './components/RegionCard'
import IdcCard from './components/IdcCard'
import TestLogger from './components/TestLogger'

export default function App() {
  const diagramRef = useRef(null)

  const handleFlowTrigger = (region) => {
    if (diagramRef.current) {
      diagramRef.current.triggerFlow(region)
    }
  }

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Infra Test Dashboard</h1>
        <p className="subtitle">
          AWS Multi-Region (Seoul/Tokyo) + IDC VPN Connection Test
        </p>
      </header>

      <section className="section">
        <div className="flow-routing-row">
          <ArchitectureDiagram ref={diagramRef} />
          <RoutingTest onFlowTrigger={handleFlowTrigger} />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Individual Tests</h2>
        <div className="cards-container">
          <RegionCard />
          <IdcCard />
        </div>
      </section>

      <section className="section">
        <TestLogger />
      </section>
    </div>
  )
}
