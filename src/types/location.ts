export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeolocationState {
  coords: Coordinates;
  heading: number; // Em graus (0 a 360)
  speedKmh: number; // Em km/h
  accuracy: number; // Em metros
  isTracking: boolean;
  error: string | null;
  timestamp: number;
}

export interface JoystickVector {
  x: number; // -1 a +1
  y: number; // -1 a +1
  angleDegrees: number; // 0 a 360
  force: number; // 0 a 1 (intensidade do acelerador)
}
