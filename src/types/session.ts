import { FuelExpense, PlatformType } from './earnings';

export type ShiftState = 'idle' | 'active' | 'paused';
export type DrivingStatus = 'stopped' | 'moving';
export type TrackingMode = 'real_gps' | 'joystick';

export interface LocationPoint {
  lat: number;
  lng: number;
  speedKmh: number;
  heading: number;
  timestamp: number;
  hasPassenger?: boolean;
}

export interface TripDetail {
  id: string;
  platform: PlatformType;
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
  durationSeconds: number;
  distanceKm: number;
  estimatedEarnings: number;
  fuelCost?: number; // Gasto estimado de combustível / eletricidade na viagem (€)
  netEarnings?: number; // Lucro líquido real da corrida (€)
  encodedPath?: string; // Traçado da rota compactado em formato Google Polyline
  pathHistory: LocationPoint[]; // Rota GPS exata percorrida durante esta viagem específica
}

/**
 * Intervalo sem leituras GPS (por exemplo, browser fechado) que ainda não
 * pode ser contabilizado sem uma rota viária confirmada pelo OSRM.
 */
export interface PendingRouteGap {
  id: string;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  startedAt: number;
  endedAt: number;
  hasPassenger: boolean;
  platform: PlatformType | null;
  tripId?: string;
}

export interface ShiftSession {
  id: string;
  originDeviceId?: string;
  /** Versão monotónica usada para rejeitar snapshots remotos antigos. */
  revision?: number;
  state: ShiftState;
  drivingStatus: DrivingStatus;
  hasPassenger: boolean; // TRUE se está em viagem com passageiro / pedido a decorrer
  currentTripPlatform?: PlatformType | null; // Plataforma da viagem ativa (ex: 'uber', 'bolt')
  platformTripsCount?: Partial<Record<PlatformType, number>>; // Contagem de viagens por plataforma no turno
  trackingMode: TrackingMode;
  platform: PlatformType | 'all';
  startTime: number | null;
  activeDurationSeconds: number; // Tempo total do turno (online)
  passengerDurationSeconds: number; // Tempo estritamente com passageiro
  emptyDurationSeconds: number; // Tempo à espera / sem passageiro
  movingDurationSeconds: number; // Tempo em movimento
  totalDistanceKm: number; // Km totais do turno
  passengerDistanceKm: number; // Km com passageiro
  emptyDistanceKm: number; // Km em vazio
  tripsCompletedCount: number; // Número de corridas/pedidos concluídos no turno
  currentSpeedKmh: number;
  currentPosition: {
    lat: number;
    lng: number;
    heading: number;
    accuracy: number;
  };
  pathHistory: LocationPoint[];
  currentTripPath: LocationPoint[]; // Coordenadas GPS da viagem ativa
  // Estado transitório persistido para recuperar uma viagem após reload/browser fechado.
  currentTripStartedAt: number;
  currentTripStartDistanceKm: number;
  currentTripStartEarnings: number;
  currentTripDurationSeconds: number;
  trips: TripDetail[]; // Lista de viagens individuais gravadas no turno
  pendingRouteGaps: PendingRouteGap[]; // Intervalos a aguardar rota viária; nunca usar linha reta
  estimatedEarnings: number; // Ganhos brutos acumulados
  estimatedFuelCost: number; // Custo estimado de combustível/eletricidade
  fuelExpenses: FuelExpense[]; // Despesas manuais de abastecimento/carregamento registadas no turno
  estimatedNetEarnings: number; // Ganhos líquidos em tempo real
  effectiveHourlyRate: number; // Taxa horária média
}
