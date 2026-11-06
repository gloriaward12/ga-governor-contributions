// Writes Georgia county polygons (from us-atlas) as compact GeoJSON for the county map.
import fs from 'node:fs';
import { feature } from 'topojson-client';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const topo = require('us-atlas/counties-10m.json');
const fc = feature(topo, topo.objects.counties);
const rnd = c => Array.isArray(c[0]) ? c.map(rnd) : [+c[0].toFixed(3), +c[1].toFixed(3)];
const ga = fc.features.filter(f => String(f.id).startsWith('13')).map(f => ({ type: 'Feature', id: f.id, properties: { name: f.properties.name }, geometry: { type: f.geometry.type, coordinates: rnd(f.geometry.coordinates) } }));
fs.mkdirSync('public/geo', { recursive: true });
fs.writeFileSync('public/geo/ga-counties.json', JSON.stringify({ type: 'FeatureCollection', features: ga }));
console.log('wrote public/geo/ga-counties.json', ga.length, 'counties');
