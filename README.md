# Lethal

Pick any place on the map and see how dangerous it is, broken down by category.

**Live:** https://thecoberto.github.io/lethal/

| Category | Source | Status |
|---|---|---|
| Natural disasters | [FEMA National Risk Index](https://hazards.fema.gov/nri/) (18 hazards, US counties) + [USGS earthquakes](https://earthquake.usgs.gov/fdsnws/event/1/) | Live; earthquakes only outside the US |
| Wildlife | Curated `data/wildlife.json` (US states) | All 50 states + DC |
| Crime & violence | FBI violent crime rates, `data/crime.json` (state level) | All 50 states + DC |
| Roads | NHTSA/IIHS traffic deaths, `data/traffic.json` (state level) | All 50 states + DC |
| Environment | [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) (30-day AQI, PM2.5) + [EPA Superfund NPL sites](https://www.epa.gov/superfund/search-superfund-sites-where-you-live) within 10 mi | Air worldwide; Superfund US only |

## Run locally

ES modules need a local server (opening `index.html` directly won't work):

```sh
npx serve .
# or
python -m http.server
```

## Structure

```
index.html        page layout
css/style.css     styles
js/app.js         map, UI, rendering
js/api.js         all fetch calls (geocoding, USGS, local data)
js/score.js       turns raw data into 0-100 scores
data/             static datasets
```

## Roadmap

- [x] FEMA National Risk Index (floods, hurricanes, tornadoes, wildfire...)
- [x] Crime data (state level; city/county next)
- [x] Wildlife data for all 50 states + DC
- [x] Shareable links (`#lat,lon` in the URL)
- [ ] Wildlife data for other countries
- [ ] Compare two places side by side
- [ ] PWA: installable and offline

Scores are relative estimates for curiosity, not safety advice.
