import React, { Suspense, lazy, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import WorkspaceChrome from './components/WorkspaceChrome'
import Toast from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import { useStore } from './store/useStore'
import UploadPage from './pages/UploadPage'

// Every view except Upload is loaded on first visit, so the initial bundle
// stays small and chart/report code only downloads when it is needed.
const PAGES = {
  compare: lazy(() => import('./pages/analysis/ComparePage').then((m) => ({ default: m.ComparePage }))),
  overview: lazy(() => import('./pages/analysis/OverviewPage').then((m) => ({ default: m.OverviewPage }))),
  decision: lazy(() => import('./pages/CorporateDecisionPage')),
  liquidity: lazy(() => import('./pages/LiquidityPage')),
  statements: lazy(() => import('./pages/analysis/StatementsPage').then((m) => ({ default: m.StatementsPage }))),
  ratios: lazy(() => import('./pages/analysis/RatiosPage').then((m) => ({ default: m.RatiosPage }))),
  timeseries: lazy(() => import('./pages/analysis/TimeSeriesPage').then((m) => ({ default: m.TimeSeriesPage }))),
  fraud: lazy(() => import('./pages/analysis/FraudPage').then((m) => ({ default: m.FraudPage }))),
  fullreport: lazy(() => import('./pages/analysis/FullReportPage').then((m) => ({ default: m.FullReportPage }))),
  aireport: lazy(() => import('./pages/AnalystMemoPage')),
  scenario: lazy(() => import('./pages/ScenarioSimulatorPage')),
  radar: lazy(() => import('./pages/BenchmarkRadarPage')),
  watchlist: lazy(() => import('./pages/WatchlistPage')),
  risktimeline: lazy(() => import('./pages/RiskTimelinePage')),
}

function PageLoading() {
  return <div className="card" role="status" aria-live="polite">Loading view…</div>
}

export default function App() {
  const activePage = useStore((state) => state.activePage)
  const theme = useStore((state) => state.theme)
  const presentationMode = useStore((state) => state.presentationMode)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  return (
    <div className="app-shell">
      <div className="layout">
        {!presentationMode && <Sidebar />}
        <main id="workspace" className={`main${presentationMode ? ' main-fullscreen' : ''}`}>
          {!presentationMode && <WorkspaceChrome />}
          <div hidden={activePage !== 'upload'}><UploadPage /></div>
          {activePage !== 'upload' && <ErrorBoundary key={activePage} onRecover={()=>useStore.getState().setActivePage('upload')}><ActivePage page={activePage} /></ErrorBoundary>}
        </main>
        <Toast />
      </div>
    </div>
  )
}

function ActivePage({ page }) {
  const Page = PAGES[page]
  if (!Page) return null
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  )
}
