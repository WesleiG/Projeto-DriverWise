import { Coordinates } from '../types/location';
import { LocationPoint, TripDetail } from '../types/session';
import { EarningsSummary, UserSettings } from '../types/earnings';
import { calculateHaversineDistance } from '../utils/geoUtils';
import { encodePolyline, decodePolyline } from '../utils/polylineEncoder';
import { getEffectiveVehicleCostPerKm } from '../utils/calculations';

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry: {
      coordinates: Array<[number, number]>; // [lng, lat]
    };
    distance: number; // metros
    duration: number; // segundos
  }>;
}

const MAX_RETURNED_ROUTE_POINTS = 300;
const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
];

/**
 * Calcula a distância cumulativa em km ao longo de um array de coordenadas.
 */
export function getPathDistanceKm(points: Array<Coordinates | LocationPoint | [number, number]>): number {
  if (!points || points.length < 2) return 0;
  let totalKm = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const p1: Coordinates = Array.isArray(prev) ? { lat: prev[0], lng: prev[1] } : { lat: prev.lat, lng: prev.lng };
    const p2: Coordinates = Array.isArray(curr) ? { lat: curr[0], lng: curr[1] } : { lat: curr.lat, lng: curr.lng };
    if (Number.isFinite(p1.lat) && Number.isFinite(p1.lng) && Number.isFinite(p2.lat) && Number.isFinite(p2.lng)) {
      totalKm += calculateHaversineDistance(p1, p2);
    }
  }
  return Number(totalKm.toFixed(2));
}

/**
 * Extrai o trajeto completo de uma viagem a partir de pathHistory ou encodedPath.
 */
export function getTripResolvedPath(trip: TripDetail): LocationPoint[] {
  if (trip.pathHistory && trip.pathHistory.length > 0) {
    return trip.pathHistory;
  }
  if (typeof trip.encodedPath === 'string' && trip.encodedPath.trim().length > 0) {
    const decoded = decodePolyline(trip.encodedPath);
    return decoded.map(([lat, lng], idx) => ({
      lat,
      lng,
      speedKmh: 40,
      heading: 0,
      timestamp: Date.now() + idx * 1000,
    }));
  }
  return [];
}

/**
 * Amostra waypoints de forma homogénea e bem distribuída ao longo do percurso.
 */
