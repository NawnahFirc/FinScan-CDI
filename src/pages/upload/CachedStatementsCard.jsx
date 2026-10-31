

export default function CachedStatementsCard({ cachedStatements, clearCached, forgetCached, restoreCached }) {
  return (
    <>
      {cachedStatements.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Cached Statements ({cachedStatements.length})</div>
              <div className="table-subnote">
                Cached statements are kept only for manual restore. A new app start opens with an empty analysis workspace.
              </div>
            </div>
            <button className="btn sm" onClick={clearCached}>Clear Cache</button>
          </div>

          {cachedStatements.slice(0, 6).map((entry) => (
            <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, minWidth: 36, fontFamily: 'DM Mono, monospace', color: 'var(--text2)' }}>
                CACHE
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{entry.company || 'Unknown Company'}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>
                  {entry.period || 'No period'} | {entry.currency || 'UNKNOWN'}{entry.filename ? ` | ${entry.filename}` : ''}
                </div>
              </div>
              <button className="btn sm primary" onClick={() => restoreCached(entry.id)}>Restore</button>
              <button className="btn sm" onClick={() => forgetCached(entry.id)}>Forget</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
