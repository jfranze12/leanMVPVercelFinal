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
  { id: 'loc_grafenwoehr', name: 'Grafenwoehr', distanceMiles: 23, type: 'local' },
  { id: 'loc_wiesbaden', name: 'Wiesbaden', distanceMiles: 200, type: 'regional' },
  { id: 'loc_baumholder', name: 'Baumholder', distanceMiles: 260, type: 'regional' },
  { id: 'loc_czechia', name: 'Czechia', distanceMiles: 350, type: 'rotation' },
  { id: 'loc_lithuania', name: 'Lithuania', distanceMiles: 650, type: 'rotation' },
]

export const seedUics = [
  {
    id: 'uic_b48',
    code: 'UIC-B48',
    unit: '2-2 Stryker Brigade',
    accent: 'from-stone-700 to-neutral-800',
    location: 'Rose Barracks, Germany',
    homeLocationName: 'Home Station',
  },
]
