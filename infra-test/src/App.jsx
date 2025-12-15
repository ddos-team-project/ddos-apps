import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ConnectionTest from './pages/ConnectionTest'
import LoadTest from './pages/LoadTest'

export default function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<ConnectionTest />} />
          <Route path="/load-test" element={<LoadTest />} />
        </Routes>
      </main>
    </div>
  )
}
