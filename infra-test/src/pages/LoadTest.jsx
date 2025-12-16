import React, { useState, useRef, useEffect } from 'react'
import { getApiUrl } from '../components/api'

export default function LoadTest() {
  const [config, setConfig] = useState({
    target: 'seoul',
    requests: 500,
    concurrency: 30,
    mode: 'light',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [testMeta, setTestMeta] = useState({ startTime: null, endTime: null })
  const [instanceCount, setInstanceCount] = useState({ before: '', after: '' })

  // 연속 테스트 관련 상태
  const [continuousMode, setContinuousMode] = useState(false)
  const [duration, setDuration] = useState(5) // 분 단위
  const [continuousStats, setContinuousStats] = useState({
    rounds: 0,
    totalRequests: 0,
    totalCompleted: 0,
    totalFailed: 0,
    elapsedSeconds: 0,
  })
  const [isRunning, setIsRunning] = useState(false)

  const abortRef = useRef(false)
  const timerRef = useRef(null)

  
  const albUrls = {
    seoul: 'https://seoul.tier1.ddos.io.kr',
    tokyo: 'https://tokyo.tier1.ddos.io.kr',
  }

  const targetOptions = [
    { value: 'seoul', label: '서울 (ap-northeast-2)' },
    { value: 'tokyo', label: '도쿄 (ap-northeast-1)' },
  ]

  const modeOptions = [
    { value: 'light', label: 'Light (/ping)', desc: '네트워크/ALB 테스트' },
    { value: 'heavy', label: 'Heavy (/stress)', desc: '오토스케일 테스트' },
  ]
  const requestOptions = [100, 500, 1000]
  const concurrencyOptions = [10, 30, 50]
  const durationOptions = [3, 5, 10, 15] // 분 단위

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

  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const calculateDuration = () => {
    if (!testMeta.startTime || !testMeta.endTime) return '-'
    const diff = (testMeta.endTime - testMeta.startTime) / 1000
    if (diff >= 60) {
      const mins = Math.floor(diff / 60)
      const secs = Math.round(diff % 60)
      return `${mins}분 ${secs}초`
    }
    return `${diff.toFixed(1)}초`
  }

  const getSuccessRate = () => {
    if (continuousMode && continuousStats.totalRequests > 0) {
      return ((continuousStats.totalCompleted / continuousStats.totalRequests) * 100).toFixed(1) + '%'
    }
    if (!result) return '-'
    const total = result.totalRequests || 0
    const failed = result.failedRequests || 0
    if (total === 0) return '-'
    return ((total - failed) / total * 100).toFixed(1) + '%'
  }

  const getInstanceChange = () => {
    const before = instanceCount.before
    const after = instanceCount.after
    if (!before || !after) return null
    const diff = parseInt(after) - parseInt(before)
    if (diff > 0) return `+${diff}`
    return diff.toString()
  }

  // 단일 테스트 실행
  const runSingleTest = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/load-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      const data = await response.json()
      return data
    } catch (err) {
      return { error: err.message, status: 'error' }
    }
  }

  // 연속 테스트 실행
  const runContinuousTest = async () => {
    setIsRunning(true)
    setLoading(true)
    setResult(null)
    setError(null)
    abortRef.current = false

    const startTime = new Date()
    setTestMeta({ startTime, endTime: null })
    setContinuousStats({
      rounds: 0,
      totalRequests: 0,
      totalCompleted: 0,
      totalFailed: 0,
      elapsedSeconds: 0,
    })

    const durationMs = duration * 60 * 1000
    let rounds = 0
    let totalRequests = 0
    let totalCompleted = 0
    let totalFailed = 0
    let lastResult = null

    // 경과 시간 타이머
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000)
      setContinuousStats(prev => ({ ...prev, elapsedSeconds: elapsed }))
    }, 1000)

    while (!abortRef.current && (Date.now() - startTime.getTime()) < durationMs) {
      const data = await runSingleTest()

      if (abortRef.current) break

      rounds++
      if (data.status === 'ok') {
        totalRequests += data.totalRequests || 0
        totalCompleted += data.completedRequests || 0
        totalFailed += data.failedRequests || 0
        lastResult = data
      } else {
        totalFailed += config.requests
        totalRequests += config.requests
      }

      setContinuousStats({
        rounds,
        totalRequests,
        totalCompleted,
        totalFailed,
        elapsedSeconds: Math.floor((Date.now() - startTime.getTime()) / 1000),
      })

      // 다음 라운드 전 짧은 대기 (서버 부하 분산)
      if (!abortRef.current && (Date.now() - startTime.getTime()) < durationMs) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    clearInterval(timerRef.current)

    const endTime = new Date()
    setTestMeta(prev => ({ ...prev, endTime }))

    // 최종 결과 설정 (누적 통계 기반)
    if (lastResult) {
      setResult({
        ...lastResult,
        totalRequests,
        completedRequests: totalCompleted,
        failedRequests: totalFailed,
        requestsPerSecond: totalRequests / ((endTime - startTime) / 1000),
        rounds,
      })
    }

    setIsRunning(false)
    setLoading(false)
  }

  // 단일 테스트 실행
  const runLoadTest = async () => {
    if (continuousMode) {
      await runContinuousTest()
      return
    }

    setLoading(true)
    setResult(null)
    setError(null)
    setTestMeta({ startTime: new Date(), endTime: null })

    const data = await runSingleTest()

    if (data.status === 'ok') {
      setResult(data)
      setTestMeta(prev => ({ ...prev, endTime: new Date() }))
    } else {
      setError(data.error || '부하 테스트 실패')
      setTestMeta(prev => ({ ...prev, endTime: new Date() }))
    }

    setLoading(false)
  }

  // 테스트 중지
  const stopTest = () => {
    abortRef.current = true
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
  }

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      abortRef.current = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>부하 테스트</h1>
        <p className="subtitle">
          Apache Bench를 사용한 ASG 오토스케일링 테스트
        </p>
      </header>

      <section className="section">
        <div className="load-test-card">
          <h3>테스트 설정</h3>

          <div className="config-group">
            <label>테스트 모드</label>
            <div className="button-group">
              {modeOptions.map(opt => (
                <button
                  key={opt.value}
                  className={config.mode === opt.value ? 'active' : ''}
                  onClick={() => setConfig(prev => ({ ...prev, mode: opt.value }))}
                  disabled={loading}
                  title={opt.desc}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="config-hint">
              {config.mode === 'light' ? '가벼운 요청으로 네트워크/ALB 성능 측정' : 'CPU 부하를 주어 오토스케일링 트리거'}
            </p>
          </div>

          <div className="config-group">
            <label>대상 리전</label>
            <div className="button-group">
              {targetOptions.map(opt => (
                <button
                  key={opt.value}
                  className={config.target === opt.value ? 'active' : ''}
                  onClick={() => setConfig(prev => ({ ...prev, target: opt.value }))}
                  disabled={loading}
                >
                  {opt.value === 'seoul' ? '🇰🇷' : '🇯🇵'} {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="config-group">
            <label>요청 수 (-n)</label>
            <div className="button-group">
              {requestOptions.map(num => (
                <button
                  key={num}
                  className={config.requests === num ? 'active' : ''}
                  onClick={() => setConfig(prev => ({ ...prev, requests: num }))}
                  disabled={loading}
                >
                  {num.toLocaleString()}회
                </button>
              ))}
            </div>
          </div>

          <div className="config-group">
            <label>동시 연결 (-c)</label>
            <div className="button-group">
              {concurrencyOptions.map(num => (
                <button
                  key={num}
                  className={config.concurrency === num ? 'active' : ''}
                  onClick={() => setConfig(prev => ({ ...prev, concurrency: num }))}
                  disabled={loading}
                >
                  {num}개
                </button>
              ))}
            </div>
          </div>

          {/* 연속 테스트 설정 */}
          <div className="config-group continuous-config">
            <label>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                disabled={loading}
              />
              연속 테스트 모드 (ASG 스케일 아웃 관찰용)
            </label>
            {continuousMode && (
              <div className="duration-select">
                <span>테스트 시간:</span>
                <div className="button-group">
                  {durationOptions.map(min => (
                    <button
                      key={min}
                      className={duration === min ? 'active' : ''}
                      onClick={() => setDuration(min)}
                      disabled={loading}
                    >
                      {min}분
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="config-summary">
            <code>
              ab -n {config.requests} -c {config.concurrency} {albUrls[config.target]}{config.mode === 'heavy' ? '/stress?seconds=5' : '/ping'}
              {continuousMode && ` (연속 ${duration}분)`}
            </code>
          </div>

          <div className="test-buttons">
            {!isRunning ? (
              <button
                className={`run-test-btn ${continuousMode ? 'continuous' : ''}`}
                onClick={runLoadTest}
                disabled={loading}
              >
                {loading ? '테스트 실행 중...' : continuousMode ? `🔄 연속 테스트 시작 (${duration}분)` : '부하 테스트 실행'}
              </button>
            ) : (
              <button
                className="run-test-btn stop"
                onClick={stopTest}
              >
                ⏹ 테스트 중지
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 연속 테스트 진행 상황 */}
      {isRunning && continuousMode && (
        <section className="section">
          <div className="continuous-progress-card">
            <h3>🔄 연속 테스트 진행 중...</h3>
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${(continuousStats.elapsedSeconds / (duration * 60)) * 100}%` }}
              />
            </div>
            <div className="progress-stats">
              <div className="progress-stat">
                <span className="stat-label">경과 시간</span>
                <span className="stat-value">{formatElapsed(continuousStats.elapsedSeconds)} / {duration}:00</span>
              </div>
              <div className="progress-stat">
                <span className="stat-label">실행 횟수</span>
                <span className="stat-value">{continuousStats.rounds}회</span>
              </div>
              <div className="progress-stat">
                <span className="stat-label">누적 요청</span>
                <span className="stat-value">{continuousStats.totalRequests.toLocaleString()}</span>
              </div>
              <div className="progress-stat">
                <span className="stat-label">성공</span>
                <span className="stat-value success">{continuousStats.totalCompleted.toLocaleString()}</span>
              </div>
              <div className="progress-stat">
                <span className="stat-label">실패</span>
                <span className="stat-value error">{continuousStats.totalFailed.toLocaleString()}</span>
              </div>
            </div>
            <p className="progress-hint">
              💡 CloudWatch 대시보드에서 ASG 인스턴스 수 변화를 확인하세요
            </p>
          </div>
        </section>
      )}

      {error && (
        <section className="section">
          <div className="error-card">
            <h3>오류</h3>
            <p>{error}</p>
          </div>
        </section>
      )}

      {result && !isRunning && (
        <section className="section">
          <div className="result-card">
            <h3>테스트 결과 {continuousMode && result.rounds && `(총 ${result.rounds}회 실행)`}</h3>

            <div className="result-grid">
              <div className="result-item">
                <span className="result-label">총 요청</span>
                <span className="result-value">{result.totalRequests?.toLocaleString()}</span>
              </div>
              <div className="result-item">
                <span className="result-label">완료된 요청</span>
                <span className="result-value">{result.completedRequests?.toLocaleString()}</span>
              </div>
              <div className="result-item">
                <span className="result-label">실패한 요청</span>
                <span className="result-value error">{result.failedRequests?.toLocaleString()}</span>
              </div>
              <div className="result-item">
                <span className="result-label">초당 요청 (RPS)</span>
                <span className="result-value highlight">{result.requestsPerSecond?.toFixed(2)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">평균 응답시간</span>
                <span className="result-value">{result.avgResponseTime?.toFixed(2)}ms</span>
              </div>
              <div className="result-item">
                <span className="result-label">최소 응답시간</span>
                <span className="result-value">{result.minResponseTime?.toFixed(2)}ms</span>
              </div>
              <div className="result-item">
                <span className="result-label">최대 응답시간</span>
                <span className="result-value">{result.maxResponseTime?.toFixed(2)}ms</span>
              </div>
              <div className="result-item">
                <span className="result-label">테스트 소요시간</span>
                <span className="result-value">{result.totalTime?.toFixed(2)}초</span>
              </div>
            </div>

            {result.raw && (
              <details className="raw-output">
                <summary>원시 출력 보기</summary>
                <pre>{result.raw}</pre>
              </details>
            )}
          </div>
        </section>
      )}

      {result && !isRunning && (
        <section className="section">
          <div className="evidence-card">
            <h3>증적 자료</h3>
            <p className="evidence-subtitle">부하 테스트 결과 요약 (캡처용)</p>

            <div className="evidence-section">
              <h4>테스트 정보</h4>
              <table className="evidence-table">
                <tbody>
                  <tr>
                    <th>테스트 대상</th>
                    <td>{config.target === 'seoul' ? '서울 (ap-northeast-2)' : '도쿄 (ap-northeast-1)'}</td>
                  </tr>
                  <tr>
                    <th>테스트 모드</th>
                    <td>
                      {config.mode === 'light' ? 'Light (/ping)' : 'Heavy (/stress)'}
                      {continuousMode && ' (연속 테스트)'}
                    </td>
                  </tr>
                  <tr>
                    <th>시작 시간</th>
                    <td className="timestamp">{formatTimestamp(testMeta.startTime)}</td>
                  </tr>
                  <tr>
                    <th>종료 시간</th>
                    <td className="timestamp">{formatTimestamp(testMeta.endTime)}</td>
                  </tr>
                  <tr>
                    <th>총 소요 시간</th>
                    <td>{calculateDuration()}</td>
                  </tr>
                  {result.rounds && (
                    <tr>
                      <th>실행 횟수</th>
                      <td>{result.rounds}회</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="evidence-section">
              <h4>요청 결과</h4>
              <table className="evidence-table">
                <tbody>
                  <tr>
                    <th>총 요청 수</th>
                    <td>{result.totalRequests?.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>성공</th>
                    <td className="success">{result.completedRequests?.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>실패</th>
                    <td className="error">{result.failedRequests?.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>성공률</th>
                    <td>{getSuccessRate()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="evidence-section">
              <h4>성능 지표</h4>
              <table className="evidence-table">
                <tbody>
                  <tr>
                    <th>TPS (초당 처리량)</th>
                    <td className="highlight">{result.requestsPerSecond?.toFixed(2)} req/sec</td>
                  </tr>
                  <tr>
                    <th>평균 응답 시간</th>
                    <td>{result.avgResponseTime?.toFixed(2)} ms</td>
                  </tr>
                  <tr>
                    <th>최소 응답 시간</th>
                    <td>{result.minResponseTime?.toFixed(2)} ms</td>
                  </tr>
                  <tr>
                    <th>최대 응답 시간</th>
                    <td>{result.maxResponseTime?.toFixed(2)} ms</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="evidence-section">
              <h4>인스턴스 수 변화 (수동 입력)</h4>
              <div className="instance-input-group">
                <div className="instance-input">
                  <label>테스트 전</label>
                  <input
                    type="number"
                    min="0"
                    value={instanceCount.before}
                    onChange={(e) => setInstanceCount(prev => ({ ...prev, before: e.target.value }))}
                    placeholder="예: 2"
                  />
                </div>
                <span className="arrow">→</span>
                <div className="instance-input">
                  <label>테스트 후</label>
                  <input
                    type="number"
                    min="0"
                    value={instanceCount.after}
                    onChange={(e) => setInstanceCount(prev => ({ ...prev, after: e.target.value }))}
                    placeholder="예: 4"
                  />
                </div>
                {getInstanceChange() && (
                  <span className={`instance-change ${parseInt(getInstanceChange()) > 0 ? 'increase' : 'decrease'}`}>
                    ({getInstanceChange()})
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="info-card">
          <h3>테스트 시나리오 가이드</h3>
          <table className="scenario-table">
            <thead>
              <tr>
                <th>상황</th>
                <th>TPS</th>
                <th>설정 예시</th>
                <th>용도</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>평시</td>
                <td>~7</td>
                <td>-n 1000 -c 10</td>
                <td>기본 상태 확인</td>
              </tr>
              <tr>
                <td>피크</td>
                <td>~22</td>
                <td>-n 5000 -c 50</td>
                <td>피크 대응 확인</td>
              </tr>
              <tr>
                <td>급증</td>
                <td>~62+</td>
                <td>-n 10000 -c 100</td>
                <td>스케일 아웃 트리거</td>
              </tr>
            </tbody>
          </table>
          <p className="info-hint">
            💡 <strong>스케일 아웃 확인:</strong> Heavy 모드 + 연속 테스트(5~10분)로 실행 후 CloudWatch 대시보드에서 인스턴스 증가 확인
          </p>
        </div>
      </section>
    </div>
  )
}
