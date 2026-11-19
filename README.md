# Lethal

Pick any place on the map and see how dangerous it is, broken down by category.

**Live:** https://thecoberto.github.io/lethal/

| Category | Source | Status |
|---|---|---|
| Natural disasters | [FEMA National Risk Index](https://hazards.fema.gov/nri/) expected annual deaths per 100k (18 hazards, US counties) + [USGS earthquakes](https://earthquake.usgs.gov/fdsnws/event/1/) | Live; earthquakes only outside the US |
| Wildlife | Curated `data/wildlife.json` (US states) | All 50 states + DC |
| Crime & violence | County homicide deaths per 100k ([County Health Rankings](https://www.countyhealthrankings.org/), `data/counties.json`); state FBI violent crime rate as fallback | US counties |
| Roads | County motor-vehicle crash deaths per 100k (County Health Rankings, `data/counties.json`); state NHTSA rate as fallback | US counties |
| Environment | [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) (30-day AQI, PM2.5) + [EPA Superfund NPL sites](https://www.epa.gov/superfund/search-superfund-sites-where-you-live) within 10 mi | Air worldwide; Superfund US only |
| Health & disease | [CDC PLACES](https://www.cdc.gov/places/) county rates: poor health, smoking, obesity, diabetes, heart disease, uninsured | US counties |

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
- [x] Crime and roads data at county level
- [x] Wildlife data for all 50 states + DC
- [x] Shareable links (`#lat,lon` in the URL)
- [ ] Wildlife data for other countries
- [x] Rankings: top 10-100 most dangerous counties/states per category
- [x] Color the map by any category (state or county shading)
- [x] Overall county score (FEMA disasters + CDC health + state crime and roads) for rankings and the map
- [x] Compare two places side by side (shareable as `#lat,lon;lat,lon`)
- [ ] PWA: installable and offline

Scores are relative estimates for curiosity, not safety advice.

## Updating the data

Most sources are fetched live. `data/counties.json` (county homicide and crash death rates) is a
yearly snapshot from County Health Rankings, which publishes a new release each spring. To refresh it:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-county-data.ps1 -Year 2026
```

The state tables (`data/crime.json`, `data/traffic.json`, `data/wildlife.json`) are hand-curated
fallbacks and change rarely.
