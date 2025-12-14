import React, { useState, useImperativeHandle, forwardRef } from 'react'
import { saveLog } from './TestLogger'
import { getApiUrl } from './api'


const NODE_STATUS = {
  idle: 'idle',
  active: 'active',
  success: 'success',
  error: 'error',
}

const ArchitectureDiagram = forwardRef(function ArchitectureDiagram({ compact = false }, ref) {
  const [nodeStatus, setNodeStatus] = useState({
    client: NODE_STATUS.idle,
    route53: NODE_STATUS.idle,
    seoulAlb: NODE_STATUS.idle,
    seoulEc2: NODE_STATUS.idle,
    seoulDb: NODE_STATUS.idle,
    tokyoAlb: NODE_STATUS.idle,
    tokyoEc2: NODE_STATUS.idle,
    tokyoDb: NODE_STATUS.idle,
    vpn: NODE_STATUS.idle,
    idc: NODE_STATUS.idle,
  })

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [latency, setLatency] = useState(null)

  // 외부에서 triggerFlow 함수 노출
  useImperativeHandle(ref, () => ({
    triggerFlow: async (region) => {
      resetNodes()
      await animateFlowQuick(region)
    }
  }))

  // 빠른 애니메이션 (RoutingTest 연동용)
  const animateFlowQuick = async (targetRegion) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

    setNodeStatus(prev => ({ ...prev, client: NODE_STATUS.active }))
    await delay(50)
    setNodeStatus(prev => ({ ...prev, client: NODE_STATUS.success, route53: NODE_STATUS.active }))
    await delay(50)

    if (targetRegion === 'seoul' || targetRegion?.includes('northeast-2')) {
      setNodeStatus(prev => ({ ...prev, route53: NODE_STATUS.success, seoulAlb: NODE_STATUS.active }))
      await delay(50)
      setNodeStatus(prev => ({ ...prev, seoulAlb: NODE_STATUS.success, seoulEc2: NODE_STATUS.active }))
      await delay(50)
      setNodeStatus(prev => ({ ...prev, seoulEc2: NODE_STATUS.success }))
    } else if (targetRegion === 'tokyo' || targetRegion?.includes('northeast-1')) {
      setNodeStatus(prev => ({ ...prev, route53: NODE_STATUS.success, tokyoAlb: NODE_STATUS.active }))
      await delay(50)
      setNodeStatus(prev => ({ ...prev, tokyoAlb: NODE_STATUS.success, tokyoEc2: NODE_STATUS.active }))
      await delay(50)
      setNodeStatus(prev => ({ ...prev, tokyoEc2: NODE_STATUS.success }))
    }
  }

  const resetNodes = () => {
    setNodeStatus({
      client: NODE_STATUS.idle,
      route53: NODE_STATUS.idle,
      seoulAlb: NODE_STATUS.idle,
      seoulEc2: NODE_STATUS.idle,
      seoulDb: NODE_STATUS.idle,
      tokyoAlb: NODE_STATUS.idle,
      tokyoEc2: NODE_STATUS.idle,
      tokyoDb: NODE_STATUS.idle,
      vpn: NODE_STATUS.idle,
      idc: NODE_STATUS.idle,
    })
  }

  const animateFlow = async (targetRegion, includeDb = false, includeIdc = false) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

    setNodeStatus(prev => ({ ...prev, client: NODE_STATUS.active }))
    await delay(200)

    setNodeStatus(prev => ({ ...prev, client: NODE_STATUS.success, route53: NODE_STATUS.active }))
    await delay(200)

    if (targetRegion === 'seoul' || targetRegion?.includes('northeast-2')) {
      setNodeStatus(prev => ({ ...prev, route53: NODE_STATUS.success, seoulAlb: NODE_STATUS.active }))
      await delay(200)

      setNodeStatus(prev => ({ ...prev, seoulAlb: NODE_STATUS.success, seoulEc2: NODE_STATUS.active }))
      await delay(200)

      if (includeDb) {
        setNodeStatus(prev => ({ ...prev, seoulEc2: NODE_STATUS.success, seoulDb: NODE_STATUS.active }))
        await delay(200)
        setNodeStatus(prev => ({ ...prev, seoulDb: NODE_STATUS.success }))
      } else {
        setNodeStatus(prev => ({ ...prev, seoulEc2: NODE_STATUS.success }))
      }

      if (includeIdc) {
        setNodeStatus(prev => ({ ...prev, vpn: NODE_STATUS.active }))
        await delay(300)
        setNodeStatus(prev => ({ ...prev, vpn: NODE_STATUS.success, idc: NODE_STATUS.active }))
        await delay(200)
        setNodeStatus(prev => ({ ...prev, idc: NODE_STATUS.success }))
      }
    } else {
      setNodeStatus(prev => ({ ...prev, route53: NODE_STATUS.success, tokyoAlb: NODE_STATUS.active }))
      await delay(200)

      setNodeStatus(prev => ({ ...prev, tokyoAlb: NODE_STATUS.success, tokyoEc2: NODE_STATUS.active }))
      await delay(200)

      if (includeDb) {
        setNodeStatus(prev => ({ ...prev, tokyoEc2: NODE_STATUS.success, tokyoDb: NODE_STATUS.active }))
        await delay(200)
        setNodeStatus(prev => ({ ...prev, tokyoDb: NODE_STATUS.success }))
      } else {
        setNodeStatus(prev => ({ ...prev, tokyoEc2: NODE_STATUS.success }))
      }

      if (includeIdc) {
        setNodeStatus(prev => ({ ...prev, vpn: NODE_STATUS.active }))
        await delay(300)
        setNodeStatus(prev => ({ ...prev, vpn: NODE_STATUS.success, idc: NODE_STATUS.active }))
        await delay(200)
        setNodeStatus(prev => ({ ...prev, idc: NODE_STATUS.success }))
      }
    }
  }

  const runTest = async (endpoint) => {
    resetNodes()
    setLoading(true)
    setResult(null)

    const start = performance.now()

    try {
      const response = await fetch(`${getApiUrl()}/${endpoint}`)
      const data = await response.json()

      const elapsed = Math.round(performance.now() - start)

      setLatency(elapsed)
      setResult(data)

      console.log(`[ARCHITECTURE] ${endpoint.toUpperCase()} Response:`, data)

      const region = data.location?.region || data.sourceLocation?.region || ''
      const includeDb = endpoint === 'health' && data.db
      const includeIdc = endpoint === 'idc-health'

      saveLog({
        type: endpoint.toUpperCase(),
        status: data.status || 'ok',
        region: region,
        az: data.location?.az || data.sourceLocation?.az || '-',
        instanceId: data.location?.instanceId || data.sourceLocation?.instanceId || '-',
        latency: elapsed,
        details: includeDb ? `DB: ${data.db?.status}` : includeIdc ? `IDC: ${data.idc?.status}` : null,
      })

      await animateFlow(region, includeDb, includeIdc)
    } catch (error) {
      console.error(`[ARCHITECTURE] ${endpoint.toUpperCase()} Error:`, error)

      saveLog({
        type: endpoint.toUpperCase(),
        status: 'error',
        region: '-',
        az: '-',
        latency: Math.round(performance.now() - start),
        details: error.message,
      })

      setResult({ error: error.message, status: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const getNodeClass = (status) => {
    switch (status) {
      case NODE_STATUS.active: return 'node active'
      case NODE_STATUS.success: return 'node success'
      case NODE_STATUS.error: return 'node error'
      default: return 'node'
    }
  }

  const getRegionFromResult = () => {
    if (!result) return null

    const region = result.location?.region || result.sourceLocation?.region

    if (region?.includes('northeast-2') || region === 'seoul') return 'SEOUL'
    if (region?.includes('northeast-1') || region === 'tokyo') return 'TOKYO'

    return region?.toUpperCase() || 'UNKNOWN'
  }

  return (
    <div className={`architecture-diagram ${compact ? 'compact' : ''}`}>
      <div className="diagram-header">
        <h3>Infrastructure Flow</h3>
        {!compact && (
          <div className="diagram-controls">
            <button onClick={() => runTest('ping')} disabled={loading}>
              {loading ? 'Testing...' : 'Ping Test'}
            </button>
            <button onClick={() => runTest('health')} disabled={loading}>
              Health Test
            </button>
            <button onClick={() => runTest('idc-health')} disabled={loading}>
              IDC Test
            </button>
          </div>
        )}
      </div>

      <div className="diagram-container">
        <div className="diagram-row">
          <div className={getNodeClass(nodeStatus.client)}>
            <div className="node-icon">👤</div>
            <div className="node-label">Client</div>
          </div>

          <div className="arrow">→</div>

          <div className={getNodeClass(nodeStatus.route53)}>
            <div className="node-icon">🌐</div>
            <div className="node-label">Route53</div>
            <div className="node-detail">DNS</div>
          </div>

          <div className="arrow-split">
            <span>↗</span>
            <span>↘</span>
          </div>

          <div className="region-column">
            <div className="region-box seoul">
              <div className="region-header">🇰🇷 Seoul (80%)</div>
              <div className="region-nodes">
                <div className={getNodeClass(nodeStatus.seoulAlb)}>
                  <div className="node-label">ALB</div>
                </div>
                <div className="arrow-small">→</div>
                <div className={getNodeClass(nodeStatus.seoulEc2)}>
                  <div className="node-label">EC2</div>
                </div>
                <div className="arrow-small">→</div>
                <div className={getNodeClass(nodeStatus.seoulDb)}>
                  <div className="node-label">Aurora</div>
                </div>
              </div>
            </div>

            <div className="region-box tokyo">
              <div className="region-header">🇯🇵 Tokyo (20%)</div>
              <div className="region-nodes">
                <div className={getNodeClass(nodeStatus.tokyoAlb)}>
                  <div className="node-label">ALB</div>
                </div>
                <div className="arrow-small">→</div>
                <div className={getNodeClass(nodeStatus.tokyoEc2)}>
                  <div className="node-label">EC2</div>
                </div>
                <div className="arrow-small">→</div>
                <div className={getNodeClass(nodeStatus.tokyoDb)}>
                  <div className="node-label">Reader</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!compact && (
          <div className="diagram-row idc-row">
            <div className="idc-connection">
              <div className={getNodeClass(nodeStatus.vpn)}>
                <div className="node-icon">🔒</div>
                <div className="node-label">VPN</div>
              </div>
              <div className="arrow">→</div>
              <div className={getNodeClass(nodeStatus.idc)}>
                <div className="node-icon">🏢</div>
                <div className="node-label">IDC</div>
                <div className="node-detail">192.168.0.10</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {!compact && result && (
        <div className="diagram-result">
          <div className="result-item">
            <span className="result-label">Routed to:</span>
            <span className="result-value">{getRegionFromResult()}</span>
          </div>
          <div className="result-item">
            <span className="result-label">Latency:</span>
            <span className="result-value">{latency}ms</span>
          </div>
          {(result.location?.instanceId || result.sourceLocation?.instanceId) && (
            <div className="result-item">
              <span className="result-label">Instance:</span>
              <span className="result-value instance-info">
                {(result.location?.instanceId || result.sourceLocation?.instanceId)?.slice(-8)}
              </span>
            </div>
          )}
          <div className="result-item">
            <span className="result-label">Status:</span>
            <span className={`result-value ${result.status === 'ok' ? 'ok' : 'error'}`}>
              {result.status === 'ok' ? '✅ OK' : '❌ Error'}
            </span>
          </div>
          {result.db && (
            <div className="result-item">
              <span className="result-label">DB:</span>
              <span className={`result-value ${result.db.status === 'ok' ? 'ok' : 'error'}`}>
                {result.db.status === 'ok' ? '✅ Connected' : '❌ Error'}
              </span>
            </div>
          )}
          {result.idc && (
            <div className="result-item">
              <span className="result-label">IDC:</span>
              <span className={`result-value ${result.idc.status === 'ok' ? 'ok' : 'error'}`}>
                {result.idc.status === 'ok' ? '✅ Connected' : '❌ Error'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default ArchitectureDiagram
