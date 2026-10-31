import { FILE_ICONS } from './constants'

export default function FileQueueCard({ clearQueue, parseAll, parseMsg, parsing, pendingCount, queue, removeFromQueue }) {
  return (
    <>
      {queue.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <div className="card-title">Files Queued ({queue.length})</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn sm primary" onClick={parseAll} disabled={parsing || !pendingCount}>
                {parsing ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} /> Parsing...
                  </>
                ) : (
                  `Parse ${pendingCount} File${pendingCount !== 1 ? 's' : ''} ->`
                )}
              </button>
              <button className="btn sm" onClick={clearQueue}>Clear</button>
            </div>
          </div>

          {queue.map((file) => (
            <div key={file.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, minWidth: 30, fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>
                {FILE_ICONS[file.ext] || 'DOC'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                  {(file.file.size / 1024).toFixed(1)} KB | {file.ext.toUpperCase()}
                  {file.error && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{file.error}</span>}
                </div>
              </div>
              <span className={`badge ${file.status === 'review' ? 'medium' : file.status === 'done' ? 'low' : file.status === 'error' ? 'high' : file.status === 'parsing' ? 'medium' : 'info'}`}>
                {file.status === 'parsing' ? 'Parsing...' : file.status === 'review' ? 'Review' : file.status === 'done' ? 'Done' : file.status === 'error' ? 'Error' : 'Pending'}
              </span>
              {file.status === 'pending' && <button className="btn sm" onClick={() => removeFromQueue(file.name)}>X</button>}
            </div>
          ))}

          {parseMsg && (
            <div style={{ padding: '8px 0', fontSize: 13, color: parsing ? 'var(--warn)' : 'var(--brand)', fontWeight: 500 }}>
              {parsing ? (
                <span className="thinking">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  {' '}
                  {parseMsg}
                </span>
              ) : parseMsg}
            </div>
          )}
        </div>
      )}
    </>
  )
}
