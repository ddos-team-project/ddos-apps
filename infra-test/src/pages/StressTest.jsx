import React, { useState, useEffect } from 'react'
import { getApiUrl, getSeoulApiUrl, getTokyoApiUrl } from '../components/api'

export default function StressTest() {
  // DB Info State (리전별)
  const [seoulDbInfo, setSeoulDbInfo] = useState(null)
  const [tokyoDbInfo, setTokyoDbInfo] = useState(null)
  const [dbInfoLoading, setDbInfoLoading] = useState(false)

  // DB Stress State
  const [dbConfig, setDbConfig] = useState({ operations: 1000, concurrency: 10, type: 'mixed' })
  const [dbLoading, setDbLoading] = useState(false)
  const [dbResult, setDbResult] = useState(null)

  // RPO Test State (리전 선택 가능)
  const [rpoConfig, setRpoConfig] = useState({ iterations: 10, region: 'seoul' })
  const [rpoLoading, setRpoLoading] = useState(false)
  const [rpoResult, setRpoResult] = useState(null)

  // Tokyo Write Test State (Write Forwarding 테스트)
  const [tokyoWriteConfig, setTokyoWriteConfig] = useState({ operations: 10, type: 'write' })
  const [tokyoWriteLoading, setTokyoWriteLoading] = useState(false)
  const [tokyoWriteResult, setTokyoWriteResult] = useState(null)

  // Cross-Region Test State (Seoul Write → Tokyo Read)
  const [crossRegionConfig, setCrossRegionConfig] = useState({ iterations: 5 })
  const [crossRegionLoading, setCrossRegionLoading] = useState(false)
  const [crossRegionResult, setCrossRegionResult] = useState(null)

  const [error, setError] = useState(null)

  // Fetch DB Info on mount
  useEffect(() => {
    fetchDbInfo()
  }, [])

  const fetchDbInfo = async () => {
    setDbInfoLoading(true)
    try {
      // 서울과 도쿄에서 각각 db-info 가져오기
      const [seoulRes, tokyoRes] = await Promise.all([
        fetch(`${getSeoulApiUrl()}/db-info`).catch(() => null),
        fetch(`${getTokyoApiUrl()}/db-info`).catch(() => null),
      ])

      if (seoulRes) {
        const seoulData = await seoulRes.json()
        setSeoulDbInfo(seoulData)
      }

      if (tokyoRes) {
        const tokyoData = await tokyoRes.json()
        setTokyoDbInfo(tokyoData)
      }
    } catch (err) {
      console.error('DB Info fetch error:', err)
    } finally {
      setDbInfoLoading(false)
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

  // RPO Test (리전 선택)
  const runRpoTest = async () => {
    setRpoLoading(true)
    setRpoResult(null)
    setError(null)

    try {
      const apiUrl = rpoConfig.region === 'tokyo' ? getTokyoApiUrl() : getSeoulApiUrl()
      const response = await fetch(`${apiUrl}/rpo-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iterations: rpoConfig.iterations }),
      })
      const data = await response.json()

      if (data.status === 'ok') {
        setRpoResult({ ...data, testedRegion: rpoConfig.region })
      } else {
        setError(data.message || data.error || 'RPO 테스트 실패')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setRpoLoading(false)
    }
  }

  // Tokyo Write Test (Write Forwarding 테스트)
  const runTokyoWriteTest = async () => {
    setTokyoWriteLoading(true)
    setTokyoWriteResult(null)
    setError(null)

    try {
      const response = await fetch(`${getTokyoApiUrl()}/db-stress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokyoWriteConfig),
      })
      const data = await response.json()

      if (data.status === 'ok') {
        setTokyoWriteResult(data)
      } else {
        setError(data.message || data.error || 'Tokyo Write 테스트 실패 (Write Forwarding 미동작 가능)')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setTokyoWriteLoading(false)
    }
  }

  // Cross-Region Test (Seoul Write → Tokyo Read) - 마커 기반 API 사용
  const runCrossRegionTest = async () => {
    setCrossRegionLoading(true)
    setCrossRegionResult(null)
    setError(null)

    const results = []
    const errors = []

    // API URL을 미리 생성 (같은 세션에서 동일 URL 사용)
    const seoulUrl = getSeoulApiUrl()
    const tokyoUrl = getTokyoApiUrl()

    try {
      for (let i = 0; i < crossRegionConfig.iterations; i++) {
        const writeStart = Date.now()

        // 1. Seoul에 마커 Write
        let writeRes
        try {
          writeRes = await fetch(`${seoulUrl}/write-marker`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (fetchErr) {
          errors.push(`Iteration ${i + 1}: Seoul Write 연결 실패 - ${fetchErr.message}`)
          continue
        }

        let writeData
        try {
          writeData = await writeRes.json()
        } catch (jsonErr) {
          errors.push(`Iteration ${i + 1}: Seoul Write 응답 파싱 실패`)
          continue
        }

        if (writeData.status === 'forbidden') {
          setError('서버에서 stress 테스트가 비활성화되어 있습니다 (ALLOW_STRESS=false)')
          return
        }

        if (writeData.status !== 'ok') {
          errors.push(`Iteration ${i + 1}: Write 실패 - ${writeData.error || writeData.message || 'Unknown'}`)
          continue
        }

        const markerId = writeData.markerId

        // 2. Tokyo에서 마커 Read 폴링 (최대 30초)
        const maxWait = 30000
        const pollInterval = 50
        let found = false

        while (Date.now() - writeStart < maxWait) {
          try {
            const readRes = await fetch(`${tokyoUrl}/read-marker?id=${markerId}`)
            const readData = await readRes.json()

            if (readData.status === 'ok' && readData.found) {
              const lag = Date.now() - writeStart
              results.push(lag)
              found = true
              break
            }
          } catch (e) {
            // continue polling
          }
          await new Promise(r => setTimeout(r, pollInterval))
        }

        // 3. Seoul에서 마커 삭제 (cleanup)
        try {
          await fetch(`${seoulUrl}/delete-marker?id=${markerId}`, { method: 'DELETE' })
        } catch (e) {
          // ignore cleanup error
        }

        if (!found) {
          errors.push(`Iteration ${i + 1}: Timeout (30s)`)
        }

        // 측정 간 간격
        if (i < crossRegionConfig.iterations - 1) {
          await new Promise(r => setTimeout(r, 200))
        }
      }

      if (results.length === 0) {
        if (errors.length > 0) {
          setError(`모든 Cross-Region 측정 실패: ${errors[0]}`)
        } else {
          setError('모든 Cross-Region 측정 실패')
        }
        return
      }

      const sorted = [...results].sort((a, b) => a - b)
      setCrossRegionResult({
        status: 'ok',
        iterations: crossRegionConfig.iterations,
        successful: results.length,
        failed: errors.length,
        avgLagMs: Math.round(results.reduce((a, b) => a + b, 0) / results.length),
        minLagMs: sorted[0],
        maxLagMs: sorted[sorted.length - 1],
        medianLagMs: sorted[Math.floor(sorted.length / 2)],
        p95LagMs: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
        allLagsMs: results,
        errors: errors.length > 0 ? errors : undefined,
      })
    } catch (err) {
      setError(`Cross-Region 테스트 오류: ${err.message}`)
    } finally {
      setCrossRegionLoading(false)
    }
  }

  const operationsOptions = [500, 1000, 5000]
  const concurrencyOptions = [5, 10, 20]
  const dbTypeOptions = [
    { value: 'write', label: 'Write Only' },
    { value: 'read', label: 'Read Only' },
    { value: 'mixed', label: 'Mixed (7:3)' },
  ]
  const iterationsOptions = [5, 10, 20, 50]
  const regionOptions = [
    { value: 'seoul', label: 'Seoul' },
    { value: 'tokyo', label: 'Tokyo' },
  ]
  const tokyoWriteOpsOptions = [10, 50, 100]
  const crossRegionIterOptions = [3, 5, 10]

  const getStatusBadge = (status) => {
    if (status === 'ok') return <span className="status-badge ok">OK</span>
    if (status === 'error') return <span className="status-badge error">ERROR</span>
    return <span className="status-badge pending">N/A</span>
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>DB 테스트</h1>
        <p className="subtitle">
          Aurora DB 부하 테스트 및 복제 지연 측정
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

      {/* DB Info */}
      <section className="section">
        <div className="load-test-card db-info-card">
          <div className="db-info-header">
            <h3>DB 연결 정보</h3>
            <button
              className="refresh-btn"
              onClick={fetchDbInfo}
              disabled={dbInfoLoading}
            >
              {dbInfoLoading ? '조회 중...' : '새로고침'}
            </button>
          </div>

          <div className="db-regions-container">
            {/* 서울 리전 */}
            <div className="db-region-section seoul">
              <div className="db-region-header">
                <span className="region-flag">🇰🇷</span>
                <span className="region-name">서울 (ap-northeast-2)</span>
              </div>
              <div className="db-info-grid">
                <div className="db-info-item">
                  <div className="db-info-label">
                    <span className="db-role">Writer</span>
                    {getStatusBadge(seoulDbInfo?.databases?.writer?.status)}
                  </div>
                  <div className="db-info-host">
                    {seoulDbInfo?.databases?.writer?.host || '-'}
                  </div>
                </div>
                <div className="db-info-item">
                  <div className="db-info-label">
                    <span className="db-role">Reader</span>
                    {getStatusBadge(seoulDbInfo?.databases?.reader?.status)}
                  </div>
                  <div className="db-info-host">
                    {seoulDbInfo?.databases?.reader?.host || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* 도쿄 리전 */}
            <div className="db-region-section tokyo">
              <div className="db-region-header">
                <span className="region-flag">🇯🇵</span>
                <span className="region-name">도쿄 (ap-northeast-1)</span>
              </div>
              <div className="db-info-grid">
                <div className="db-info-item tokyo">
                  <div className="db-info-label">
                    <span className="db-role">Writer</span>
                    {getStatusBadge(tokyoDbInfo?.databases?.writer?.status)}
                  </div>
                  <div className="db-info-host">
                    {tokyoDbInfo?.databases?.writer?.host || '-'}
                  </div>
                </div>
                <div className="db-info-item tokyo">
                  <div className="db-info-label">
                    <span className="db-role">Reader</span>
                    {getStatusBadge(tokyoDbInfo?.databases?.reader?.status)}
                  </div>
                  <div className="db-info-host">
                    {tokyoDbInfo?.databases?.reader?.host || '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>
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
          <p className="card-desc">Aurora Writer→Reader 복제 지연 시간 측정 (리전 선택 가능)</p>

          <div className="config-group">
            <label>리전</label>
            <div className="button-group">
              {regionOptions.map(opt => (
                <button
                  key={opt.value}
                  className={rpoConfig.region === opt.value ? 'active' : ''}
                  onClick={() => setRpoConfig(prev => ({ ...prev, region: opt.value }))}
                  disabled={rpoLoading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

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
            {rpoLoading ? 'RPO 측정 중...' : `RPO 테스트 실행 (${rpoConfig.region.toUpperCase()})`}
          </button>

          {rpoResult && (
            <div className="result-inline">
              <div className="result-grid">
                <div className="result-item">
                  <span className="result-label">리전</span>
                  <span className="result-value">{rpoResult.testedRegion?.toUpperCase()}</span>
                </div>
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
            </div>
          )}
        </div>
      </section>

      {/* Tokyo Write Test (Write Forwarding) */}
      <section className="section">
        <div className="load-test-card tokyo-write">
          <h3>Tokyo Write 테스트 (Write Forwarding)</h3>
          <p className="card-desc">Tokyo Secondary → Seoul Primary Write Forwarding 동작 확인</p>

          <div className="config-group">
            <label>작업 수</label>
            <div className="button-group">
              {tokyoWriteOpsOptions.map(num => (
                <button
                  key={num}
                  className={tokyoWriteConfig.operations === num ? 'active' : ''}
                  onClick={() => setTokyoWriteConfig(prev => ({ ...prev, operations: num }))}
                  disabled={tokyoWriteLoading}
                >
                  {num}회
                </button>
              ))}
            </div>
          </div>

          <button
            className="run-test-btn tokyo"
            onClick={runTokyoWriteTest}
            disabled={tokyoWriteLoading}
          >
            {tokyoWriteLoading ? 'Tokyo Write 실행 중...' : 'Tokyo Write 테스트 실행'}
          </button>

          {tokyoWriteResult && (
            <div className="result-inline">
              <div className="result-grid">
                <div className="result-item">
                  <span className="result-label">총 Write</span>
                  <span className="result-value">{tokyoWriteResult.totalWrites?.toLocaleString()}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">소요 시간</span>
                  <span className="result-value">{(tokyoWriteResult.elapsedMs / 1000).toFixed(2)}초</span>
                </div>
                <div className="result-item">
                  <span className="result-label">OPS</span>
                  <span className="result-value highlight">{tokyoWriteResult.opsPerSecond?.toLocaleString()}/s</span>
                </div>
                <div className="result-item">
                  <span className="result-label">위치</span>
                  <span className="result-value">{tokyoWriteResult.location?.region}</span>
                </div>
              </div>
              <p className="test-id">Test ID: {tokyoWriteResult.testId}</p>
            </div>
          )}
        </div>
      </section>

      {/* Cross-Region Test (Seoul Write → Tokyo Read) */}
      <section className="section">
        <div className="load-test-card cross-region">
          <h3>Cross-Region 복제 테스트</h3>
          <p className="card-desc">Seoul Write → Tokyo Read 크로스 리전 복제 지연 측정</p>

          <div className="config-group">
            <label>측정 횟수</label>
            <div className="button-group">
              {crossRegionIterOptions.map(num => (
                <button
                  key={num}
                  className={crossRegionConfig.iterations === num ? 'active' : ''}
                  onClick={() => setCrossRegionConfig(prev => ({ ...prev, iterations: num }))}
                  disabled={crossRegionLoading}
                >
                  {num}회
                </button>
              ))}
            </div>
          </div>

          <button
            className="run-test-btn cross-region"
            onClick={runCrossRegionTest}
            disabled={crossRegionLoading}
          >
            {crossRegionLoading ? 'Cross-Region 측정 중...' : 'Cross-Region 테스트 실행'}
          </button>

          {crossRegionResult && (
            <div className="result-inline">
              <div className="result-grid">
                <div className="result-item">
                  <span className="result-label">성공</span>
                  <span className="result-value">{crossRegionResult.successful}/{crossRegionResult.iterations}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">평균 지연</span>
                  <span className="result-value highlight">{crossRegionResult.avgLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">최소</span>
                  <span className="result-value">{crossRegionResult.minLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">최대</span>
                  <span className="result-value">{crossRegionResult.maxLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">중앙값</span>
                  <span className="result-value">{crossRegionResult.medianLagMs}ms</span>
                </div>
                <div className="result-item">
                  <span className="result-label">P95</span>
                  <span className="result-value">{crossRegionResult.p95LagMs}ms</span>
                </div>
              </div>
              <div className="host-info">
                <p>Seoul Write → Tokyo Read (Cross-Region Replication)</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="info-card">
          <h3>테스트 가이드</h3>
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
                <td>DB Stress</td>
                <td>Aurora DB 부하 테스트</td>
                <td>DB Connection, IOPS 모니터링</td>
              </tr>
              <tr>
                <td>RPO Test</td>
                <td>복제 지연 측정 (리전별)</td>
                <td>Writer→Reader 복제 지연 확인 (목표: &lt;100ms)</td>
              </tr>
              <tr>
                <td>Tokyo Write</td>
                <td>Write Forwarding 테스트</td>
                <td>Tokyo→Seoul 쓰기 전달 동작 확인</td>
              </tr>
              <tr>
                <td>Cross-Region</td>
                <td>크로스 리전 복제 지연</td>
                <td>Seoul Write→Tokyo Read 지연 측정 (목표: &lt;1초)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
