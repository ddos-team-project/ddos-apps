import React from 'react'
import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <h2>인프라 테스트</h2>
      </div>
      <ul className="sidebar-menu">
        <li>
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="menu-icon">🔗</span>
            <span className="menu-text">연결 테스트</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/load-test" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="menu-icon">⚡</span>
            <span className="menu-text">부하 테스트</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/stress-test" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="menu-icon">🗄️</span>
            <span className="menu-text">DB 테스트</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/failover" className={({ isActive }) => isActive ? 'active' : ''}>
            <span className="menu-icon">🔄</span>
            <span className="menu-text">DR Failover</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
