import React, { useState } from 'react'
import TestButton from './TestButton'
import ResponseViewer from './ResponseViewer'
import { saveLog } from './TestLogger'
import { getApiUrl } from './api'


function getRegionDisplay(region) {
  if (!region) return { flag: '🌐', name: '알 수 없음' }

  if (region.includes('northeast-2') || region.toLowerCase().includes('seoul')) {
    return { flag: '🇰🇷', name: '서울' }
  }

  if (region.includes('northeast-1') || region.toLowerCase().includes('tokyo')) {
    return { flag: '🇯🇵', name: '도쿄' }
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
      const response = await fetch(`${getApiUrl()}/idc-health`)
      const data = await response.json()

      console.log('[IDC-HEALTH] Response:', data)

      const elapsed = Math.round(performance.now() - start)

      setLatency(elapsed)
      setResult(data)

      saveLog({
        type: 'IDC-HEALTH',
        status: data.status || 'ok',
        region: data.sourceLocation?.region || '-',
        az: data.sourceLocation?.az || '-',
        latency: elapsed,
        details: data.idc ? `IDC: ${data.idc.status}, VPN: ${data.latencyMs}ms` : null,
      })
    } catch (error) {
      console.error('[IDC-HEALTH] Error:', error)

      const elapsed = Math.round(performance.now() - start)

      setLatency(elapsed)
      setResult({ error: error.message, status: 'error' })

      saveLog({
        type: 'IDC-HEALTH',
        status: 'error',
        region: '-',
        az: '-',
        latency: elapsed,
        details: error.message,
      })
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
        <h3 className="card-title">IDC 연결 테스트 (하이브리드)</h3>
        <span className="card-badge badge-idc">VPN</span>
      </div>

      <div className="endpoint-info route">
        <span>대시보드</span>
        <span className="route-arrow">→</span>
        <span>AWS EC2</span>
        <span className="route-arrow">→</span>
        <span>VPN 터널</span>
        <span className="route-arrow">→</span>
        <span>IDC (192.168.0.10)</span>
      </div>

      <div className="buttons-row">
        <TestButton
          onClick={runTest}
          loading={loading}
          variant="idc"
        >
          IDC 상태 테스트
        </TestButton>
      </div>

      {result && (
        <div className="status-row">
          <div className="status-item">
            <span className="status-label">AWS 소스:</span>
            {sourceRegion && (
              <span className="status-value ok">
                <span className="region-flag">{sourceRegion.flag}</span>
                {sourceRegion.name}
                {result.sourceLocation?.az && ` (${result.sourceLocation.az})`}
              </span>
            )}
          </div>
          <div className="status-item">
            <span className="status-label">IDC 대상:</span>
            <span className={`status-value ${isOk ? 'ok' : 'error'}`}>
              {result.targetHost || '192.168.0.10'}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">총 지연시간:</span>
            <span className="status-value ok">{latency}ms</span>
          </div>
          <div className="status-item">
            <span className="status-label">VPN 지연시간:</span>
            <span className={`status-value ${isOk ? 'ok' : 'error'}`}>
              {result.latencyMs || '-'}ms
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">연결 상태:</span>
            <span className={`status-value ${isOk ? 'ok' : 'error'}`}>
              <span className="status-icon">{isOk ? '✅' : '❌'}</span> {isOk ? '정상' : '오류'}
            </span>
          </div>
          {result.idc && (
            <div className="status-item">
              <span className="status-label">IDC 상태:</span>
              <span className={`status-value ${idcOk ? 'ok' : 'error'}`}>
                <span className="status-icon">{idcOk ? '✅' : '❌'}</span> {idcOk ? '정상' : '비정상'}
              </span>
            </div>
          )}
          {result.error && (
            <div className="status-item">
              <span className="status-label">오류:</span>
              <span className="status-value error">{result.error}</span>
            </div>
          )}
        </div>
      )}

      <ResponseViewer data={result} />
    </div>
  )
}
