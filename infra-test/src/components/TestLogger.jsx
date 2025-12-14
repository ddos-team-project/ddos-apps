import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'infra-test-logs'
const MAX_LOGS = 100

export function saveLog(logEntry) {
  try {
    const logs = getLogs()

    logs.unshift({
      ...logEntry,
      id: Date.now(),
      timestamp: new Date().toISOString(),
    })

    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
  } catch (e) {
    console.error('Failed to save log:', e)
  }
}

export function getLogs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)

    return stored ? JSON.parse(stored) : []
  } catch (e) {
    return []
  }
}

export function clearLogs() {
  localStorage.removeItem(STORAGE_KEY)
}

export default function TestLogger() {
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('all')
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    setLogs(getLogs())

    const interval = setInterval(() => {
      setLogs(getLogs())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleClear = () => {
    clearLogs()
    setLogs([])
  }

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true
    if (filter === 'success') return log.status === 'ok'
    if (filter === 'error') return log.status === 'error'
    if (filter === 'seoul') return log.region?.includes('seoul') || log.region?.includes('northeast-2')
    if (filter === 'tokyo') return log.region?.includes('tokyo') || log.region?.includes('northeast-1')

    return true
  })

  const getStatusIcon = (status) => {
    if (status === 'ok') return '✅'
    if (status === 'error') return '❌'

    return '⏳'
  }

  const getRegionFlag = (region) => {
    if (!region) return '🌐'
    if (region.includes('seoul') || region.includes('northeast-2')) return '🇰🇷'
    if (region.includes('tokyo') || region.includes('northeast-1')) return '🇯🇵'

    return '🌐'
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)

    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="test-logger">
      <div className="logger-header" onClick={() => setIsOpen(!isOpen)}>
        <h3>
          Test Logs
          <span className="log-count">({logs.length})</span>
        </h3>
        <span className={`toggle-icon ${isOpen ? 'open' : ''}`}>▼</span>
      </div>

      {isOpen && (
        <div className="logger-content">
          <div className="logger-controls">
            <div className="filter-buttons">
              <button
                className={filter === 'all' ? 'active' : ''}
                onClick={() => setFilter('all')}
              >
                전체
              </button>
              <button
                className={filter === 'success' ? 'active' : ''}
                onClick={() => setFilter('success')}
              >
                ✅ 성공
              </button>
              <button
                className={filter === 'error' ? 'active' : ''}
                onClick={() => setFilter('error')}
              >
                ❌ 실패
              </button>
              <button
                className={filter === 'seoul' ? 'active' : ''}
                onClick={() => setFilter('seoul')}
              >
                🇰🇷 Seoul
              </button>
              <button
                className={filter === 'tokyo' ? 'active' : ''}
                onClick={() => setFilter('tokyo')}
              >
                🇯🇵 Tokyo
              </button>
            </div>
            <button className="clear-btn" onClick={handleClear}>
              로그 삭제
            </button>
          </div>

          <div className="log-table">
            <div className="log-header">
              <span>Time</span>
              <span>Type</span>
              <span>Region</span>
              <span>Instance</span>
              <span>Status</span>
              <span>Latency</span>
              <span>Details</span>
            </div>
            <div className="log-body">
              {filteredLogs.length === 0 ? (
                <div className="log-empty">테스트 기록이 없습니다</div>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className={`log-row ${log.status}`}>
                    <span>{formatTime(log.timestamp)}</span>
                    <span className="log-type">{log.type}</span>
                    <span>{getRegionFlag(log.region)} {log.az || '-'}</span>
                    <span className="instance-info">{log.instanceId?.slice(-8) || '-'}</span>
                    <span>{getStatusIcon(log.status)}</span>
                    <span>{log.latency}ms</span>
                    <span className="log-details">{log.details || '-'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
