// "Most dangerous places" leaderboards. Each category returns [{ name, score, lat?, lon?, query? }].
import { wildlife, crime, traffic, healthAllCounties, topRiskCounties, allRiskCounties, countyRates } from './api.js';
import { scoreWildlife, scoreCrime, scoreRoads, scoreCrimeAt, scoreRoadsAt, healthScore } from './score.js';

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** Score every state with a state-level scorer; states are located by geocoding on click. */
async function rankStates(scoreFor) {
  return Object.entries(STATE_NAMES)
    .map(([code, name]) => ({ name, query: `${name}, United States`, score: scoreFor(code) }))
    .filter(r => r.score != null);
}

/**
 * Score every county with a county-first scorer. County names/coords come from the CDC
 * county list. Rows scored from the state fallback are flagged `estimated`.
 */
async function rankCounties(scoreAt, loadStateData) {
  const [rows, stateData, counties] = await Promise.all([healthAllCounties(), loadStateData(), countyRates()]);
  return rows.map(c => {
    const s = scoreAt(stateData, c.state, counties, c.fips);
    return { fips: c.fips, name: c.name, lat: c.lat, lon: c.lon, score: s.score, estimated: !!s.estimated };
  });
}

export const CATEGORIES = {
  disasters: {
    label: '🌋 Natural Disasters', unit: 'counties',
    load: n => topRiskCounties(n),
  },
  health: {
    label: '🦠 Health & Disease', unit: 'counties',
    load: async () => (await healthAllCounties()).map(c => ({ ...c, score: healthScore(c.rates) })),
  },
  crime: {
    label: '🔪 Crime & Violence', unit: 'counties',
    load: () => rankCounties(scoreCrimeAt, crime),
  },
  roads: {
    label: '🚗 Roads', unit: 'counties',
    load: () => rankCounties(scoreRoadsAt, traffic),
  },
  wildlife: {
    label: '🐍 Wildlife', unit: 'states',
    load: async () => { const d = await wildlife(); return rankStates(s => scoreWildlife(d, s).score); },
  },
  overallCounties: {
    // Crime + Roads use county rates, falling back to the state where a county's are suppressed.
    label: '☠️ Overall by county (Disasters, Health, Crime, Roads)', unit: 'counties',
    load: async () => {
      const [risk, healthRows, stateCrime, stateRoads, counties] = await Promise.all(
        [allRiskCounties(), healthAllCounties(), crime(), traffic(), countyRates()]);
      const riskByFips = new Map(risk.map(r => [r.fips, r.score]));
      return healthRows.map(c0 => {
        const scores = [
          riskByFips.get(c0.fips), healthScore(c0.rates),
          scoreCrimeAt(stateCrime, c0.state, counties, c0.fips).score,
          scoreRoadsAt(stateRoads, c0.state, counties, c0.fips).score,
        ].filter(x => x != null);
        const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        return { fips: c0.fips, name: c0.name, lat: c0.lat, lon: c0.lon, score };
      });
    },
  },
  overall: {
    label: '☠️ Overall by state (Crime + Roads + Wildlife)', unit: 'states',
    load: async () => {
      const [c, t, w] = await Promise.all([crime(), traffic(), wildlife()]);
      return rankStates(s => {
        const scores = [scoreCrime(c, s).score, scoreRoads(t, s).score, scoreWildlife(w, s).score].filter(x => x != null);
        return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      });
    },
  },
};

/**
 * Every scored place in a category, for colouring the map.
 * County rows carry `fips`; state rows carry the full state `name`.
 */
export async function allScores(key) {
  if (key === 'disasters') return allRiskCounties();
  return (await CATEGORIES[key].load()).filter(r => r.score != null);
}

/** Top n places for a category, most dangerous first. */
export async function topPlaces(key, n) {
  const rows = await CATEGORIES[key].load(n);
  return rows.filter(r => r.score != null && !r.estimated).sort((a, b) => b.score - a.score).slice(0, n);
}
