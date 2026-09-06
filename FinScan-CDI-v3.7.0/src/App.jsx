import React, { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Toast from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import { useStore } from './store/useStore'
import UploadPage from './pages/UploadPage'
import LiquidityPage from './pages/LiquidityPage'
import AnalystMemoPage from './pages/AnalystMemoPage'
import CorporateDecisionPage from './pages/CorporateDecisionPage'
import ScenarioSimulatorPage from './pages/ScenarioSimulatorPage'
import BenchmarkRadarPage from './pages/BenchmarkRadarPage'
import WatchlistPage from './pages/WatchlistPage'
import RiskTimelinePage from './pages/RiskTimelinePage'
import {
  OverviewPage,
  RatiosPage,
  FraudPage,
  TimeSeriesPage,
  StatementsPage,
  FullReportPage,
  ComparePage,
} from './pages/AnalysisPages'

const PAGES = {
  upload: <UploadPage />,
  compare: <ComparePage />,
  overview: <OverviewPage />,
  decision: <CorporateDecisionPage />,
  liquidity: <LiquidityPage />,
  statements: <StatementsPage />,
  ratios: <RatiosPage />,
  timeseries: <TimeSeriesPage />,
  fraud: <FraudPage />,
  fullreport: <FullReportPage />,
  aireport: <AnalystMemoPage />,
  scenario: <ScenarioSimulatorPage />,
  radar: <BenchmarkRadarPage />,
  watchlist: <WatchlistPage />,
  risktimeline: <RiskTimelinePage />,
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
        <main className={`main${presentationMode ? ' main-fullscreen' : ''}`}>
          <div hidden={activePage !== 'upload'}><UploadPage /></div>
          {activePage !== 'upload' && <ErrorBoundary key={activePage} onRecover={()=>useStore.getState().setActivePage('upload')}>{PAGES[activePage]}</ErrorBoundary>}
        </main>
        <Toast />
      </div>
    </div>
  )
}
