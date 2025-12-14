import React from 'react'
import RegionCard from './components/RegionCard'
import IdcCard from './components/IdcCard'

export default function App() {
  return (
    <div className="dashboard">
      <header className="header">
        <h1>DDoS Hybrid Infrastructure Test Dashboard</h1>
        <p className="subtitle">
          AWS Multi-Region (Seoul/Tokyo) + IDC VPN Connection Test
        </p>
      </header>

      <div className="cards-container">
        <RegionCard />
        <IdcCard />
      </div>
    </div>
  )
}
