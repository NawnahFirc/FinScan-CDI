import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

const NAV = [
  { section: 'Data' },
  { id: 'upload', label: 'Upload / Entry', always: true },
  { id: 'compare', label: 'Multi-Company', always: true },
  { id: 'watchlist', label: 'Watchlist', always: true },
  { section: 'Decision' },
  { id: 'decision', label: 'Decision Center' },
  { id: 'scenario', label: 'Scenario Simulator' },
  { section: 'Analysis' },
  { id: 'overview', label: 'Overview' },
  { id: 'radar', label: 'Benchmark Radar' },
  { id: 'risktimeline', label: 'Risk Timeline' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'ratios', label: 'Financial Ratios' },
  { id: 'timeseries', label: 'Year-over-Year' },
  { id: 'fraud', label: 'Fraud Signals' },
  { section: 'Reports' },
  { id: 'statements', label: 'Statements' },
  { id: 'fullreport', label: 'Full Report' },
  { id: 'aireport', label: 'Analyst Memo', badge: 'LOCAL' },
]

function NavGlyph({ id }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  switch (id) {
    case 'upload':
      return (
        <svg {...common}>
          <path d="M12 16V5" />
          <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
          <path d="M5 19h14" />
        </svg>
      )
    case 'compare':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="5" height="12" rx="1.5" />
          <rect x="10.5" y="9" width="5" height="9" rx="1.5" />
          <rect x="17" y="4" width="3" height="14" rx="1.2" />
        </svg>
      )
    case 'overview':
      return (
        <svg {...common}>
          <path d="M4 12 12 5l8 7" />
          <path d="M7 10.5V19h10v-8.5" />
        </svg>
      )
    case 'decision':
      return (
        <svg {...common}>
          <path d="M8 6.5h8" />
          <path d="M8 11h8" />
          <path d="M8 15.5h5" />
          <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
          <path d="m14 16 1.5 1.5 3-3.5" />
        </svg>
      )
    case 'liquidity':
      return (
        <svg {...common}>
          <path d="M12 4v16" />
          <path d="M16.5 7.5c0-1.7-1.9-3-4.5-3s-4.5 1.3-4.5 3 1.9 3 4.5 3 4.5 1.3 4.5 3-1.9 3-4.5 3-4.5-1.3-4.5-3" />
        </svg>
      )
    case 'statements':
      return (
        <svg {...common}>
          <path d="M7 4.5h7l3 3V19.5H7z" />
          <path d="M14 4.5v3h3" />
          <path d="M10 12h4" />
          <path d="M10 15.5h4" />
        </svg>
      )
    case 'ratios':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.5" />
          <circle cx="16" cy="16" r="2.5" />
          <path d="M18 6 6 18" />
        </svg>
      )
    case 'timeseries':
      return (
        <svg {...common}>
          <path d="M5 17 10 12l3 3 6-7" />
          <path d="M5 5v14h14" />
        </svg>
      )
    case 'fraud':
      return (
        <svg {...common}>
          <path d="M12 4 5 7v5c0 4.2 2.7 6.9 7 8 4.3-1.1 7-3.8 7-8V7z" />
          <path d="M9.5 12.5 11 14l3.5-4" />
        </svg>
      )
    case 'fullreport':
      return (
        <svg {...common}>
          <path d="M7 4.5h7l3 3V19.5H7z" />
          <path d="M14 4.5v3h3" />
          <path d="M9.5 9H12.5" />
          <path d="M9.5 12H15" />
          <path d="M9.5 15.5H15" />
        </svg>
      )
    case 'aireport':
      return (
        <svg {...common}>
          <path d="M12 4.5 14.3 9l4.7.7-3.4 3.4.8 4.8-4.4-2.3-4.4 2.3.8-4.8L5 9.7 9.7 9z" />
        </svg>
      )
    case 'scenario':
      return (
        <svg {...common}>
          <path d="M3 18h4v-7H3zM9 18h4V7H9zM15 18h4V3h-4z" />
          <path d="M3 9l4-3 4 2 4-5" strokeDasharray="2 1.5" />
        </svg>
      )
    case 'radar':
      return (
        <svg {...common}>
          <polygon points="12,3 20,8 20,16 12,21 4,16 4,8" />
          <polygon points="12,7 17,10 17,14 12,17 7,14 7,10" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'watchlist':
      return (
        <svg {...common}>
          <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.5l-4.8 2.4.9-5.4L4.2 7.7l5.4-.8z" />
        </svg>
      )
    case 'risktimeline':
      return (
        <svg {...common}>
          <path d="M3 12h3l3-7 4 14 3-7h5" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      )
  }
}

export default function Sidebar() {
  const {
    activePage,
    setActivePage,
    activeCompany,
    backendUrl,
    setBackendUrl,
    theme,
    setTheme,
  } = useStore()
  const [urlVal, setUrlVal] = useState(backendUrl)
  const [apiHealth, setApiHealth] = useState({ status: 'checking', label: 'Checking backend...' })
  const hasData = !!activeCompany

  function handleNav(id) {
    if (!hasData && !['upload', 'compare'].includes(id)) return
    setActivePage(id)
  }

  function handleUrl(event) {
    const nextValue = event.target.value
    setUrlVal(nextValue)
    setBackendUrl(nextValue.trim().replace(/\/$/, ''))
  }

  const urlOk = !urlVal.trim() || /^https?:\/\//i.test(urlVal)

  useEffect(() => {
    if (!urlOk) {
      setApiHealth({ status: 'bad', label: 'Invalid URL' })
      return undefined
    }

    const controller = new AbortController()
    setApiHealth({ status: 'checking', label: 'Checking backend...' })

    fetch(`${(urlVal || import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((payload) => {
        const aiReady = payload.aiAnalystConfigured
        setApiHealth({
          status: aiReady ? 'ok' : 'warn',
          label: aiReady ? 'Online - AI analyst ready' : 'Online - local parser ready',
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setApiHealth({ status: 'bad', label: 'Backend unreachable' })
        }
      })

    return () => controller.abort()
  }, [urlOk, urlVal])

  return (
    <aside className="sidebar">
      <div className="logo">
        <h1>
          FinScan <span>CDI</span>
        </h1>
        <p>Corporate Decision Intelligence</p>
        <span className="version-badge">v3.7</span>
      </div>

      <nav className="nav">
        {NAV.map((item, index) => {
          if (item.section) return <div key={index} className="nav-section">{item.section}</div>
          const disabled = !hasData && !item.always
          const active = activePage === item.id

          return (
            <button
              key={item.id}
              className={`nav-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
              onClick={() => handleNav(item.id)}
            >
              <span className="icon"><NavGlyph id={item.id} /></span>
              <span className="nav-label">{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="theme-toggle">
          <span className="api-label">Interface Theme</span>
          <div className="theme-toggle-row">
            <button
              type="button"
              className={`theme-toggle-btn${theme === 'dark' ? ' active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              type="button"
              className={`theme-toggle-btn${theme === 'light' ? ' active' : ''}`}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
        </div>

        <span className="api-label">Backend URL</span>
        <input
          type="text"
          value={urlVal}
          onChange={handleUrl}
          placeholder="Same origin (default)"
        />
        <div className={`api-status ${apiHealth.status}`}>
          {apiHealth.label}
        </div>
      </div>
    </aside>
  )
}
