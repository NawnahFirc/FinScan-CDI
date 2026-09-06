// NaN propagates unavailable inputs through arithmetic; format at the UI boundary.
export const numberOrNaN = value => Number.isFinite(value) ? value : NaN
export const divide = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : NaN
export const fixed = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a'
export const changePercent = (current, previous) => divide(numberOrNaN(current) - numberOrNaN(previous), Math.abs(numberOrNaN(previous))) * 100
