import { create } from 'zustand'
import { normalizeCompanyData } from '../lib/companyData'

const WORKSPACE_KEY = 'finscan-workspace-v3.6'
const STATEMENT_CACHE_KEY = 'finscan-statement-cache-v3.6'
const BACKEND_URL_KEY = 'finscan-backend-url-v3.6'
const MAX_CACHED_STATEMENTS = 30

function readStoredValue(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function readStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function persistValue(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function companyKey(company) {
  return `${company?.company || ''}::${company?._filename || ''}`
}

function statementPeriod(company) {
  const years = Array.isArray(company?.years) ? company.years : []
  return company?.period || years[years.length - 1] || ''
}

function statementCacheId(company) {
  return `${companyKey(company)}::${statementPeriod(company)}`
}

function readStatementCache() {
  const cache = readStoredJson(STATEMENT_CACHE_KEY, [])
  return Array.isArray(cache)
    ? cache.filter((entry) => entry?.data).slice(0, MAX_CACHED_STATEMENTS)
    : []
}

function writeStatementCache(entries) {
  if (typeof window === 'undefined') return entries
  const limited = entries.slice(0, MAX_CACHED_STATEMENTS)
  try {
    window.localStorage.setItem(STATEMENT_CACHE_KEY, JSON.stringify(limited))
  } catch {
    // Ignore storage failures and keep the app usable.
  }
  return limited
}

function cacheCompanies(companies, reason = 'reviewed') {
  if (typeof window === 'undefined') return []
  const now = new Date().toISOString()
  const entriesById = new Map(readStatementCache().map((entry) => [entry.id, entry]))

  companies.filter(Boolean).forEach((company) => {
    const id = statementCacheId(company)
    if (!id.replace(/:/g, '').trim()) return
    const previous = entriesById.get(id)
    entriesById.set(id, {
      ...previous,
      id,
      company: company.company || previous?.company || 'Unknown Company',
      filename: company._filename || previous?.filename || '',
      period: statementPeriod(company),
      currency: company.displayCurrency || company.currency || company.originalCurrency || 'UNKNOWN',
      firstCachedAt: previous?.firstCachedAt || now,
      cachedAt: now,
      reason,
      data: company,
    })
  })

  return writeStatementCache(
    [...entriesById.values()].sort((a, b) => new Date(b.cachedAt) - new Date(a.cachedAt))
  )
}

function removeCachedStatementEntry(id) {
  return writeStatementCache(readStatementCache().filter((entry) => entry.id !== id))
}

function clearCachedStatementEntries() {
  return writeStatementCache([])
}

function readWorkspace() {
  const workspace = readStoredJson(WORKSPACE_KEY, { companies: [], activeCompanyKey: '' })
  if (Array.isArray(workspace.companies) && workspace.companies.length) {
    cacheCompanies(workspace.companies, 'startup-archive')
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(WORKSPACE_KEY)
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }

  // The active workspace is intentionally session-only so a fresh app start never
  // analyzes a previous ingestion without the user restoring it.
  return { companies: [], activeCompany: null }
}

function persistWorkspace(companies) {
  return companies?.length ? cacheCompanies(companies, 'reviewed') : readStatementCache()
}

const initialWorkspace = readWorkspace()
const initialCache = readStatementCache()

export const useStore = create((set) => ({
  companies: initialWorkspace.companies,
  activeCompany: initialWorkspace.activeCompany,
  cachedStatements: initialCache,

  standard: 'international',
  backendUrl: readStoredValue(BACKEND_URL_KEY, ''),
  theme: readStoredValue('finscan-theme-v3.6', 'dark'),
  parseMode: readStoredValue('finscan-parse-mode-v3.6', 'resilient'),
  reportLanguage: readStoredValue('finscan-report-language-v3.6', 'english'),

  activePage: 'upload',
  toasts: [],

  watchlist: readStoredJson('finscan-watchlist', []),
  explainMode: readStoredValue('finscan-explain-mode', 'analyst'),
  presentationMode: false,

  setStandard: (standard) => set({ standard }),
  setBackendUrl: (backendUrl) => {
    persistValue(BACKEND_URL_KEY, backendUrl)
    set({ backendUrl })
  },
  setTheme: (theme) => {
    persistValue('finscan-theme-v3.6', theme)
    set({ theme })
  },
  setParseMode: (parseMode) => {
    persistValue('finscan-parse-mode-v3.6', parseMode)
    set({ parseMode })
  },
  setReportLanguage: (reportLanguage) => {
    persistValue('finscan-report-language-v3.6', reportLanguage)
    set({ reportLanguage })
  },
  setActivePage: (activePage) => set({ activePage }),

  setExplainMode: (mode) => {
    persistValue('finscan-explain-mode', mode)
    set({ explainMode: mode })
  },
  setPresentationMode: (v) => set({ presentationMode: v }),

  addToWatchlist: (key) => {
    set((state) => {
      if (state.watchlist.includes(key)) return state
      const updated = [...state.watchlist, key]
      persistValue('finscan-watchlist', JSON.stringify(updated))
      return { watchlist: updated }
    })
  },
  removeFromWatchlist: (key) => {
    set((state) => {
      const updated = state.watchlist.filter(k => k !== key)
      persistValue('finscan-watchlist', JSON.stringify(updated))
      return { watchlist: updated }
    })
  },
  toggleWatchlist: (key) => {
    set((state) => {
      const inList = state.watchlist.includes(key)
      const updated = inList ? state.watchlist.filter(k => k !== key) : [...state.watchlist, key]
      persistValue('finscan-watchlist', JSON.stringify(updated))
      return { watchlist: updated }
    })
  },

  addOrUpdateCompany: (data) => {
    const processed = normalizeCompanyData(data)
    set((state) => {
      const idx = state.companies.findIndex(
        (company) => company.company === processed.company && company._filename === processed._filename
      )
      const updated = [...state.companies]
      if (idx >= 0) updated[idx] = processed
      else updated.push(processed)
      const cachedStatements = persistWorkspace([processed])
      return { companies: updated, activeCompany: processed, cachedStatements }
    })
  },

  setActiveCompany: (activeCompany) => {
    set({ activeCompany })
  },

  updateActiveCompanyMeta: (patch) => {
    set((state) => {
      if (!state.activeCompany) return state
      const updatedActive = { ...state.activeCompany, ...patch }
      const updatedCompanies = state.companies.map((company) => {
        const sameCompany =
          company.company === state.activeCompany.company &&
          company._filename === state.activeCompany._filename
        return sameCompany ? { ...company, ...patch } : company
      })
      const cachedStatements = persistWorkspace([updatedActive])
      return { companies: updatedCompanies, activeCompany: updatedActive, cachedStatements }
    })
  },

  removeCompany: (filename, companyName) => {
    set((state) => {
      const updated = state.companies.filter(
        (company) => !(company._filename === filename && company.company === companyName)
      )
      const activeCompany = updated.length > 0 ? updated[updated.length - 1] : null
      return { companies: updated, activeCompany }
    })
  },

  clearAllCompanies: () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(WORKSPACE_KEY)
      } catch {
        // Ignore storage failures and keep the app usable.
      }
    }
    set({ companies: [], activeCompany: null })
  },

  restoreCachedStatement: (id) => {
    set((state) => {
      const entry = state.cachedStatements.find((item) => item.id === id)
      if (!entry?.data) return state
      const processed = normalizeCompanyData(entry.data)
      const idx = state.companies.findIndex(
        (company) => company.company === processed.company && company._filename === processed._filename
      )
      const updated = [...state.companies]
      if (idx >= 0) updated[idx] = processed
      else updated.push(processed)
      return { companies: updated, activeCompany: processed }
    })
  },

  removeCachedStatement: (id) => {
    set({ cachedStatements: removeCachedStatementEntry(id) })
  },

  clearCachedStatements: () => {
    set({ cachedStatements: clearCachedStatementEntries() })
  },

  addToast: (msg, type = 'info') => {
    const id = Date.now()
    set((state) => ({ toasts: [...state.toasts, { id, msg, type }] }))
    setTimeout(
      () => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
      3500
    )
  },
}))
