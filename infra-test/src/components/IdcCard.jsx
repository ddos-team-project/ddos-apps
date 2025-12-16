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
  const [testTime, setTestTime] = useState(null)

  const formatTimestamp = (date) => {
    if (!date) return '-'
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  const runTest = async () => {
    setLoading(true)
    setTestTime(new Date())

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

      {result && (
        <div className="vpn-evidence-card">
          <h4>VPN 연결 증적 자료</h4>
          <p className="evidence-subtitle">IPsec VPN 연결 테스트 결과 (캡처용)</p>

          <div className="evidence-section">
            <h5>연결 정보</h5>
            <table className="evidence-table">
              <tbody>
                <tr>
                  <th>테스트 시간</th>
                  <td className="timestamp">{formatTimestamp(testTime)}</td>
                </tr>
                <tr>
                  <th>출발지 (AWS)</th>
                  <td>
                    {sourceRegion && (
                      <>
                        <span className="region-flag">{sourceRegion.flag}</span>
                        {sourceRegion.name}
                        {result.sourceLocation?.az && ` (${result.sourceLocation.az})`}
                        {result.sourceLocation?.instanceId && (
                          <span className="instance-id-small"> - {result.sourceLocation.instanceId}</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
                <tr>
                  <th>목적지 (IDC)</th>
                  <td>{result.targetHost || '192.168.0.10'}</td>
                </tr>
                <tr>
                  <th>연결 방식</th>
                  <td>
                    <span className="vpn-badge">IPsec VPN</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="evidence-section">
            <h5>응답 시간</h5>
            <table className="evidence-table">
              <tbody>
                <tr>
                  <th>총 응답 시간</th>
                  <td className="highlight">{latency} ms</td>
                </tr>
                <tr>
                  <th>VPN 터널 지연</th>
                  <td>{result.latencyMs || '-'} ms</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="evidence-section">
            <h5>연결 상태</h5>
            <table className="evidence-table">
              <tbody>
                <tr>
                  <th>VPN 연결</th>
                  <td>
                    <span className={`connection-status ${isOk ? 'success' : 'fail'}`}>
                      {isOk ? '✅ 성공' : '❌ 실패'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>IDC 서버 응답</th>
                  <td>
                    <span className={`connection-status ${idcOk ? 'success' : 'fail'}`}>
                      {idcOk ? '✅ 성공' : '❌ 실패'}
                    </span>
                  </td>
                </tr>
                {result.error && (
                  <tr>
                    <th>오류 메시지</th>
                    <td className="error">{result.error}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="evidence-section">
            <h5>암호화 상태</h5>
            <table className="evidence-table">
              <tbody>
                <tr>
                  <th>IPsec 터널</th>
                  <td>
                    <span className={`encryption-status ${isOk ? 'active' : 'inactive'}`}>
                      {isOk ? '🔒 활성화 (암호화됨)' : '🔓 비활성화'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>암호화 프로토콜</th>
                  <td>AES-256-GCM / SHA-256</td>
                </tr>
                <tr>
                  <th>키 교환 방식</th>
                  <td>IKEv2</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ResponseViewer data={result} />
    </div>
  )
}
