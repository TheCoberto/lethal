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

/**
 * FEMA NRI composite score (national percentile, 0-100) for US counties,
 * plus the top hazards. Falls back to earthquakes alone outside the US.
 */
export function scoreDisasters(nri, hazardNames, quakes) {
  const quake = scoreEarthquakes(quakes);
  if (!nri || nri.RISK_SCORE == null) {
    return { score: quake.score, details: ['FEMA risk data is US-only; earthquakes only here', ...quake.details] };
  }
  const top = Object.entries(hazardNames)
    .map(([k, name]) => ({ name, score: nri[`${k}_RISKS`], rating: nri[`${k}_RISKR`] }))
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(h => `${h.name}: ${h.rating} (${Math.round(h.score)})`);
  return {
    score: Math.round(nri.RISK_SCORE),
    details: [`${nri.COUNTY} ${nri.COUNTYTYPE ?? 'County'} overall risk: ${nri.RISK_RATNG}`, ...top, quake.details[0]],
  };
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

/** Traffic deaths per 100k: ~5 scores low, 25+ scores 100. */
export function scoreRoads(data, state) {
  const rate = state && data[state];
  if (!rate) return { score: null, details: ['No traffic data for this area yet (US states only)'] };
  const score = Math.min(100, Math.round((rate / 25) * 100));
  const pct = Math.round(Math.abs(rate / data.US - 1) * 100);
  return { score, details: [
    `~${rate} traffic deaths per 100k residents per year (state)`,
    `${pct}% ${rate >= data.US ? 'above' : 'below'} the US average (${data.US})`,
  ] };
}

/** 30-day average US AQI: 0-50 good, 150+ unhealthy for everyone (scores 100). */
export function scoreEnvironment(air) {
  if (!air?.aqi.length) return { score: null, details: ['No air quality data for this area'] };
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const meanAqi = avg(air.aqi);
  const days = Math.round(air.aqi.filter(v => v > 100).length / 24);
  const label = meanAqi <= 50 ? 'Good' : meanAqi <= 100 ? 'Moderate' : meanAqi <= 150 ? 'Unhealthy for sensitive groups' : 'Unhealthy';
  return {
    score: Math.min(100, Math.round((meanAqi / 150) * 100)),
    details: [
      `30-day average AQI ${Math.round(meanAqi)} (${label})`,
      `Peak AQI ${Math.round(Math.max(...air.aqi))}; ~${days} day(s) of unhealthy air`,
      `Average PM2.5: ${avg(air.pm25).toFixed(1)} µg/m³ (WHO guideline: 5)`,
    ],
  };
}
