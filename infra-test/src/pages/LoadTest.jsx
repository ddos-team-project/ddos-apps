import React, { useState, useRef, useEffect } from 'react'

const API_URLS = {
  seoul: 'https://seoul.tier1.ddos.io.kr',
  tokyo: 'https://tokyo.tier1.ddos.io.kr',
}

export default function LoadTest() {
  // 설정
  const [region, setRegion] = useState('seoul')
  const [tps, setTps] = useState(22)
  const [duration, setDuration] = useState(600) // 초 단위

  // 상태
  const [isRunning, setIsRunning] = useState(false)
  const [stats, setStats] = useState({
    sent: 0,
    success: 0,
    failed: 0,
    elapsedSeconds: 0,
  })
  const [testId, setTestId] = useState(null)
  const [instanceCount, setInstanceCount] = useState({ before: null, current: null })

  // Refs
  const abortRef = useRef(false)
  const statsRef = useRef({ sent: 0, success: 0, failed: 0 })
  const intervalRef = useRef(null)
  const timerRef = useRef(null)

  const tpsOptions = [
    { value: 7, label: '7 TPS', desc: '평상시' },
    { value: 22, label: '22 TPS', desc: '저녁 피크' },
    { value: 62, label: '62 TPS', desc: '급증 피크' },
  ]

  const durationOptions = [
    { value: 600, label: '10분' },
    { value: 1800, label: '30분' },
    { value: 3600, label: '1시간' },
  ]

  // 테스트 ID 생성
  const generateTestId = () => {
    const now = new Date()
    return `test-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
  }

  // 단일 트랜잭션 전송
  const sendTransaction = async (currentTestId, requestId) => {
    try {
      const response = await fetch(`${API_URLS[region]}/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId: currentTestId, requestId }),
      })
      const data = await response.json()
      return data.status === 'success'
    } catch (err) {
      return false
    }
  }

  // 테스트 시작
  const startTest = async () => {
    const currentTestId = generateTestId()
    setTestId(currentTestId)
    setIsRunning(true)
    abortRef.current = false
    statsRef.current = { sent: 0, success: 0, failed: 0 }
    setStats({ sent: 0, success: 0, failed: 0, elapsedSeconds: 0 })

    const startTime = Date.now()
    let requestCounter = 0

    // 경과 시간 타이머
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setStats(prev => ({ ...prev, elapsedSeconds: elapsed }))
    }, 1000)

    // TPS에 맞춰 요청 전송
    const intervalMs = 1000 / tps

    intervalRef.current = setInterval(async () => {
      if (abortRef.current) return

      const elapsed = (Date.now() - startTime) / 1000
      if (elapsed >= duration) {
        stopTest()
        return
      }

      requestCounter++
      const requestId = `req-${String(requestCounter).padStart(6, '0')}`

      statsRef.current.sent++
      setStats(prev => ({ ...prev, sent: statsRef.current.sent }))

      const success = await sendTransaction(currentTestId, requestId)

      if (success) {
        statsRef.current.success++
      } else {
        statsRef.current.failed++
      }
      setStats(prev => ({
        ...prev,
        success: statsRef.current.success,
        failed: statsRef.current.failed,
      }))
    }, intervalMs)
  }

  // 테스트 중지
  const stopTest = () => {
    abortRef.current = true
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRunning(false)
  }

  // 로그 다운로드
  const downloadLogs = async () => {
    if (!testId) return
    window.open(`${API_URLS[region]}/test-logs?testId=${testId}&format=csv`, '_blank')
  }

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const getSuccessRate = () => {
    if (stats.sent === 0) return '-'
    return ((stats.success / stats.sent) * 100).toFixed(1) + '%'
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>피크 트래픽 테스트</h1>
        <p className="subtitle">ASG 오토스케일링 검증을 위한 트래픽 시뮬레이션</p>
      </header>

      <section className="section">
        <h2>테스트 설정</h2>
        <div className="card">
          <div className="form-group">
            <label>리전</label>
            <div className="button-group">
              <button
                className={`btn ${region === 'seoul' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRegion('seoul')}
                disabled={isRunning}
              >
                서울
              </button>
              <button
                className={`btn ${region === 'tokyo' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRegion('tokyo')}
                disabled={isRunning}
              >
                도쿄
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>TPS (초당 요청 수)</label>
            <div className="button-group">
              {tpsOptions.map(opt => (
                <button
                  key={opt.value}
                  className={`btn ${tps === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTps(opt.value)}
                  disabled={isRunning}
                >
                  {opt.label}
                  <small>{opt.desc}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>테스트 시간</label>
            <div className="button-group">
              {durationOptions.map(opt => (
                <button
                  key={opt.value}
                  className={`btn ${duration === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setDuration(opt.value)}
                  disabled={isRunning}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-actions">
            {!isRunning ? (
              <button className="btn btn-primary btn-large" onClick={startTest}>
                테스트 시작
              </button>
            ) : (
              <button className="btn btn-danger btn-large" onClick={stopTest}>
                테스트 중지
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <h2>실시간 현황</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">전송</div>
            <div className="stat-value">{stats.sent.toLocaleString()}</div>
          </div>
          <div className="stat-card success">
            <div className="stat-label">성공</div>
            <div className="stat-value">{stats.success.toLocaleString()}</div>
          </div>
          <div className="stat-card error">
            <div className="stat-label">실패</div>
            <div className="stat-value">{stats.failed.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">성공률</div>
            <div className="stat-value">{getSuccessRate()}</div>
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-info">
            <span>경과: {formatTime(stats.elapsedSeconds)}</span>
            <span>목표: {formatTime(duration)}</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min((stats.elapsedSeconds / duration) * 100, 100)}%` }}
            />
          </div>
        </div>
      </section>

      {testId && (
        <section className="section">
          <h2>테스트 결과</h2>
          <div className="card">
            <div className="result-info">
              <div><strong>테스트 ID:</strong> {testId}</div>
              <div><strong>총 요청:</strong> {stats.sent.toLocaleString()}건</div>
              <div><strong>성공:</strong> {stats.success.toLocaleString()}건</div>
              <div><strong>실패:</strong> {stats.failed.toLocaleString()}건</div>
              <div><strong>성공률:</strong> {getSuccessRate()}</div>
            </div>
            <button className="btn btn-secondary" onClick={downloadLogs} disabled={isRunning}>
              로그 다운로드 (CSV)
            </button>
          </div>
        </section>
      )}

      <section className="section">
        <h2>테스트 시나리오</h2>
        <div className="scenario-table">
          <table>
            <thead>
              <tr>
                <th>시나리오</th>
                <th>TPS</th>
                <th>5분 총 요청</th>
                <th>예상 결과</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>평상시</td>
                <td>7</td>
                <td>2,100</td>
                <td>스케일 없음</td>
              </tr>
              <tr>
                <td>저녁 피크</td>
                <td>22</td>
                <td>6,600</td>
                <td>스케일 아웃 가능</td>
              </tr>
              <tr className="highlight">
                <td>급증 피크</td>
                <td>62</td>
                <td>18,600</td>
                <td>스케일 아웃 필수</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
