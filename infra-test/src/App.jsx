import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ConnectionTest from './pages/ConnectionTest'
import LoadTest from './pages/LoadTest'
import StressTest from './pages/StressTest'
import Failover from './pages/Failover'

export default function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<ConnectionTest />} />
          <Route path="/load-test" element={<LoadTest />} />
          <Route path="/stress-test" element={<StressTest />} />
          <Route path="/failover" element={<Failover />} />
        </Routes>
      </main>
    </div>
  )
}
