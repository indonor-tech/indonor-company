import { Country, State, City } from 'country-state-city';
import indiaData from '../data/india-states-districts.json';

const EXTRA_INDIA = {
  'Andaman and Nicobar Islands': ['Nicobar', 'North and Middle Andaman', 'South Andaman'],
  Ladakh: ['Leh', 'Kargil']
};

const STATE_ALIASES = {
  delhi: 'Delhi',
  'nct of delhi': 'Delhi',
  chandigarh: 'Chandigarh',
  puducherry: 'Puducherry',
  pondicherry: 'Puducherry',
  lakshadweep: 'Lakshadweep',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'jammu and kashmir': 'Jammu and Kashmir',
  'andaman and nicobar islands': 'Andaman and Nicobar Islands',
  'andaman and nicobar': 'Andaman and Nicobar Islands'
};

function clean(name) {
  return String(name || '').replace(/&amp;/g, '&').replace(/\s*\((UT|NCT)\)\s*/gi, '').trim();
}

export function geoKey(name) {
  return clean(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const indiaDistricts = {};
for (const row of indiaData.states || []) {
  const name = STATE_ALIASES[geoKey(row.state)] || clean(row.state);
  const list = (row.districts || []).map((item) => clean(item)).filter(Boolean);
  indiaDistricts[name] = [...new Set([...(indiaDistricts[name] || []), ...list])];
}
Object.entries(EXTRA_INDIA).forEach(([name, list]) => {
  indiaDistricts[name] = [...new Set([...(indiaDistricts[name] || []), ...list])];
});

function findCountry(name) {
  const countries = Country.getAllCountries();
  return countries.find((item) => item.name === name) || countries.find((item) => geoKey(item.name) === geoKey(name));
}

function findState(countryName, stateName) {
  const country = findCountry(countryName);
  if (!country) return null;
  const states = State.getStatesOfCountry(country.isoCode);
  return states.find((item) => item.name === stateName) || states.find((item) => geoKey(item.name) === geoKey(stateName));
}

function lookupIndiaDistricts(stateName) {
  const mapped = STATE_ALIASES[geoKey(stateName)] || stateName;
  return indiaDistricts[mapped] || indiaDistricts[Object.keys(indiaDistricts).find((name) => geoKey(name) === geoKey(stateName))] || [];
}

export function countryOptions() {
  return Country.getAllCountries().map((item) => item.name).sort((left, right) => left.localeCompare(right));
}

export function stateOptions(countryName) {
  const country = findCountry(countryName);
  if (!country) return [];
  return State.getStatesOfCountry(country.isoCode).map((item) => item.name);
}

export function cityOptions(countryName, stateName) {
  const country = findCountry(countryName);
  const state = findState(countryName, stateName);
  if (!country || !state) return [];
  return [...new Set(City.getCitiesOfState(country.isoCode, state.isoCode).map((item) => item.name))].sort((left, right) => left.localeCompare(right));
}

export function districtOptions(countryName, stateName) {
  if (!countryName || !stateName) return [];
  if (findCountry(countryName)?.isoCode === 'IN') return lookupIndiaDistricts(stateName);
  return cityOptions(countryName, stateName);
}

export function withExtra(options, ...values) {
  const list = [...options];
  values.flat().forEach((value) => {
    if (value && !list.some((item) => geoKey(item) === geoKey(value))) list.unshift(value);
  });
  return list;
}

export function matchLocation(text) {
  const source = String(text || '');
  if (!source.trim()) return {};
  const lower = source.toLowerCase();
  let country = Country.getAllCountries().find((item) => lower.includes(item.name.toLowerCase()))?.name || '';
  if (!country && /(india|bharat|delhi|mumbai|bangalore|bengaluru|hyderabad|chennai|pune|kolkata)/i.test(source)) country = 'India';
  if (!country) return {};
  const state = stateOptions(country).find((name) => lower.includes(name.toLowerCase())) || '';
  const district = state ? districtOptions(country, state).find((name) => lower.includes(name.toLowerCase().split('(')[0].trim())) || '' : '';
  const city = state ? cityOptions(country, state).find((name) => lower.includes(name.toLowerCase())) || '' : '';
  return { country, ...(state ? { state } : {}), ...(district ? { district } : {}), ...(city ? { city } : {}) };
}

export function matchPosition(extracted, positions) {
  if (!extracted) return '';
  return positions.find((name) => geoKey(name) === geoKey(extracted))
    || positions.find((name) => geoKey(extracted).includes(geoKey(name)) || geoKey(name).includes(geoKey(extracted)))
    || extracted;
}