function sampleWaypointsUniformly(points: Coordinates[], maxWaypoints = 10): Coordinates[] {
  if (points.length <= maxWaypoints) return points;
  const sampled: Coordinates[] = [];
  const step = (points.length - 1) / (maxWaypoints + 1);
  for (let i = 1; i <= maxWaypoints; i += 1) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

function sampleRouteCoordinates(coordinates: Array<[number, number]>): Array<[number, number]> {
  if (coordinates.length <= MAX_RETURNED_ROUTE_POINTS) return coordinates;
  const sampled: Array<[number, number]> = [];
  const step = (coordinates.length - 1) / (MAX_RETURNED_ROUTE_POINTS - 1);
  for (let index = 0; index < MAX_RETURNED_ROUTE_POINTS; index += 1) {
    sampled.push(coordinates[Math.round(index * step)]);
  }
  return sampled;
}

/**
 * Obtém a rota real pelas ruas entre coordenadas usando a rede viária (OSRM).
 * Suporta múltiplos servidores com timeout e fallback inteligente.
 * Retorna os pontos GPS detalhados ao longo das ruas e a distância real de condução em km.
 */
export async function getStreetDrivingRoute(
  startCoords: Coordinates,
  endCoords: Coordinates,
  sampledWaypoints: Coordinates[] = [],
  hasPassenger = true
): Promise<{ path: LocationPoint[]; distanceKm: number } | null> {
  const distributedWaypoints = sampleWaypointsUniformly(sampledWaypoints, 10);
  const allCoords = [
    startCoords,
    ...distributedWaypoints,
    endCoords,
  ].filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat !== 0 && c.lng !== 0);

  if (allCoords.length < 2) return null;

  const directDistance = calculateHaversineDistance(startCoords, endCoords);
  const cumulativeWaypointsDist = getPathDistanceKm(allCoords);
  const minExpectedKm = Math.max(directDistance, cumulativeWaypointsDist);

  if (minExpectedKm < 0.03) {
    return {
      path: allCoords.map((c, i) => ({
        lat: c.lat,
        lng: c.lng,
        speedKmh: 0,
        heading: 0,
        timestamp: Date.now() + i * 1000,
        hasPassenger,
      })),
      distanceKm: 0,
    };
  }

  const coordString = allCoords.map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(';');

  // Tentar os servidores OSRM em sequência
  for (const endpoint of OSRM_ENDPOINTS) {
    try {
      const url = `${endpoint}/${coordString}?overview=full&geometries=geojson`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) continue;

      const data: OsrmRouteResponse = await response.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const bestRoute = data.routes[0];
        const rawDistanceKm = Number((bestRoute.distance / 1000).toFixed(2));
        const distanceKm = Math.max(rawDistanceKm, cumulativeWaypointsDist);
        const now = Date.now();

        const path: LocationPoint[] = sampleRouteCoordinates(bestRoute.geometry.coordinates).map(([lng, lat], idx) => ({
          lat,
          lng,
          speedKmh: 40,
          heading: 0,
          timestamp: now + idx * 1000,
          hasPassenger,
        }));

        return { path, distanceKm };
      }
    } catch {
      // Tentar próximo endpoint
    }
  }

  // Fallback se os servidores OSRM não responderem:
  // Usa o maior entre a distância acumulada dos waypoints ou a distância direta com sinuosidade viária
  const estimatedStreetKm = Math.max(
    cumulativeWaypointsDist,
    Number((directDistance * 1.30).toFixed(2))
  );

  const fallbackPath: LocationPoint[] = allCoords.map((c, idx) => ({
    lat: c.lat,
    lng: c.lng,
    speedKmh: 35,
    heading: 0,
    timestamp: Date.now() + idx * 1000,
    hasPassenger,
  }));

  return { path: fallbackPath, distanceKm: estimatedStreetKm };
}

/**
 * Reconcilia e enriquece uma viagem individual com a rota viária real pelas ruas do OSRM.
 */
export async function enrichTripWithStreetRoute(
  trip: TripDetail,
  settings: UserSettings,
  summary: EarningsSummary
): Promise<TripDetail | null> {
  const path = getTripResolvedPath(trip);
  if (path.length < 2) return null;

  const start = path[0];
  const end = path[path.length - 1];
  const waypoints = path.slice(1, -1);
  const pathCumulativeKm = getPathDistanceKm(path);

  const routeResult = await getStreetDrivingRoute(start, end, waypoints, true);
  const realDistanceKm = routeResult ? Math.max(routeResult.distanceKm, pathCumulativeKm) : pathCumulativeKm;

  if (!Number.isFinite(realDistanceKm) || realDistanceKm <= 0) return null;

  const vehicleCostKm = getEffectiveVehicleCostPerKm(settings);
  const fuelCost = Number((realDistanceKm * vehicleCostKm).toFixed(2));

  // Recalcular ganhos com base na distância viária real
  const platformStat = summary.platformBreakdown[trip.platform];
  const targetKmRate = platformStat?.avgKmRate > 0 ? platformStat.avgKmRate : summary.avgKmRate || settings.fallbackKmRate;
  const targetHourlyRate = platformStat?.avgHourlyRate > 0 ? platformStat.avgHourlyRate : summary.avgHourlyGross || settings.fallbackHourlyRate;
  const durationHours = Math.max(0, trip.durationSeconds) / 3600;

  const estimatedEarnings = Number((realDistanceKm * targetKmRate * 0.55 + durationHours * targetHourlyRate * 0.45).toFixed(2));
  const netEarnings = Number((estimatedEarnings - fuelCost).toFixed(2));
  const finalPath = (routeResult && routeResult.path.length >= 2) ? routeResult.path : path;

  return {
    ...trip,
    distanceKm: realDistanceKm,
    estimatedEarnings,
    fuelCost,
    netEarnings,
    pathHistory: finalPath,
    encodedPath: encodePolyline(finalPath),
  };
}
