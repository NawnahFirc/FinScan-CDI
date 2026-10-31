import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { NAV, NavGlyph } from './Sidebar'
import { APP_VERSION } from '../lib/version'

export default function WorkspaceChrome() {
  const { activePage, setActivePage, activeCompany, companies, setActiveCompany, theme, setTheme, backendUrl, setBackendUrl } = useStore()
  const dialog = useRef(null)
  const [query, setQuery] = useState('')
  const routes = NAV.filter(item => item.id)
  function openNavigation() { setQuery(''); dialog.current?.showModal() }
  function navigate(id) { setActivePage(id); dialog.current?.close(); window.scrollTo({ top: 0, behavior: 'instant' }) }
  useEffect(() => {
    function keydown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (dialog.current?.open) dialog.current.close()
        else openNavigation()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])
  const selected = companies.indexOf(activeCompany)
  return <>
    <a className="skip-link" href="#page-content">Skip to content</a>
    <header className="workspace-topbar">
      <div className="workspace-identity"><span className="brand-slash" aria-hidden="true">/</span><strong>FinScan <span>CDI</span></strong><span className="release-pill">v{APP_VERSION}</span></div>
      <div className="workspace-tools">
        <button className="command-trigger" onClick={openNavigation} aria-label="Search views"><span>Search views</span><kbd>⌘ / Ctrl K</kbd></button>
        <button className="theme-control" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
      </div>
    </header>
    <div className="workspace-context" id="page-content" tabIndex={-1}>
      <span>Workspace <span aria-hidden="true">/</span> <strong>{routes.find(item => item.id === activePage)?.label}</strong></span>
      {companies.length > 0 && <select aria-label="Active company" value={selected < 0 ? '' : selected} onChange={event => setActiveCompany(companies[Number(event.target.value)])}>{selected < 0 && <option value="" disabled>Select company</option>}{companies.map((company, index) => <option value={index} key={`${company.company}-${index}`}>{company.company}</option>)}</select>}
    </div>
    <nav className="mobile-dock" aria-label="Mobile navigation">
      {[['upload', 'Import'], ['decision', 'Decision'], ['overview', 'Overview']].map(([id, label]) => <button key={id} disabled={id !== 'upload' && !activeCompany} aria-current={activePage === id ? 'page' : undefined} onClick={() => navigate(id)}><NavGlyph id={id}/><span>{label}</span></button>)}
      <button onClick={openNavigation}><NavGlyph id="compare"/><span>All views</span></button>
    </nav>
    <dialog ref={dialog} className="view-dialog" aria-labelledby="view-dialog-title" onClick={event => { if (event.target === event.currentTarget) dialog.current.close() }}>
      <div className="view-dialog-header"><h2 id="view-dialog-title">Go to a view</h2><button className="btn" onClick={() => dialog.current.close()} aria-label="Close navigation">Close</button></div>
      <input autoFocus aria-label="Filter views" placeholder="Search analysis, reports, scenarios…" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="view-results">{routes.filter(item => item.label.toLowerCase().includes(query.toLowerCase())).map(item => <button key={item.id} disabled={!item.always && !activeCompany} onClick={() => navigate(item.id)} aria-current={activePage === item.id ? 'page' : undefined}><NavGlyph id={item.id}/><span>{item.label}</span><small>{!item.always && !activeCompany ? 'Add company first' : '↗'}</small></button>)}
        {!routes.some(item => item.label.toLowerCase().includes(query.toLowerCase())) && <p className="empty">No views match “{query}”.</p>}
      </div>
      <details className="connection-settings"><summary>Connection settings</summary><label htmlFor="mobile-backend">Backend URL</label><input id="mobile-backend" type="url" placeholder="Same origin (default)" defaultValue={backendUrl} onBlur={event => setBackendUrl(event.target.value.trim().replace(/\/$/, ''))} /></details>
      <div className="dialog-footnote">FinScan CDI <strong>v{APP_VERSION}</strong></div>
    </dialog>
  </>
}
