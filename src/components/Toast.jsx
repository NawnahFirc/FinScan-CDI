import React from 'react'
import { useStore } from '../store/useStore'

const BORDER_COLORS = { info: '#185FA5', warn: '#BA7517', error: '#E24B4A', ok: '#1D9E75' }

export default function ToastContainer() {
  const toasts = useStore(s => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className="toast" style={{ borderLeft: `3px solid ${BORDER_COLORS[t.type] || BORDER_COLORS.info}` }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
