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
function vsUS(rate, us) {
  const pct = Math.round(Math.abs(rate / us - 1) * 100);
  return `${pct}% ${rate >= us ? 'above' : 'below'} the US average (${us})`;
}

/**
 * County-first scorers. `counties` is data/counties.json ({ fips: [homicide, crash] } per 100k).
 * When the county value is missing (small counties are suppressed), fall back to the state
 * scorer and mark the result `estimated`.
 */
export function scoreCrimeAt(stateData, state, counties, fips) {
  const homicide = counties?.[fips]?.[0];
  if (homicide == null) {
    const s = scoreCrime(stateData, state);
    return s.score == null ? s : { ...s, estimated: true, details: [...s.details, 'No county homicide data here; using the state rate'] };
  }
  const details = [`${homicide} homicides per 100k residents per year (county)`, vsUS(homicide, counties.US[0])];
  if (stateData[state]) details.push(`State: ~${stateData[state]} violent crimes per 100k`);
  return { score: Math.min(100, Math.round((homicide / 20) * 100)), details };
}

export function scoreRoadsAt(stateData, state, counties, fips) {
  const crash = counties?.[fips]?.[1];
  if (crash == null) {
    const s = scoreRoads(stateData, state);
    return s.score == null ? s : { ...s, estimated: true, details: [...s.details, 'No county crash data here; using the state rate'] };
  }
  return {
    score: Math.min(100, Math.round((crash / 25) * 100)),
    details: [`${crash} traffic deaths per 100k residents per year (county)`, vsUS(crash, counties.US[1])],
  };
}

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

/**
 * Environment = weighted average of the parts that have data (air counts 2x, Superfund 1x):
 *  - air: 30-day average US AQI (0-50 good, 150+ unhealthy for everyone scores 100)
 *  - Superfund: each active site within 10 mi adds up to 25, more the closer it is
 * `sites` is null when unavailable (outside the US or the lookup failed).
 */
export function scoreEnvironment(air, sites) {
  const parts = [];
  const details = [];

  if (air?.aqi.length) {
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const meanAqi = avg(air.aqi);
    const days = Math.round(air.aqi.filter(v => v > 100).length / 24);
    const label = meanAqi <= 50 ? 'Good' : meanAqi <= 100 ? 'Moderate' : meanAqi <= 150 ? 'Unhealthy for sensitive groups' : 'Unhealthy';
    parts.push({ score: Math.min(100, (meanAqi / 150) * 100), weight: 2 });
    details.push(
      `30-day average AQI ${Math.round(meanAqi)} (${label})`,
      `Peak AQI ${Math.round(Math.max(...air.aqi))}; ~${days} day(s) of unhealthy air`,
      `Average PM2.5: ${avg(air.pm25).toFixed(1)} µg/m³ (WHO guideline: 5)`,
    );
  } else {
    details.push('No air quality data for this area');
  }

  if (sites) {
    parts.push({ score: Math.min(100, sites.reduce((sum, s) => sum + 25 * Math.max(0, 1 - s.miles / 10), 0)), weight: 1 });
    if (sites.length) {
      const proposed = sites.filter(s => s.proposed).length;
      details.push(
        `${sites.length} Superfund site(s) within 10 mi${proposed ? ` (${proposed} proposed)` : ''}`,
        ...sites.slice(0, 2).map(s => `☢ ${s.name}, ${s.city}: ${s.miles.toFixed(1)} mi`),
      );
    } else {
      details.push('No active Superfund sites within 10 mi');
    }
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = parts.length ? Math.round(parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight) : null;
  return { score, details };
}

// Rough US county ranges (age-adjusted %) used to normalise each measure to 0-100.
const HEALTH_RANGES = {
  GHLTH: [10, 35], CSMOKING: [8, 32], OBESITY: [22, 48],
  DIABETES: [6, 20], CHD: [4, 11], ACCESS2: [4, 32],
};

/** Average of each measure's position in its national range (0 = healthiest counties, 100 = least healthy). */
export function healthScore(rates) {
  const parts = Object.entries(HEALTH_RANGES)
    .filter(([k]) => rates[k] != null)
    .map(([k, [lo, hi]]) => Math.max(0, Math.min(100, ((rates[k] - lo) / (hi - lo)) * 100)));
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}

export function scoreHealth(rates, names) {
  if (!rates) return { score: null, details: ['No CDC county health data for this area (US only)'] };
  const worst = Object.keys(HEALTH_RANGES)
    .filter(k => rates[k] != null)
    .sort((a, b) => {
      const pos = k => (rates[k] - HEALTH_RANGES[k][0]) / (HEALTH_RANGES[k][1] - HEALTH_RANGES[k][0]);
      return pos(b) - pos(a);
    })
    .slice(0, 4)
    .map(k => `${names[k]}: ${rates[k]}%`);
  return { score: healthScore(rates), details: [...worst, 'County rates, CDC PLACES (age-adjusted)'] };
}
