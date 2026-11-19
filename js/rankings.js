// "Most dangerous places" leaderboards. Each category returns [{ name, score, lat?, lon?, query? }].
import { wildlife, crime, traffic, healthAllCounties, topRiskCounties, allRiskCounties } from './api.js';
import { scoreWildlife, scoreCrime, scoreRoads, healthScore } from './score.js';

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
    label: '🔪 Crime & Violence', unit: 'states',
    load: async () => { const d = await crime(); return rankStates(s => scoreCrime(d, s).score); },
  },
  roads: {
    label: '🚗 Roads', unit: 'states',
    load: async () => { const d = await traffic(); return rankStates(s => scoreRoads(d, s).score); },
  },
  wildlife: {
    label: '🐍 Wildlife', unit: 'states',
    load: async () => { const d = await wildlife(); return rankStates(s => scoreWildlife(d, s).score); },
  },
  overall: {
    label: '☠️ Overall (state-level categories)', unit: 'states',
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
  return rows.filter(r => r.score != null).sort((a, b) => b.score - a.score).slice(0, n);
}
