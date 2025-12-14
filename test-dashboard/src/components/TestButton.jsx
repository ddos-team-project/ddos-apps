import React from 'react'

export default function TestButton({ onClick, loading, children, variant = 'primary' }) {
  return (
    <button
      className={`test-button ${variant}`}
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <>
          <span className="spinner"></span>
          Testing...
        </>
      ) : (
        children
      )}
    </button>
  )
}
