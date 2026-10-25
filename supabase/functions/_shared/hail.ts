/** Hail reports from NOAA's Storm Prediction Center (SPC) daily storm reports.
 * SPC publishes preliminary point reports, not hail swaths: each row is one observation.
 * Format: Time,Size,Location,County,State,Lat,Lon,Comments. Time is HHMM UTC, Size is hundredths of an inch.
 * A report day runs 12:00 UTC to 11:59 UTC the next day, so times before 1200 belong to the following date. */
export type HailReport = { id: string; occurred_at: string; size_in: number; latitude: number; longitude: number; location: string; county: string; state: string; comments: string; source: 'spc' | 'demo' };
export type Bounds = { west: number; south: number; east: number; north: number };

export const spcDayCode = (day: string) => day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
export const spcHailUrl = (day: string) => `https://www.spc.noaa.gov/climo/reports/${spcDayCode(day)}_rpts_hail.csv`;

function splitCsvLine(line: string) {
  const out: string[] = []; let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
    else if (ch === '"') quoted = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

/** Parses one SPC daily hail CSV. `day` is the SPC report date (YYYY-MM-DD). Malformed rows are skipped. */
export function parseSpcHail(csv: string, day: string): HailReport[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0] ? splitCsvLine(lines[0]).map(h => h.trim().toLowerCase()) : [];
  if (header[0] !== 'time' || header[1] !== 'size') return [];
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const reports: HailReport[] = [];
  for (const line of lines.slice(1)) {
    const [time, size, location = '', county = '', state = '', lat, lon, ...rest] = splitCsvLine(line);
    if (!/^\d{4}$/.test(time ?? '')) continue;
    const latitude = Number(lat), longitude = Number(lon), hundredths = Number(size);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(hundredths) || hundredths <= 0) continue;
    const date = Number(time) < 1200 ? next : day;
    const occurred_at = `${date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`;
    reports.push({ id: `spc-${spcDayCode(day)}-${time}-${latitude}-${longitude}`, occurred_at, size_in: hundredths / 100, latitude, longitude, location: location.trim(), county: county.trim(), state: state.trim(), comments: rest.join(',').trim(), source: 'spc' });
  }
  return reports;
}

/** Bounds of the given polygons, widened by `bufferKm` on every side. */
export function boundsOf(rings: number[][][], bufferKm = 25): Bounds | null {
  const points = rings.flat(); if (!points.length) return null;
  const lats = points.map(p => p[1]), lons = points.map(p => p[0]);
  const dLat = bufferKm / 111, mid = (Math.min(...lats) + Math.max(...lats)) / 2, dLon = bufferKm / (111 * Math.max(Math.cos(mid * Math.PI / 180), 0.1));
  return { west: Math.min(...lons) - dLon, east: Math.max(...lons) + dLon, south: Math.min(...lats) - dLat, north: Math.max(...lats) + dLat };
}
export const within = (r: { latitude: number; longitude: number }, b: Bounds) => r.longitude >= b.west && r.longitude <= b.east && r.latitude >= b.south && r.latitude <= b.north;
