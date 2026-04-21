import fs from 'fs'

function readJson(name) {
  return JSON.parse(fs.readFileSync(new URL(`./seed-data/${name}.json`, import.meta.url), 'utf8'))
}

export const seedRows = {
  matsit: readJson('matsit'),
  ssl: readJson('ssl'),
  demandAnalysis: readJson('demandAnalysis'),
  zrrr: readJson('zrrr'),
}

export const seedLocations = [
  { id: 'loc_home', name: 'Home Station', distanceMiles: 0, type: 'home' },
  { id: 'loc_local', name: 'Local Training Area', distanceMiles: 35, type: 'local' },
  { id: 'loc_yakima', name: 'Yakima Training Center', distanceMiles: 170, type: 'regional' },
  { id: 'loc_ntc', name: 'NTC', distanceMiles: 1200, type: 'rotation' },
  { id: 'loc_jmrc', name: 'JMRC', distanceMiles: 5200, type: 'rotation' },
  { id: 'loc_graf', name: 'Grafenwoehr', distanceMiles: 4300, type: 'regional' },
]

export const seedUics = [
  { id: 'uic_a12', code: 'UIC-A12', unit: '1-17 Infantry', accent: 'from-neutral-700 to-neutral-800', location: 'Fort Carson, Colorado', homeLocationName: 'Home Station' },
  { id: 'uic_b48', code: 'UIC-B48', unit: '2-2 Stryker Brigade', accent: 'from-stone-700 to-neutral-800', location: 'Rose Barracks, Germany', homeLocationName: 'Grafenwoehr' },
  { id: 'uic_c31', code: 'UIC-C31', unit: '3-4 Cavalry', accent: 'from-zinc-700 to-neutral-800', location: 'Fort Wainwright, Alaska', homeLocationName: 'Home Station' },
]
