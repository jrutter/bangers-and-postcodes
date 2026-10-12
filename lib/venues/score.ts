/** Reviews pulled toward the city average. m is the strength of that prior. */
export const BAYES_PRIOR_REVIEWS = 200

export type RatedVenue = {
  venueId: string
  rating: number
  userRatingCount: number
}

export type ScoredVenue = RatedVenue & {
  weighted: number
  rank: number
}

export function bayesianScore(rating: number, votes: number, prior: number, m = BAYES_PRIOR_REVIEWS): number {
  const v = Math.max(0, votes)
  const weight = v + m
  return (v / weight) * rating + (m / weight) * prior
}

/** Unweighted mean of venues that have at least one review. */
export function cityPrior(rows: RatedVenue[]): number | null {
  if (rows.length === 0) return null
  const total = rows.reduce((sum, row) => sum + row.rating, 0)
  return total / rows.length
}

export function rankByBayesian<T extends RatedVenue>(
  rows: T[],
  m = BAYES_PRIOR_REVIEWS,
): { prior: number | null; rows: (T & { weighted: number; rank: number })[] } {
  const prior = cityPrior(rows)
  if (prior == null) return { prior: null, rows: [] }
  const scored = rows.map((row) => ({
    ...row,
    weighted: bayesianScore(row.rating, row.userRatingCount, prior, m),
  }))
  scored.sort((left, right) => {
    if (left.weighted !== right.weighted) return right.weighted - left.weighted
    if (left.userRatingCount !== right.userRatingCount) return right.userRatingCount - left.userRatingCount
    return left.venueId.localeCompare(right.venueId, "en")
  })
  return {
    prior,
    rows: scored.map((row, index) => ({ ...row, rank: index + 1 })),
  }
}
