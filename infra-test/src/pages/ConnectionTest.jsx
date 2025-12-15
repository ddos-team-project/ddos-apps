import React, { useRef } from 'react'
import ArchitectureDiagram from '../components/ArchitectureDiagram'
import RoutingTest from '../components/RoutingTest'
import RegionCard from '../components/RegionCard'
import IdcCard from '../components/IdcCard'
import TestLogger from '../components/TestLogger'

export default function ConnectionTest() {
  const diagramRef = useRef(null)

  const handleFlowTrigger = (region) => {
    if (diagramRef.current) {
      diagramRef.current.triggerFlow(region)
    }
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>연결 테스트</h1>
        <p className="subtitle">
          AWS 멀티 리전(서울/도쿄) + IDC VPN 연결 테스트
        </p>
      </header>

      <section className="section">
        <div className="flow-routing-row">
          <ArchitectureDiagram ref={diagramRef} />
          <RoutingTest onFlowTrigger={handleFlowTrigger} />
        </div>
      </section>

      <section className="section">
        <TestLogger />
      </section>

      <section className="section">
        <h2 className="section-title">개별 테스트</h2>
        <div className="cards-container">
          <RegionCard />
          <IdcCard />
        </div>
      </section>
    </div>
  )
}
