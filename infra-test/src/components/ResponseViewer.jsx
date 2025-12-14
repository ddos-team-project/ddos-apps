import React, { useState } from 'react'

function formatJson(obj, indent = 0) {
  if (obj === null) return <span className="json-null">null</span>
  if (typeof obj === 'boolean') return <span className="json-boolean">{obj.toString()}</span>
  if (typeof obj === 'number') return <span className="json-number">{obj}</span>
  if (typeof obj === 'string') return <span className="json-string">"{obj}"</span>

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'

    return (
      <>
        {'[\n'}
        {obj.map((item, i) => (
          <span key={i}>
            {'  '.repeat(indent + 1)}
            {formatJson(item, indent + 1)}
            {i < obj.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {'  '.repeat(indent)}]
      </>
    )
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj)

    if (keys.length === 0) return '{}'

    return (
      <>
        {'{\n'}
        {keys.map((key, i) => (
          <span key={key}>
            {'  '.repeat(indent + 1)}
            <span className="json-key">"{key}"</span>: {formatJson(obj[key], indent + 1)}
            {i < keys.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {'  '.repeat(indent)}{'}'}
      </>
    )
  }

  return String(obj)
}

export default function ResponseViewer({ data }) {
  const [isOpen, setIsOpen] = useState(true)

  if (!data) {
    return (
      <div className="response-viewer">
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div>테스트 버튼을 클릭하면 응답이 여기에 표시됩니다</div>
        </div>
      </div>
    )
  }

  return (
    <div className="response-viewer">
      <div className="response-header" onClick={() => setIsOpen(!isOpen)}>
        <h4>Response JSON</h4>
        <span className={`toggle-icon ${isOpen ? 'open' : ''}`}>▼</span>
      </div>
      {isOpen && (
        <div className="response-body">
          <pre>{formatJson(data)}</pre>
        </div>
      )}
    </div>
  )
}
