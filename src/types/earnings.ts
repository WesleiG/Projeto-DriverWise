export type PlatformType = 'uber' | 'bolt' | 'freenow' | 'other';
export type VehicleType = 'electric' | 'hybrid' | 'diesel' | 'petrol' | 'lpg';

export interface VehicleEnergySettings {
  vehicleType: VehicleType;
  vehicleModelName?: string;
  consumptionPer100Km: number; // ex: 15 kWh/100km ou 5.5 L/100km
  fuelPricePerUnit: number; // ex: 0.24 €/kWh ou 1.68 €/L
  costPerKm: number; // Custo efetivo por km (€/km)
}

export interface HourlySegment {
  hour: number; // 0 a 23
  km: number; // Quilómetros percorridos nesta hora
  gross: number; // Ganhos em euros nesta hora
  fuelCost: number; // Custo de energia/combustível nesta hora
  net: number; // Ganho líquido nesta hora
  movingMinutes: number; // Minutos em viagem ativa
}

import { TripDetail } from './session';

export type FuelExpenseUnit = 'liters' | 'kwh' | 'unit';

export interface FuelExpense {
  id: string;
  amount: number;
  quantity?: number;
  unit?: FuelExpenseUnit;
  notes?: string;
  createdAt: string;
}

export interface EarningRecord {
  id: string;
  platform: PlatformType;
  date: string; // AAAA-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  totalHours: number; // Horas totais online no turno (ex: 8.5)
  passengerHours: number; // Horas com passageiro / em viagem (ex: 5.8)
  passengerDistanceKm?: number; // Quilómetros com passageiro
  emptyDistanceKm?: number; // Quilómetros em vazio
  occupancyRatePct?: number; // Taxa de ocupação (% do tempo com passageiro)
  grossEarnings: number; // Ganhos brutos em euros
  tips: number; // Gorjetas em euros
  bonuses: number; // Bónus / Incentivos em euros
  tollsReimbursed: number; // Portagens reembolsadas
  distanceKm: number; // Quilómetros totais percorridos
  tripsCount: number; // Número de viagens efetuadas
  trips?: TripDetail[]; // Lista discriminada de viagens individuais com rota GPS
  fuelCost: number; // Despesas com combustível ou eletricidade
  fuelExpenses?: FuelExpense[]; // Abastecimentos/carregamentos discriminados
  commissionCost: number; // Comissões da plataforma (se aplicável fora do bruto)
  commissionPct?: number; // Percentagem universal de comissão aplicada no fecho
  taxCost?: number; // Impostos calculados a partir da percentagem universal
  taxPct?: number; // Percentagem universal de impostos aplicada no fecho
  otherExpenses: number; // Lavagem, manutenção, portagens próprias
  netEarnings: number; // Ganhos líquidos calculados
  hourlySegments?: HourlySegment[]; // Detalhamento horário do turno
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformStat {
  platform: PlatformType;
  gross: number;
  net: number;
  hours: number;
  passengerHours: number;
  distanceKm: number;
  passengerDistanceKm: number;
  trips: number;
  avgHourlyRate: number;
  avgKmRate: number;
}

export interface HourlyStat {
  hour: number; // 0 a 23
  label: string; // ex: "08:00 - 09:00"
  avgKm: number; // Média de quilómetros percorridos nesta hora
  avgEarnings: number; // Média de faturação bruta nesta hora
  avgFuelCost: number; // Média do custo de energia/combustível nesta hora
  avgNetEarnings: number; // Média de ganho líquido nesta hora
  avgHourlyRate: number; // Taxa horária bruta média (€/h)
  avgNetHourlyRate: number; // Taxa horária líquida média (€/h)
  avgKmRate: number; // Taxa média bruta por km (€/km)
  avgNetKmRate: number; // Taxa média líquida por km (€/km)
  sampleCount: number; // Número de turnos registados nesta faixa
  isPeakHour: boolean; // Se é hora de pico/alta rentabilidade
}

export interface WeeklyOccupancyStat {
  dayLabel: string; // ex: "Seg, 25 Ago"
  date: string;
  totalHours: number;
  passengerHours: number;
  emptyHours: number;
  occupancyRate: number; // %
  emptyKm: number;
  emptyCost: number; // € gastos em vazio
}

export interface HotspotZone {
  id: string;
  name: string;
  area: string;
  recommendedHours: string;
  occupancyEfficiency: number; // ex: 85%
  avgWaitMinutes: number; // ex: 3 min
  description: string;
  badge: string;
  iconType: 'airport' | 'corporate' | 'nightlife' | 'coastal' | 'transit';
}

export interface EarningsSummary {
  totalGross: number;
  totalNet: number;
  totalHours: number;
  totalPassengerHours: number; // Total acumulado de horas com passageiro
  totalEmptyHours: number; // Total acumulado de horas em vazio
  avgOccupancyRate: number; // Média global da taxa de ocupação (%)
  totalDistanceKm: number;
  totalPassengerKm: number;
  totalEmptyKm: number;
  totalEmptyCost: number; // Custo de combustível desperdiçado em vazio
  totalTrips: number;
  totalExpenses: number;
  totalFuelCost: number;
  avgHourlyGross: number; // €/h faturável, usando apenas horas com passageiro
  avgHourlyNet: number; // €/h líquido faturável, usando apenas horas com passageiro
  avgHourlyKm: number; // Média global de Km por hora trabalhada
  avgKmRate: number; // €/km faturável, usando apenas km com passageiro
  avgNetKmRate: number; // €/km líquido faturável, usando apenas km com passageiro
  avgPerTrip: number;
  platformBreakdown: Record<PlatformType, PlatformStat>;
  hourlyBreakdown: HourlyStat[]; // Estatísticas detalhadas para as 24 horas do dia
  weeklyOccupancy: WeeklyOccupancyStat[]; // Relatório de tempo útil vs vazio ao longo dos dias/semanas
  hotspotZones: HotspotZone[]; // Zonas estratégicas de alta eficiência
  bestHourlyWindow: string; // ex: "18:00 - 22:00"
  bestHourlyKmRate: number; // Melhor taxa de km/h
  bestDayOfWeek: string;
  topPlatform: PlatformType;
}

export interface UserSettings {
  dailyGoal: number; // Meta diária em €
  weeklyGoal: number; // Meta semanal em €
  defaultPlatform: PlatformType | 'all';
  enabledPlatforms?: PlatformType[]; // Plataformas ativas configuradas para início rápido de viagem
  fallbackHourlyRate: number; // Taxa horária padrão (€/h) se não houver histórico
  fallbackKmRate: number; // Taxa por km padrão (€/km)
  defaultCommissionPct: number; // Comissão padrão aplicada no fecho do turno
  defaultTaxPct: number; // Impostos padrão aplicados no fecho do turno
  movementThresholdSpeedKmh: number; // Velocidade mínima (km/h) para considerar o carro em movimento
  soundEnabled: boolean; // Notificações sonoras
  voiceEnabled: boolean; // Alertas vocais em pt-PT
  aircraftSpeedometerEnabled: boolean; // Velocímetro vetorial leve com animação de descolagem/pouso
  vehicleEnergy: VehicleEnergySettings; // Perfil de combustível/elétrico do veículo
}
