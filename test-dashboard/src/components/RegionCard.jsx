import React, { useState } from 'react'
import TestButton from './TestButton'
import ResponseViewer from './ResponseViewer'

const API_URL = 'https://tier1.ddos.io.kr'

function getRegionDisplay(region) {
  if (!region) return { flag: '🌐', name: 'Unknown' }
  if (region.includes('northeast-2') || region.toLowerCase().includes('seoul')) {
    return { flag: '🇰🇷', name: 'SEOUL' }
  }
  if (region.includes('northeast-1') || region.toLowerCase().includes('tokyo')) {
    return { flag: '🇯🇵', name: 'TOKYO' }
  }
  return { flag: '🌐', name: region.toUpperCase() }
}

export default function RegionCard() {
  const [loading, setLoading] = useState({ ping: false, health: false })
  const [result, setResult] = useState(null)
  const [latency, setLatency] = useState(null)

  const runTest = async (endpoint) => {
    setLoading(prev => ({ ...prev, [endpoint]: true }))
    const start = performance.now()

    try {
      const response = await fetch(`${API_URL}/${endpoint}`)
      const data = await response.json()
      setLatency(Math.round(performance.now() - start))
      setResult(data)
    } catch (error) {
      setLatency(Math.round(performance.now() - start))
      setResult({ error: error.message, status: 'error' })
    } finally {
      setLoading(prev => ({ ...prev, [endpoint]: false }))
    }
  }

  const regionDisplay = result?.location ? getRegionDisplay(result.location.region) : null
  const isOk = result?.status === 'ok'
  const dbOk = result?.db?.status === 'ok'

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">AWS Cloud Test</h3>
        <span className="card-badge badge-aws">AWS</span>
      </div>

      <div className="endpoint-info">
        Endpoint: {API_URL}
      </div>

      <div className="buttons-row">
        <TestButton
          onClick={() => runTest('ping')}
          loading={loading.ping}
          variant="primary"
        >
          Ping Test
        </TestButton>
        <TestButton
          onClick={() => runTest('health')}
          loading={loading.health}
          variant="secondary"
        >
          Health Test
        </TestButton>
      </div>

      {result && (
        <div className="status-row">
          <div className="status-item">
            <span className="status-label">Routing:</span>
            {regionDisplay && (
              <span className="status-value ok">
                <span className="region-flag">{regionDisplay.flag}</span>
                {regionDisplay.name}
                {result.location?.az && ` (${result.location.az})`}
              </span>
            )}
          </div>
          <div className="status-item">
            <span className="status-label">Latency:</span>
            <span className="status-value ok">{latency}ms</span>
          </div>
          <div className="status-item">
            <span className="status-label">Status:</span>
            <span className={`status-value ${isOk ? 'ok' : 'error'}`}>
              <span className="status-icon">{isOk ? '✅' : '❌'}</span> {result.status?.toUpperCase()}
            </span>
          </div>
          {result.db && (
            <div className="status-item">
              <span className="status-label">DB:</span>
              <span className={`status-value ${dbOk ? 'ok' : 'error'}`}>
                <span className="status-icon">{dbOk ? '✅' : '❌'}</span> {dbOk ? 'Connected' : 'Error'}
              </span>
            </div>
          )}
        </div>
      )}

      <ResponseViewer data={result} />
    </div>
  )
}
