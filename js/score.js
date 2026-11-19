// Scoring: each category returns { score: 0-100 | null, details: [strings] }.

/** Energy-weighted: one M7 counts far more than many M4.5s. */
export function scoreEarthquakes(quakes) {
  if (!quakes.length) return { score: 0, details: ['No M4.5+ earthquakes within 250 km since 1990'] };
  const energy = quakes.reduce((sum, q) => sum + 10 ** (q.mag - 4.5), 0);
  const score = Math.min(100, Math.round(Math.log10(1 + energy) * 25));
  const top = quakes.slice(0, 3).map(q => `M${q.mag.toFixed(1)}: ${q.place} (${q.year})`);
  return { score, details: [`${quakes.length} earthquakes M4.5+ since 1990`, ...top] };
}

export function scoreWildlife(data, state) {
  const entry = state && data[state];
  if (!entry) return { score: null, details: ['No wildlife data for this area yet'] };
  return { score: entry.score, details: entry.threats };
}

/** Violent crime rate per 100k: ~100 scores low, ~800 scores high. */
export function scoreCrime(data, state) {
  const rate = state && data[state];
  if (!rate) return { score: null, details: ['No crime data for this area yet (US states only)'] };
  const score = Math.min(100, Math.round((rate / 800) * 100));
  const pct = Math.round(Math.abs(rate / data.US - 1) * 100);
  const vs = `${pct}% ${rate >= data.US ? 'above' : 'below'} the US average (${data.US})`;
  return { score, details: [`~${rate} violent crimes per 100k residents (state)`, vs, 'Varies a lot by city and neighborhood'] };
}

/** Average of the categories that have data. */
export function overall(categories) {
  const scores = categories.map(c => c.score).filter(s => s != null);
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

export function color(score) {
  if (score == null) return 'var(--muted)';
  return score < 34 ? 'var(--low)' : score < 67 ? 'var(--mid)' : 'var(--high)';
}
