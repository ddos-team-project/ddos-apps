import React, { useState } from 'react'
import { saveLog } from './TestLogger'

// 랜덤 서브도메인으로 DNS 캐시 우회
const getApiUrl = () => {
  const randomId = Math.random().toString(36).slice(2, 10)
  return `https://${randomId}.tier1.ddos.io.kr`
}

export default function RoutingTest({ onFlowTrigger }) {
  const [results, setResults] = useState({ seoul: 0, tokyo: 0, unknown: 0 })
  const [instanceStats, setInstanceStats] = useState({})
  const [totalRequests, setTotalRequests] = useState(0)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])

  const detectRegion = (data) => {
    const region = data.location?.region || ''

    if (region.includes('northeast-2') || region.toLowerCase() === 'seoul') {
      return 'seoul'
    }

    if (region.includes('northeast-1') || region.toLowerCase() === 'tokyo') {
      return 'tokyo'
    }

    return 'unknown'
  }

  const runMultipleRequests = async (count) => {
    setLoading(true)
    setResults({ seoul: 0, tokyo: 0, unknown: 0 })
    setInstanceStats({})
    setTotalRequests(count)
    setHistory([])

    const newResults = { seoul: 0, tokyo: 0, unknown: 0 }
    const newInstanceStats = {}
    const newHistory = []

    for (let i = 0; i < count; i++) {
      try {
        const start = performance.now()
        // 랜덤 서브도메인으로 DNS 캐시 우회
        const response = await fetch(`${getApiUrl()}/ping`)
        const data = await response.json()
        const latency = Math.round(performance.now() - start)

        const region = detectRegion(data)

        newResults[region]++

        const instanceId = data.location?.instanceId || 'unknown'
        const instanceKey = `${region}-${instanceId}`
        newInstanceStats[instanceKey] = (newInstanceStats[instanceKey] || 0) + 1

        newHistory.push({
          index: i + 1,
          region,
          az: data.location?.az || '-',
          instanceId: instanceId,
          privateIp: data.location?.privateIp || '-',
          latency,
          timestamp: new Date().toLocaleTimeString(),
        })

        setResults({ ...newResults })
        setInstanceStats({ ...newInstanceStats })
        setHistory([...newHistory])

        // Flow 다이어그램 트리거
        if (onFlowTrigger) {
          onFlowTrigger(region)
        }

        saveLog({
          type: 'ROUTING',
          status: 'ok',
          region: data.location?.region || region,
          az: data.location?.az || '-',
          instanceId: data.location?.instanceId || '-',
          latency,
          details: `${i + 1}/${count}`,
        })

        console.log(`[ROUTING ${i + 1}/${count}] Region: ${region}, AZ: ${data.location?.az}`)
      } catch (error) {
        console.error(`[ROUTING ${i + 1}/${count}] Error:`, error)

        newResults.unknown++
        newHistory.push({
          index: i + 1,
          region: 'error',
          az: '-',
          latency: 0,
          timestamp: new Date().toLocaleTimeString(),
        })

        setResults({ ...newResults })
        setHistory([...newHistory])

        // Flow 다이어그램 트리거
        if (onFlowTrigger) {
          onFlowTrigger(region)
        }

        saveLog({
          type: 'ROUTING',
          status: 'error',
          region: '-',
          az: '-',
          instanceId: '-',
          latency: 0,
          details: error.message,
        })
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    setLoading(false)
  }

  const getPercentage = (count) => {
    if (totalRequests === 0) return 0

    return Math.round((count / totalRequests) * 100)
  }

  const getBarWidth = (count) => {
    const total = results.seoul + results.tokyo + results.unknown

    if (total === 0) return 0

    return (count / total) * 100
  }

  return (
    <div className="routing-test">
      <div className="routing-header">
        <h3>Routing Distribution Test</h3>
        <p className="routing-description">
          Route53 가중치 라우팅 (Seoul 80% / Tokyo 20%) 검증
        </p>
      </div>

      <div className="routing-controls">
        <button onClick={() => runMultipleRequests(10)} disabled={loading}>
          {loading ? 'Testing...' : '10회 테스트'}
        </button>
        <button onClick={() => runMultipleRequests(20)} disabled={loading}>
          20회 테스트
        </button>
        <button onClick={() => runMultipleRequests(50)} disabled={loading}>
          50회 테스트
        </button>
      </div>

      {totalRequests > 0 && (
        <div className="routing-results">
          <div className="routing-bar-container">
            <div className="routing-bar-item">
              <div className="bar-label">
                <span>🇰🇷 Seoul</span>
                <span>{results.seoul}회 ({getPercentage(results.seoul)}%)</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill seoul"
                  style={{ width: `${getBarWidth(results.seoul)}%` }}
                />
              </div>
              <div className="bar-expected">예상: 80%</div>
            </div>

            <div className="routing-bar-item">
              <div className="bar-label">
                <span>🇯🇵 Tokyo</span>
                <span>{results.tokyo}회 ({getPercentage(results.tokyo)}%)</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill tokyo"
                  style={{ width: `${getBarWidth(results.tokyo)}%` }}
                />
              </div>
              <div className="bar-expected">예상: 20%</div>
            </div>

            {results.unknown > 0 && (
              <div className="routing-bar-item">
                <div className="bar-label">
                  <span>❓ Unknown</span>
                  <span>{results.unknown}회 ({getPercentage(results.unknown)}%)</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill unknown"
                    style={{ width: `${getBarWidth(results.unknown)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="routing-summary">
            <span>총 {results.seoul + results.tokyo + results.unknown} / {totalRequests} 완료</span>
            {loading && <span className="loading-indicator">⏳ 진행 중...</span>}
          </div>

          {Object.keys(instanceStats).length > 0 && (
            <div className="instance-distribution">
              <h4>인스턴스 분산</h4>
              <div className="instance-list">
                {Object.entries(instanceStats)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => {
                    const [region, instanceId] = key.split('-')
                    const total = results.seoul + results.tokyo + results.unknown
                    const percent = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                      <div key={key} className={`instance-item ${region}`}>
                        <span className="instance-region">{region === 'seoul' ? '🇰🇷' : '🇯🇵'}</span>
                        <span className="instance-id">{instanceId?.slice(-8)}</span>
                        <span className="instance-count">{count}회 ({percent}%)</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="routing-history">
          <h4>요청 히스토리</h4>
          <div className="history-table">
            <div className="history-header">
              <span>#</span>
              <span>Region</span>
              <span>AZ</span>
              <span>Instance</span>
              <span>Latency</span>
              <span>Time</span>
            </div>
            <div className="history-body">
              {history.slice(-10).reverse().map((item) => (
                <div key={item.index} className={`history-row ${item.region}`}>
                  <span>{item.index}</span>
                  <span>{item.region === 'seoul' ? '🇰🇷 Seoul' : item.region === 'tokyo' ? '🇯🇵 Tokyo' : '❓'}</span>
                  <span>{item.az}</span>
                  <span className="instance-info" title={item.privateIp}>{item.instanceId?.slice(-8) || '-'}</span>
                  <span>{item.latency}ms</span>
                  <span>{item.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
