import React, { useState, useRef, useEffect } from 'react'

const API_URL = 'https://tier1.ddos.io.kr'

export default function LoadTest() {
  // 설정
  const [tps, setTps] = useState(22)
  const [duration, setDuration] = useState(300)

  // 상태
  const [isRunning, setIsRunning] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState(null)
  const [testId, setTestId] = useState(null)
  const [isStopping, setIsStopping] = useState(false)

  const timerRef = useRef(null)

  const tpsOptions = [
    { value: 7, label: '7 TPS', desc: '평상시' },
    { value: 22, label: '22 TPS', desc: '저녁 피크' },
    { value: 62, label: '62 TPS', desc: '급증 (3배)' },
  ]

  const durationOptions = [
    { value: 60, label: '1분' },
    { value: 300, label: '5분' },
    { value: 600, label: '10분' },
    { value: 1800, label: '30분', desc: '페일오버' },
  ]

  const startTest = async () => {
    const newTestId = 'test-' + Date.now()
    setTestId(newTestId)
    setIsRunning(true)
    setError(null)
    setTestResult(null)
    setElapsedSeconds(0)
    setIsStopping(false)

    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setElapsedSeconds(elapsed)
      if (elapsed >= duration) {
        clearInterval(timerRef.current)
        setIsRunning(false)
        setTestId(null)
      }
    }, 1000)

    try {
      const response = await fetch(API_URL + '/load-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tps, duration, testId: newTestId }),
      })
      const data = await response.json()
      setTestResult(data)
    } catch (err) {
      setError(err.message)
      setIsRunning(false)
      setTestId(null)
      clearInterval(timerRef.current)
    }
  }

  const stopTest = async () => {
    if (!testId || isStopping) return

    setIsStopping(true)
    try {
      const response = await fetch(API_URL + '/load-test/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId }),
      })
      const data = await response.json()

      clearInterval(timerRef.current)
      setIsRunning(false)
      setTestId(null)
      setTestResult(prev => ({ ...prev, status: 'stopped', stoppedAt: data.timestamp }))
    } catch (err) {
      setError('중단 실패: ' + err.message)
    } finally {
      setIsStopping(false)
    }
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const formatTime = (s) => Math.floor(s/60) + ':' + String(s%60).padStart(2,'0')
  const totalRequests = tps * duration

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>피크 트래픽 테스트</h1>
        <p className="subtitle">금융권 트래픽 급증 시뮬레이션</p>
      </header>

      <section className="section">
        <h2>테스트 설정</h2>
        <div className="card">
          <div className="config-hint">
            <strong>방식:</strong> 서버에서 ab로 ALB에 요청 → 각 요청당 14단계 금융 처리 → CPU 부하 → ASG 스케일 아웃
            <br />
            <strong>분산:</strong> 랜덤 서브도메인으로 DNS 캐싱 우회 → Route53 가중치(80:20) 분산 적용
          </div>

          <div className="form-group">
            <label>TPS (초당 요청)</label>
            <div className="button-group">
              {tpsOptions.map(opt => (
                <button key={opt.value} className={tps === opt.value ? 'active' : ''} onClick={() => setTps(opt.value)} disabled={isRunning}>
                  {opt.label}<small>{opt.desc}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>테스트 시간</label>
            <div className="button-group">
              {durationOptions.map(opt => (
                <button key={opt.value} className={duration === opt.value ? 'active' : ''} onClick={() => setDuration(opt.value)} disabled={isRunning}>
                  {opt.label}{opt.desc && <small>{opt.desc}</small>}
                </button>
              ))}
            </div>
          </div>

          <div className="test-summary">
            <span><strong>총 요청:</strong> {totalRequests.toLocaleString()}건</span>
            <span><strong>동시연결:</strong> {Math.min(tps, 100)}개</span>
            <span><strong>내부처리:</strong> {(totalRequests * 14).toLocaleString()}단계</span>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary btn-large" onClick={startTest} disabled={isRunning}>
              {isRunning ? '테스트 진행 중...' : '부하 테스트 시작'}
            </button>
            {isRunning && (
              <button className="btn btn-danger btn-large" onClick={stopTest} disabled={isStopping} style={{ marginLeft: '10px' }}>
                {isStopping ? '중단 중...' : '테스트 중단'}
              </button>
            )}
          </div>
        </div>
      </section>

      {(isRunning || testResult) && (
        <section className="section">
          <h2>진행 상황</h2>
          <div className="card">
            <div className="progress-section">
              <div className="progress-info">
                <span>경과: {formatTime(elapsedSeconds)}</span>
                <span>목표: {formatTime(duration)}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: Math.min((elapsedSeconds/duration)*100, 100) + '%' }} />
              </div>
            </div>

            {testResult && (
              <div className="result-info">
                <div><strong>상태:</strong> {testResult.status}</div>
                <div><strong>실행 인스턴스:</strong> {testResult.location?.instanceId} ({testResult.location?.region})</div>
                <div><strong>설정:</strong> {testResult.config?.totalRequests?.toLocaleString()}건, {testResult.config?.concurrency}동시연결</div>
                {testResult.stoppedAt && <div><strong>중단 시각:</strong> {testResult.stoppedAt}</div>}
              </div>
            )}

            {!isRunning && testResult?.status !== 'stopped' && elapsedSeconds >= duration && (
              <div className="completion-message">
                <p><strong>테스트 완료!</strong> CloudWatch에서 확인:</p>
                <ul>
                  <li>EC2 → Auto Scaling Groups → CPU / 인스턴스 수</li>
                  <li>CloudWatch → Metrics → CPUUtilization</li>
                </ul>
              </div>
            )}

            {testResult?.status === 'stopped' && (
              <div className="completion-message">
                <p><strong>테스트가 중단되었습니다.</strong></p>
              </div>
            )}
          </div>
        </section>
      )}

      {error && <div className="card error"><strong>오류:</strong> {error}</div>}

      <section className="section">
        <h2>시나리오</h2>
        <table className="scenario-table">
          <thead><tr><th>시나리오</th><th>TPS</th><th>5분 요청</th><th>내부처리</th><th>예상</th></tr></thead>
          <tbody>
            <tr><td>평상시</td><td>7</td><td>2,100</td><td>29,400</td><td>스케일 없음</td></tr>
            <tr><td>저녁 피크</td><td>22</td><td>6,600</td><td>92,400</td><td>스케일 가능</td></tr>
            <tr className="highlight"><td>급증 (3배)</td><td>62</td><td>18,600</td><td>260,400</td><td>스케일 필수</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
