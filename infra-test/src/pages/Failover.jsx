import React, { useState } from 'react'

const FAILOVER_API_URL = 'https://wxeisn64r8.execute-api.ap-northeast-1.amazonaws.com/execute-failover'
const API_KEY = import.meta.env.VITE_FAILOVER_API_KEY || ''

export default function Failover() {
  const [status, setStatus] = useState('idle') // idle, loading, success, error
  const [result, setResult] = useState(null)
  const [logs, setLogs] = useState([])

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('ko-KR')
    setLogs(prev => [...prev, { timestamp, message, type }])
  }

  const executeFailover = async () => {
    if (!API_KEY) {
      addLog('API 키가 설정되지 않았습니다.', 'error')
      setStatus('error')
      return
    }

    const confirmed = window.confirm(
      '정말로 Failover를 실행하시겠습니까?\n\n' +
      '이 작업은 서울 리전에서 도쿄 리전으로 트래픽을 전환합니다.'
    )

    if (!confirmed) {
      addLog('Failover 실행이 취소되었습니다.', 'warn')
      return
    }

    setStatus('loading')
    setResult(null)
    addLog('Failover 실행 요청 중...', 'info')

    try {
      const response = await fetch(FAILOVER_API_URL, {
        method: 'POST',
        headers: {
          'X-Api-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setResult(data)
        addLog('Failover 실행 성공!', 'success')
        addLog(`응답: ${JSON.stringify(data)}`, 'info')
      } else {
        setStatus('error')
        setResult(data)
        addLog(`Failover 실행 실패: ${response.status}`, 'error')
        addLog(`응답: ${JSON.stringify(data)}`, 'error')
      }
    } catch (error) {
      setStatus('error')
      addLog(`네트워크 오류: ${error.message}`, 'error')
    }
  }

  const clearLogs = () => {
    setLogs([])
    setStatus('idle')
    setResult(null)
  }

  return (
    <div className="page-content">
      <header className="page-header">
        <h1>DR Failover</h1>
        <p className="subtitle">
          재해 복구 Failover 실행 - 서울에서 도쿄로 트래픽 전환
        </p>
      </header>

      <section className="section">
        <div className="failover-container">
          <div className="failover-warning">
            <h3>주의사항</h3>
            <ul>
              <li>이 버튼은 실제 Failover를 실행합니다.</li>
              <li>서울 리전의 트래픽이 도쿄 리전으로 전환됩니다.</li>
              <li>실행 전 반드시 CloudWatch 대시보드를 확인하세요.</li>
              <li>테스트 목적으로만 사용하세요.</li>
            </ul>
          </div>

          <div className="failover-actions">
            <button
              className={`failover-button ${status}`}
              onClick={executeFailover}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? (
                <>
                  <span className="spinner"></span>
                  실행 중...
                </>
              ) : (
                <>
                  <span className="button-icon">🔄</span>
                  Failover 실행
                </>
              )}
            </button>

            {!API_KEY && (
              <p className="api-key-warning">
                API 키가 설정되지 않았습니다. 빌드 시 VITE_FAILOVER_API_KEY 환경변수가 필요합니다.
              </p>
            )}
          </div>

          {result && (
            <div className={`failover-result ${status}`}>
              <h4>실행 결과</h4>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="logs-header">
          <h2 className="section-title">실행 로그</h2>
          <button className="clear-logs-btn" onClick={clearLogs}>
            로그 지우기
          </button>
        </div>
        <div className="failover-logs">
          {logs.length === 0 ? (
            <p className="no-logs">로그가 없습니다.</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={`log-entry ${log.type}`}>
                <span className="log-time">[{log.timestamp}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <style>{`
        .failover-container {
          background: #1e1e2e;
          border-radius: 12px;
          padding: 24px;
        }

        .failover-warning {
          background: rgba(255, 193, 7, 0.1);
          border: 1px solid rgba(255, 193, 7, 0.3);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .failover-warning h3 {
          color: #ffc107;
          margin: 0 0 12px 0;
          font-size: 16px;
        }

        .failover-warning ul {
          margin: 0;
          padding-left: 20px;
          color: #ccc;
        }

        .failover-warning li {
          margin-bottom: 8px;
        }

        .failover-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .failover-button {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 48px;
          font-size: 18px;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          background: linear-gradient(135deg, #dc3545, #c82333);
          color: white;
        }

        .failover-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(220, 53, 69, 0.4);
        }

        .failover-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .failover-button.loading {
          background: linear-gradient(135deg, #6c757d, #5a6268);
        }

        .failover-button.success {
          background: linear-gradient(135deg, #28a745, #218838);
        }

        .failover-button.error {
          background: linear-gradient(135deg, #dc3545, #c82333);
        }

        .button-icon {
          font-size: 24px;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .api-key-warning {
          color: #dc3545;
          font-size: 14px;
          text-align: center;
        }

        .failover-result {
          margin-top: 24px;
          padding: 16px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.3);
        }

        .failover-result.success {
          border: 1px solid rgba(40, 167, 69, 0.5);
        }

        .failover-result.error {
          border: 1px solid rgba(220, 53, 69, 0.5);
        }

        .failover-result h4 {
          margin: 0 0 12px 0;
          color: #fff;
        }

        .failover-result pre {
          margin: 0;
          padding: 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
          overflow-x: auto;
          color: #aaa;
          font-size: 13px;
        }

        .logs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .logs-header .section-title {
          margin: 0;
        }

        .clear-logs-btn {
          padding: 8px 16px;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: #ccc;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .clear-logs-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .failover-logs {
          background: #1e1e2e;
          border-radius: 8px;
          padding: 16px;
          max-height: 300px;
          overflow-y: auto;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 13px;
        }

        .no-logs {
          color: #666;
          text-align: center;
          margin: 0;
        }

        .log-entry {
          padding: 6px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .log-entry:last-child {
          border-bottom: none;
        }

        .log-time {
          color: #666;
          margin-right: 12px;
        }

        .log-entry.info .log-message {
          color: #17a2b8;
        }

        .log-entry.success .log-message {
          color: #28a745;
        }

        .log-entry.error .log-message {
          color: #dc3545;
        }

        .log-entry.warn .log-message {
          color: #ffc107;
        }
      `}</style>
    </div>
  )
}
