import React, { useState } from 'react'
import { getApiUrl } from '../components/api'

export default function StressTest() {
  // CPU Stress State
  const [cpuConfig, setCpuConfig] = useState({ seconds: 30, intensity: null })
  const [cpuLoading, setCpuLoading] = useState(false)
  const [cpuResult, setCpuResult] = useState(null)

  // DB Stress State
  const [dbConfig, setDbConfig] = useState({ operations: 1000, concurrency: 10, type: 'mixed' })
  const [dbLoading, setDbLoading] = useState(false)
  const [dbResult, setDbResult] = useState(null)

  // RPO Test State
  const [rpoConfig, setRpoConfig] = useState({ iterations: 10 })
  const [rpoLoading, setRpoLoading] = useState(false)
  const [rpoResult, setRpoResult] = useState(null)

  const [error, setError] = useState(null)

  // CPU Stress Test
  const runCpuStress = async () => {
    setCpuLoading(true)
    setCpuResult(null)
    setError(null)

    try {
      const params = new URLSearchParams({ seconds: cpuConfig.seconds })
      if (cpuConfig.intensity) params.append('intensity', cpuConfig.intensity)

      const response = await fetch(`${getApiUrl()}/stress?${params}`)
      const data = await response.json()

      if (data.status === 'ok') {
        setCpuResult(data)
      } else {
        setError(data.message || data.error || 'CPU 스트레스 테스트 실패')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCpuLoading(false)
    }
  }

  // DB Stress Test
  const runDbStress = async () => {
    setDbLoading(true)
    setDbResult(null)
    setError(null)

    try {
      const response = await fetch(`${getApiUrl()}/db-stress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig),
      })
      const data = await response.json()

      if (data.status === 'ok') {
        setDbResult(data)
      } else {
        setError(data.message || data.error || 'DB 스트레스 테스트 실패')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setDbLoading(false)
    }
  }

  // RPO Test
  const runRpoTest = async () => {
    setRpoLoading(true)
    setRpoResult(null)
    setError(null)

    try {
      const response = await fetch(`${getApiUrl()}/rpo-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpoConfig),
      })
      const data = await response.json()

      if (data.status === 'ok') {
        setRpoResult(data)
      } else {
        setError(data.message || data.error || 'RPO 테스트 실패')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRpoLoading(false)
    }
  }

  const secondsOptions = [10, 30, 60, 120]
  const intensityOptions = [
    { value: null, label: '전체 코어' },
    { value: 1, label: '1코어' },
    { value: 2, label: '2코어' },
    { value: 4, label: '4코어' },
  ]
  const operationsOptions = [500, 1000, 5000]
  const concurrencyOptions = [5, 10, 20]
  const dbTypeOptions = [
    { value: 'write', label: 'Write Only' },
    { value: 'read', label: 'Read Only' },
    { value: 'mixed', label: 'Mixed (7:3)' },
  ]
  const iterationsOptions = [5, 10, 20, 50]

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>스트레스 테스트</h1>
        <p className="subtitle">
          CPU, DB, RPO 스트레스 테스트로 ASG 오토스케일링 및 Aurora 복제 지연 측정
        </p>
      </header>

      {error && (
        <section className="section">
          <div className="error-card">
            <h3>오류</h3>
            <p>{error}</p>
          </div>
        </section>
      )}

      {/* CPU Stress Test */}
      <section className="section">
        <div className="load-test-card">
          <h3>CPU 스트레스 테스트</h3>
          <p className="card-desc">Worker Threads + crypto.pbkdf2로 실제 멀티코어 CPU 부하 생성</p>

          <div className="config-group">
            <label>실행 시간</label>
            <div className="button-group">
              {secondsOptions.map(sec => (
                <button
                  key={sec}
                  className={cpuConfig.seconds === sec ? 'active' : ''}
                  onClick={() => setCpuConfig(prev => ({ ...prev, seconds: sec }))}
                  disabled={cpuLoading}
                >
                  {sec}초
                </button>
              ))}
            </div>
          </div>

          <div className="config-group">
            <label>코어 수 (intensity)</label>
            <div className="button-group">
              {intensityOptions.map(opt => (
                <button
                  key={opt.value ?? 'all'}
                  className={cpuConfig.intensity === opt.value ? 'active' : ''}
                  onClick={() => setCpuConfig(prev => ({ ...prev, intensity: opt.value }))}
                  disabled={cpuLoading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="run-test-btn"
            onClick={runCpuStress}
            disabled={cpuLoading}
          >
            {cpuLoading ? 'CPU 스트레스 실행 중...' : 'CPU 스트레스 실행'}
          </button>

          {cpuResult && (
            <div className="result-inline">
              <div className="result-grid">
                <div className="result-item">
                  <span className="result-label">사용 코어</span>
                  <span className="result-value">{cpuResult.workersUsed}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">총 코어</span>
                  <span className="result-value">{cpuResult.cpuCount}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">소요 시간</span>
                  <span className="result-value highlight">{(cpuResult.elapsedMs / 1000).toFixed(1)}초</span>
                </div>
                <div className="result-item">
                  <span className="result-label">위치</span>
                  <span className="result-value">{cpuResult.location?.region || '-'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* DB Stress Test */}
      <section className="section">
        <div className="load-test-card">
          <h3>DB 스트레스 테스트</h3>
          <p className="card-desc">Aurora MySQL에 대량 Write/Read 작업으로 DB 부하 생성</p>

          <div className="config-group">
            <label>작업 수</label>
            <div className="button-group">
              {operationsOptions.map(num => (
                <button
                  key={num}
                  className={dbConfig.operations === num ? 'active' : ''}
                  onClick={() => setDbConfig(prev => ({ ...prev, operations: num }))}
                  disabled={dbLoading}
                >
                  {num.toLocaleString()}회
                </button>
              ))}
            </div>
          </div>

          <div className="config-group">
            <label>동시성</label>
            <div className="button-group">
              {concurrencyOptions.map(num => (
                <button
                  key={num}
                  className={dbConfig.concurrency === num ? 'active' : ''}
                  onClick={() => setDbConfig(prev => ({ ...prev, concurrency: num }))}
                  disabled={dbLoading}
                >
                  {num}개
                </button>
              ))}
            </div>
          </div>

          <div className="config-group">
            <label>작업 유형</label>
            <div className="button-group">
              {dbTypeOptions.map(opt => (
                <button
                  key={opt.value}
                  className={dbConfig.type === opt.value ? 'active' : ''}
                  onClick={() => setDbConfig(prev => ({ ...prev, type: opt.value }))}
                  disabled={dbLoading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="run-test-btn"
            onClick={runDbStress}
            disabled={dbLoading}
          >
            {dbLoading ? 'DB 스트레스 실행 중...' : 'DB 스트레스 실행'}
          </button>

          {dbResult && (
            <div className="result-inline">
              <div className="result-grid">
                <div className="result-item">
                  <span className="result-label">총 Write</span>
                  <span className="result-value">{dbResult.totalWrites?.toLocaleString()}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">총 Read</span>
                  <span className="result-value">{dbResult.totalReads?.toLocaleString()}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">소요 시간</span>
                  <span className="result-value">{(dbResult.elapsedMs / 1000).toFixed(2)}초</span>
                </div>
                <div className="result-item">
                  <span className="result-label">OPS</span>
                  <span className="result-value highlight">{dbResult.opsPerSecond?.toLocaleString()}/s</span>
                </div>
              </div>
              <p className="test-id">Test ID: {dbResult.testId}</p>
            </div>
          )}
        </div>
      </section>

      {/* RPO Test */}
      <section className="section">
        <div className="load-test-card">
          <h3>RPO 테스트 (복제 지연 측정)</h3>
          <p className="card-desc">Aurora Writer→Reader 복제 지연 시간 측정</p>

          <div className="config-group">
            <label>측정 횟수</label>
            <div className="button-group">
              {iterationsOptions.map(num => (
                <button
                  key={num}
                  className={rpoConfig.iterations === num ? 'active' : ''}
                  onClick={() => setRpoConfig(prev => ({ ...prev, iterations: num }))}
                  disabled={rpoLoading}
                >
                  {num}회
                </button>
              ))}
            </div>
          </div>

          <button
            className="run-test-btn"
            onClick={runRpoTest}
            disabled={rpoLoading}
          >
            {rpoLoading ? 'RPO 측정 중...' : 'RPO 테스트 실행'}
          </button>

          {rpoResult && (
            <div className="result-inline">
              <div className="result-grid">
                <div className="result-item">
                  <span className="result-label">성공</span>
                  <span className="result-value">{rpoResult.successful}/{rpoResult.iterations}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">평균 지연</span>
                  <span className="result-value highlight">{rpoResult.avgLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">최소</span>
                  <span className="result-value">{rpoResult.minLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">최대</span>
                  <span className="result-value">{rpoResult.maxLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">중앙값</span>
                  <span className="result-value">{rpoResult.medianLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">P95</span>
                  <span className="result-value">{rpoResult.p95LagMs}ms</span>
                </div>
              </div>
              <div className="host-info">
                <p>Writer: {rpoResult.writerHost}</p>
                <p>Reader: {rpoResult.readerHost}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="info-card">
          <h3>스트레스 테스트 가이드</h3>
          <table className="scenario-table">
            <thead>
              <tr>
                <th>테스트</th>
                <th>목적</th>
                <th>기대 효과</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CPU Stress</td>
                <td>CPU 기반 ASG 스케일 아웃</td>
                <td>70-80% CPU 도달 시 인스턴스 증가</td>
              </tr>
              <tr>
                <td>DB Stress</td>
                <td>Aurora DB 부하 테스트</td>
                <td>DB Connection, IOPS 모니터링</td>
              </tr>
              <tr>
                <td>RPO Test</td>
                <td>복제 지연 측정</td>
                <td>Writer→Reader 복제 지연 확인 (목표: &lt;100ms)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
