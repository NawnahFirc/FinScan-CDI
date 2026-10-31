import { REVIEW_FIELDS, REVIEW_SCALAR_FIELDS } from './constants'
import { SECTOR_OPTIONS } from '../../lib/companyData'
import { UNKNOWN_CURRENCY } from '../../lib/currency'

export default function ExtractionReviewCard({ acceptAllReviewItems, acceptReviewItem, analysisSector, currencyNeedsReview, discardReviewItem, openSource, reviewItems, setReviewMeta, setReviewNumber, setReviewScalarNumber, setReviewYear }) {
  return (
    <>
      {reviewItems.length > 0 && (
        <div className="card extraction-review-card">
          <div className="card-header">
            <div>
              <div className="card-title">Extraction Review ({reviewItems.length})</div>
              <div className="table-subnote">
                Confirm the detected figures before they become part of the analysis workspace.
              </div>
            </div>
            <button className="btn sm primary" onClick={acceptAllReviewItems}>
              Accept All Reviewed
            </button>
          </div>

          {reviewItems.map((item) => {
            const data = item.data
            const extraction = data._extraction || {}
            const years = data.years?.length ? data.years : [data.period || '2024']
            const confidence = extraction.confidence ?? 70
            const confidenceLevel = confidence >= 80 ? 'low' : confidence >= 55 ? 'medium' : 'high'

            return (
              <div key={item.id} className="review-item">
                <div className="review-head">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="table-subnote">
                      Matched {(extraction.matchedFields || []).length} fields from {extraction.sourceType || 'uploaded file'}.
                    </div>
                  </div>
                  <div className="review-actions">
                    <span className={`badge ${confidenceLevel}`}>{confidence}% confidence</span>
                    <button className="btn sm" onClick={() => openSource(item.file)}>View source</button>
                    <button className="btn sm" onClick={() => discardReviewItem(item.id)}>Discard</button>
                    <button className="btn sm primary" onClick={() => acceptReviewItem(item.id)}>Accept</button>
                  </div>
                </div>

                {extraction.warnings?.length > 0 && (
                  <div className="review-warning-list">
                    {extraction.warnings.map((warning) => (
                      <span key={warning} className="badge medium">{warning}</span>
                    ))}
                  </div>
                )}

                <div className="review-meta-grid">
                  <label>
                    Company
                    <input value={data.company || ''} onChange={(event) => setReviewMeta(item.id, 'company', event.target.value)} />
                  </label>
                  <label>
                    Currency
                    <input
                      list="currency-options"
                      value={data.currency === UNKNOWN_CURRENCY ? '' : (data.currency || '')}
                      placeholder="e.g. MAD"
                      onChange={(event) => setReviewMeta(item.id, 'currency', event.target.value)}
                    />
                    {currencyNeedsReview(data) && (
                      <span className="table-subnote" style={{ color: 'var(--warn)' }}>
                        Confirm the source currency before accepting this file.
                      </span>
                    )}
                  </label>
                  <label>
                    Latest Period
                    <input value={data.period || years[years.length - 1] || ''} onChange={(event) => setReviewMeta(item.id, 'period', event.target.value)} />
                  </label>
                  <label>
                    Sector
                    <select value={data.sector || analysisSector} onChange={(event) => setReviewMeta(item.id, 'sector', event.target.value)}>
                      {SECTOR_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="review-table-wrap">
                  <table className="dt review-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        {years.map((year, index) => (
                          <th key={`${item.id}-year-${index}`}>
                            <input
                              className="review-year-input"
                              value={year}
                              onChange={(event) => setReviewYear(item.id, index, event.target.value)}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {REVIEW_FIELDS.map(([field, label]) => {
                        const values = Array.isArray(data[field]) ? data[field] : [data[field] ?? null]
                        const fieldMeta = extraction.fields?.[field]
                        return (
                          <tr key={field}>
                            <td>
                              <strong>{label}</strong>
                              {fieldMeta?.status && (
                                <span className={`badge ${fieldMeta.status === 'missing' ? 'high' : fieldMeta.status === 'derived' ? 'medium' : 'low'}`} style={{ marginLeft: 8 }}>
                                  {fieldMeta.status}
                                </span>
                              )}
                              {(fieldMeta?.evidence?.[0] || extraction.sources?.[field]) && (
                                <div className="table-subnote">
                                  Source: {fieldMeta?.evidence?.[0]?.page ? `p.${fieldMeta.evidence[0].page} - ` : ''}
                                  {fieldMeta?.evidence?.[0]?.cell ? `${fieldMeta.evidence[0].sheet || 'Sheet'} ${fieldMeta.evidence[0].cell} - ` : ''}
                                  {fieldMeta?.formula || fieldMeta?.evidence?.[0]?.label || extraction.sources[field]?.label}
                                </div>
                              )}
                            </td>
                            {years.map((year, index) => (
                              <td key={`${field}-${year}`} className="num">
                                <input
                                  className="review-number-input"
                                  type="number" step="any"
                                  value={fieldMeta?.status === 'missing' && !values[index] ? '' : (values[index] ?? '')}
                                  onChange={(event) => setReviewNumber(item.id, field, index, event.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="review-scalar-grid">
                  {REVIEW_SCALAR_FIELDS.map(([field, label]) => {
                    const fieldMeta = extraction.fields?.[field]
                    const value = data[field]
                    return (
                      <label key={field}>
                        {label}
                        <input
                          type="number" step="any"
                          value={fieldMeta?.status === 'missing' && !value ? '' : (value ?? '')}
                          onChange={(event) => setReviewScalarNumber(item.id, field, event.target.value)}
                        />
                        {(fieldMeta?.status || fieldMeta?.evidence?.[0] || extraction.sources?.[field]) && (
                          <span className="table-subnote">
                            {fieldMeta?.status && `${fieldMeta.status} `}
                            {fieldMeta?.evidence?.[0]?.page ? `p.${fieldMeta.evidence[0].page} ` : ''}
                            {fieldMeta?.evidence?.[0]?.cell ? `${fieldMeta.evidence[0].sheet || 'Sheet'} ${fieldMeta.evidence[0].cell} ` : ''}
                            {fieldMeta?.formula || fieldMeta?.evidence?.[0]?.label || extraction.sources?.[field]?.label || ''}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
