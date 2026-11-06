import { LocationPoint } from '../types/session';

type PointInput = LocationPoint | [number, number] | { lat: number; lng: number };

/**
 * Codifica um array de coordenadas no formato compacto Google Polyline Algorithm
 * Reduz em até 90% o tamanho dos dados geográficos em base de dados e requisições de rede.
 */
export function encodePolyline(points: PointInput[]): string {
  if (!points || points.length === 0) return '';

  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const p of points) {
    let lat: number;
    let lng: number;

    if (Array.isArray(p)) {
      lat = p[0];
      lng = p[1];
    } else {
      lat = p.lat;
      lng = p.lng;
    }

    // Google Polyline usa fator de precisão 1e5 (5 casas decimais = precisão de ~1 metro)
    const late5 = Math.round(lat * 1e5);
    const lnge5 = Math.round(lng * 1e5);

    const dLat = late5 - prevLat;
    const dLng = lnge5 - prevLng;

    prevLat = late5;
    prevLng = lnge5;

    encoded += encodeSignedNumber(dLat);
    encoded += encodeSignedNumber(dLng);
  }

  return encoded;
}

function encodeSignedNumber(num: number): string {
  let sgn_num = num < 0 ? ~(num << 1) : num << 1;
  let encodeString = '';

  while (sgn_num >= 0x20) {
    encodeString += String.fromCharCode((0x20 | (sgn_num & 0x1f)) + 63);
    sgn_num >>= 5;
  }

  encodeString += String.fromCharCode(sgn_num + 63);
  return encodeString;
}

/**
 * Descodifica uma string no formato Google Polyline para um array de pares [lat, lng]
 */
export function decodePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];

  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}
