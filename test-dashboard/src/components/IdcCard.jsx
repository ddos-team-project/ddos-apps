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

export default function IdcCard() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [latency, setLatency] = useState(null)

  const runTest = async () => {
    setLoading(true)
    const start = performance.now()

    try {
      const response = await fetch(`${API_URL}/idc-health`)
      const data = await response.json()
      setLatency(Math.round(performance.now() - start))
      setResult(data)
    } catch (error) {
      setLatency(Math.round(performance.now() - start))
      setResult({ error: error.message, status: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const sourceRegion = result?.sourceLocation ? getRegionDisplay(result.sourceLocation.region) : null
  const isOk = result?.status === 'ok'
  const idcOk = result?.idc?.status === 'ok'

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">IDC Connection Test (Hybrid)</h3>
        <span className="card-badge badge-idc">VPN</span>
      </div>

      <div className="endpoint-info route">
        <span>Dashboard</span>
        <span className="route-arrow">→</span>
        <span>AWS EC2</span>
        <span className="route-arrow">→</span>
        <span>VPN Tunnel</span>
        <span className="route-arrow">→</span>
        <span>IDC (192.168.0.10)</span>
      </div>

      <div className="buttons-row">
        <TestButton
          onClick={runTest}
          loading={loading}
          variant="idc"
        >
          IDC Health Test
        </TestButton>
      </div>

      {result && (
        <div className="status-row">
          <div className="status-item">
            <span className="status-label">AWS Source:</span>
            {sourceRegion && (
              <span className="status-value ok">
                <span className="region-flag">{sourceRegion.flag}</span>
                {sourceRegion.name}
                {result.sourceLocation?.az && ` (${result.sourceLocation.az})`}
              </span>
            )}
          </div>
          <div className="status-item">
            <span className="status-label">IDC Target:</span>
            <span className={`status-value ${isOk ? 'ok' : 'error'}`}>
              {result.targetHost || '192.168.0.10'}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Total Latency:</span>
            <span className="status-value ok">{latency}ms</span>
          </div>
          <div className="status-item">
            <span className="status-label">VPN Latency:</span>
            <span className={`status-value ${isOk ? 'ok' : 'error'}`}>
              {result.latencyMs || '-'}ms
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Connection:</span>
            <span className={`status-value ${isOk ? 'ok' : 'error'}`}>
              <span className="status-icon">{isOk ? '✅' : '❌'}</span> {isOk ? 'OK' : 'Error'}
            </span>
          </div>
          {result.idc && (
            <div className="status-item">
              <span className="status-label">IDC Status:</span>
              <span className={`status-value ${idcOk ? 'ok' : 'error'}`}>
                <span className="status-icon">{idcOk ? '✅' : '❌'}</span> {idcOk ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>
          )}
          {result.error && (
            <div className="status-item">
              <span className="status-label">Error:</span>
              <span className="status-value error">{result.error}</span>
            </div>
          )}
        </div>
      )}

      <ResponseViewer data={result} />
    </div>
  )
}
