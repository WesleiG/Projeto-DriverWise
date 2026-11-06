import {
  EarningRecord,
  EarningsSummary,
  HourlyStat,
  PlatformStat,
  PlatformType,
  UserSettings,
  VehicleEnergySettings,
  VehicleType,
  WeeklyOccupancyStat,
} from '../types/earnings';

export const DEFAULT_VEHICLE_ENERGY: VehicleEnergySettings = {
  vehicleType: 'electric',
  vehicleModelName: 'Tesla / Viatura Elétrica',
  consumptionPer100Km: 15.0, // 15 kWh / 100 km
  fuelPricePerUnit: 0.24, // 0,24 € / kWh (média carregamento em Portugal)
  costPerKm: 0.08, // 0,08 € / km
};

export const VEHICLE_PRESETS: Record<
  VehicleType,
  { label: string; consumption: number; unitPrice: number; defaultCostKm: number; unit: string }
> = {
  electric: {
    label: '⚡ 100% Elétrico (EV)',
    consumption: 15.0,
    unitPrice: 0.24,
    defaultCostKm: 0.08,
    unit: '€/kWh',
  },
  hybrid: {
    label: '🔋 Híbrido / Plug-in (PHEV)',
    consumption: 4.8,
    unitPrice: 1.68,
    defaultCostKm: 0.11,
    unit: '€/L',
  },
  diesel: {
    label: '⛽ Gasóleo (Diesel)',
    consumption: 5.6,
    unitPrice: 1.58,
    defaultCostKm: 0.13,
    unit: '€/L',
  },
  petrol: {
    label: '⛽ Gasolina 95',
    consumption: 6.8,
    unitPrice: 1.72,
    defaultCostKm: 0.15,
    unit: '€/L',
  },
  lpg: {
    label: '💨 GPL Auto',
    consumption: 8.2,
    unitPrice: 0.85,
    defaultCostKm: 0.09,
    unit: '€/L',
  },
};

export const DEFAULT_SETTINGS: UserSettings = {
  dailyGoal: 150, // 150€ por dia
  weeklyGoal: 900, // 900€ por semana
  defaultPlatform: 'all',
  enabledPlatforms: ['uber', 'bolt', 'freenow'], // Uber, Bolt e FreeNow ativas por defeito
  fallbackHourlyRate: 18.5, // 18,50 €/hora (média típica TVDE em Portugal)
  fallbackKmRate: 0.95, // 0,95 €/km
  defaultCommissionPct: 0,
  defaultTaxPct: 0,
  movementThresholdSpeedKmh: 4.0, // Acima de 4 km/h considera-se em andamento/viagem
  soundEnabled: true,
  voiceEnabled: true,
  aircraftSpeedometerEnabled: false,
  vehicleEnergy: DEFAULT_VEHICLE_ENERGY,
};

/**
 * Calcula o custo unitário estimado por quilómetro com base no consumo e preço
 */
export function calculateCostPerKm(consumptionPer100Km: number, fuelPricePerUnit: number): number {
  if (!Number.isFinite(consumptionPer100Km) || !Number.isFinite(fuelPricePerUnit) || consumptionPer100Km <= 0 || fuelPricePerUnit <= 0) return 0.08;
  const cost = (consumptionPer100Km / 100) * fuelPricePerUnit;
  return Number(cost.toFixed(3));
}

/**
 * Retorna o custo por km configurado ou calcula com base no consumo e preço
 */
export function getEffectiveVehicleCostPerKm(settings?: UserSettings): number {
  if (!settings || !settings.vehicleEnergy) return 0.08;
  if (Number.isFinite(settings.vehicleEnergy.costPerKm) && settings.vehicleEnergy.costPerKm > 0) {
    return settings.vehicleEnergy.costPerKm;
  }
  if (settings.vehicleEnergy.consumptionPer100Km > 0 && settings.vehicleEnergy.fuelPricePerUnit > 0) {
    return calculateCostPerKm(settings.vehicleEnergy.consumptionPer100Km, settings.vehicleEnergy.fuelPricePerUnit);
  }
  return 0.08;
}

/**
 * Estima o custo real por quilómetro a partir dos registos guardados.
 * Usa o maior valor entre o custo declarado e os abastecimentos discriminados,
 * evitando subestimar o custo quando o backup tem apenas a lista de despesas.
 */
export function getObservedFuelCostPerKm(records: EarningRecord[]): number | null {
  let totalDistanceKm = 0;
  let totalFuelCost = 0;

  records.forEach((record) => {
    const distanceKm = Number.isFinite(record.distanceKm) ? Math.max(0, record.distanceKm) : 0;
    const declaredFuel = Number.isFinite(record.fuelCost) ? Math.max(0, record.fuelCost) : 0;
    const structuredFuel = (record.fuelExpenses || []).reduce(
      (sum, expense) => sum + (Number.isFinite(expense.amount) ? Math.max(0, expense.amount) : 0),
      0
    );
    // Registos antigos sem qualquer custo não devem diluir a estimativa real;
    // continuam válidos para os restantes indicadores do histórico.
    if (distanceKm <= 0 || Math.max(declaredFuel, structuredFuel) <= 0) return;
    totalDistanceKm += distanceKm;
    totalFuelCost += Math.max(declaredFuel, structuredFuel);
  });

  if (totalDistanceKm <= 0 || totalFuelCost <= 0) return null;
  return Number((totalFuelCost / totalDistanceKm).toFixed(3));
}

/**
 * Calcula o ganho líquido de um registo individual
 */
export function calculateNetEarnings(
  grossEarnings: number,
  tips: number,
  bonuses: number,
  fuelCost: number,
  commissionCost: number,
  otherExpenses: number,
  tollsReimbursed = 0,
  taxCost = 0
): number {
  const safe = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value as number) : 0;
  const totalIncome = safe(grossEarnings) + safe(tips) + safe(bonuses) + safe(tollsReimbursed);
  const totalCost = safe(fuelCost) + safe(commissionCost) + safe(otherExpenses) + safe(taxCost);
  return Number((totalIncome - totalCost).toFixed(2));
}

export interface ActiveTripCalculationInput {
  totalDistanceKm: number;
  startDistanceKm: number;
  currentEarnings: number;
  startEarnings: number;
  trackedDurationSeconds: number;
  startedAt: number;
  now: number;
  costPerKm: number;
}

export interface ActiveTripCalculation {
  distanceKm: number;
  durationSeconds: number;
  grossEarnings: number;
  fuelCost: number;
  netEarnings: number;
}

/**
 * Calcula os valores finais da viagem com as mesmas fontes usadas no cockpit.
 * O ganho é a diferença do acumulado, evitando uma segunda fórmula divergente.
 */
export function calculateActiveTripMetrics(input: ActiveTripCalculationInput): ActiveTripCalculation {
  const safe = (value: number) => Number.isFinite(value) ? value : 0;
  const distanceKm = Math.max(0, Number((safe(input.totalDistanceKm) - safe(input.startDistanceKm)).toFixed(2)));
  const elapsedSeconds = Math.max(0, Math.floor((safe(input.now) - safe(input.startedAt)) / 1000));
  const durationSeconds = Math.max(1, Math.floor(safe(input.trackedDurationSeconds)) || elapsedSeconds);
  const grossEarnings = Math.max(0, Number((safe(input.currentEarnings) - safe(input.startEarnings)).toFixed(2)));
  const fuelCost = Math.max(0, Number((distanceKm * Math.max(0, safe(input.costPerKm))).toFixed(2)));
  const netEarnings = Number((grossEarnings - fuelCost).toFixed(2));
  return { distanceKm, durationSeconds, grossEarnings, fuelCost, netEarnings };
}

/**
 * Calcula o total de horas entre duas horas no formato HH:mm
 */
export function calculateHoursBetween(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  if (![startH, startM, endH, endM].every(Number.isFinite)
    || startH < 0 || startH > 23 || endH < 0 || endH > 23
    || startM < 0 || startM > 59 || endM < 0 || endM > 59) return 0;

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  const diffMinutes = endMinutes - startMinutes;
  return Number((diffMinutes / 60).toFixed(2));
}

/**
 * Retorna as horas (0 a 23) cobertas por um turno
 */
export function getHoursCoveredByShift(startTime: string, endTime: string): number[] {
  if (!startTime || !endTime) return [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  if (![startH, startM, endH, endM].every(Number.isFinite)
    || startH < 0 || startH > 23 || endH < 0 || endH > 23
    || startM < 0 || startM > 59 || endM < 0 || endM > 59) return [];

  const hours: number[] = [];
  let current = startH;
  const end = endH < startH ? endH + 24 : endH;

  // Inclui todas as faixas horárias que têm pelo menos um minuto do turno.
  // Isto trata corretamente, por exemplo, 23:30–00:15 (23 e 00).
  const startAbsolute = startH * 60 + startM;
  const endAbsolute = end * 60 + endM;
  const firstHour = Math.floor(startAbsolute / 60);
  const lastHour = Math.floor((endAbsolute - 0.001) / 60);
  current = firstHour;
  while (current <= lastHour) {
    hours.push(current % 24);
    current++;
  }

  return hours;
}

/**
 * Agrega e calcula todo o resumo estatístico do histórico de ganhos incluindo matriz de 24 horas, análise de tempo em vazio e zonas
 */
export function calculateEarningsSummary(
  records: EarningRecord[],
  settings: UserSettings = DEFAULT_SETTINGS
): EarningsSummary {
  const initialPlatformStat = (p: PlatformType): PlatformStat => ({
    platform: p,
    gross: 0,
    net: 0,
    hours: 0,
    passengerHours: 0,
    distanceKm: 0,
    passengerDistanceKm: 0,
    trips: 0,
    avgHourlyRate: 0,
    avgKmRate: 0,
  });

  const platformBreakdown: Record<PlatformType, PlatformStat> = {
    uber: initialPlatformStat('uber'),
    bolt: initialPlatformStat('bolt'),
    freenow: initialPlatformStat('freenow'),
    other: initialPlatformStat('other'),
  };

  let totalGross = 0;
  let totalNet = 0;
  let totalHours = 0;
  let totalPassengerHours = 0;
  let totalDistanceKm = 0;
  let totalPassengerKm = 0;
  let totalEmptyKm = 0;
  let totalTrips = 0;
  let totalExpenses = 0;
  let totalFuelCost = 0;

  const dayOfWeekCount: Record<string, number> = {};
  const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  // Inicializar acumuladores para as 24 horas
  const hourlyAccumulators: Array<{
    totalKm: number;
    totalGross: number;
    totalFuel: number;
    totalNet: number;
    passengerHours: number;
    passengerKm: number;
    count: number;
  }> = Array.from(
    { length: 24 },
    () => ({ totalKm: 0, totalGross: 0, totalFuel: 0, totalNet: 0, passengerHours: 0, passengerKm: 0, count: 0 })
  );

  const vehicleCostKm = getEffectiveVehicleCostPerKm(settings);

  // Mapa de ocupação por data
  const weeklyOccupancy: WeeklyOccupancyStat[] = [];

  records.forEach((rec) => {
    const safe = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value as number) : 0;
    const gross = safe(rec.grossEarnings) + safe(rec.tips) + safe(rec.bonuses) + safe(rec.tollsReimbursed);
    const declaredFuel = Number.isFinite(rec.fuelCost) && rec.fuelCost >= 0 ? rec.fuelCost : safe(rec.distanceKm) * vehicleCostKm;
    const structuredFuel = Array.isArray(rec.fuelExpenses)
      ? rec.fuelExpenses.reduce((sum, expense) => sum + safe(expense?.amount), 0)
      : 0;
    // fuelCost é o total declarado; a lista estruturada serve também para
    // importar backups que só guardaram os abastecimentos discriminados.
    const fuel = Math.max(declaredFuel, structuredFuel);
    const net = calculateNetEarnings(
      rec.grossEarnings,
      rec.tips,
      rec.bonuses,
      fuel,
      rec.commissionCost,
      rec.otherExpenses,
      rec.tollsReimbursed,
      rec.taxCost
    );
    const expenses = fuel + safe(rec.commissionCost) + safe(rec.otherExpenses) + safe(rec.taxCost);
    const hours = safe(rec.totalHours);
    const passHours = Math.min(hours, safe(rec.passengerHours));
    const emptyHours = Math.max(0, Number((hours - passHours).toFixed(1)));
    const km = safe(rec.distanceKm);
    const passKm = Math.min(km, safe(rec.passengerDistanceKm));
    const empKm = Math.min(Math.max(0, km - passKm), safe(rec.emptyDistanceKm));
    const empCost = Number((empKm * vehicleCostKm).toFixed(2));
    const trips = Math.max(0, Math.floor(safe(rec.tripsCount)));

    totalGross += gross;
    totalNet += net;
    totalHours += hours;
    totalPassengerHours += passHours;
    totalDistanceKm += km;
    totalPassengerKm += passKm;
    totalEmptyKm += empKm;
    totalTrips += trips;
    totalExpenses += expenses;
    totalFuelCost += fuel;

    // Adicionar ao relatório semanal
    if (rec.date) {
      const d = new Date(`${rec.date}T12:00:00`);
      const dayLabel = !isNaN(d.getTime())
        ? `${d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })}`
        : rec.date;

      weeklyOccupancy.push({
        dayLabel,
        date: rec.date,
        totalHours: hours,
        passengerHours: passHours,
        emptyHours,
        occupancyRate: hours > 0 ? Math.min(100, Math.round((passHours / hours) * 100)) : 0,
        emptyKm: empKm,
        emptyCost: empCost,
      });
    }

    // Estatísticas por plataforma
    const plat = rec.platform || 'other';
    if (platformBreakdown[plat]) {
      platformBreakdown[plat].gross += gross;
      platformBreakdown[plat].net += net;
      platformBreakdown[plat].hours += hours;
      platformBreakdown[plat].passengerHours += passHours;
      platformBreakdown[plat].distanceKm += km;
      platformBreakdown[plat].passengerDistanceKm += passKm;
      platformBreakdown[plat].trips += trips;
    }

    // Melhor dia da semana
    if (rec.date) {
      const d = new Date(`${rec.date}T12:00:00`);
      if (!isNaN(d.getTime())) {
        const dayName = dayNames[d.getDay()];
        dayOfWeekCount[dayName] = (dayOfWeekCount[dayName] || 0) + gross;
      }
    }

    // Distribuição pelas horas do dia
    const hourlySegments = rec.hourlySegments || [];
    if (hourlySegments.length > 0) {
      const totalSegmentMovingMinutes = hourlySegments.reduce((sum, segment) => sum + Math.max(0, segment.movingMinutes), 0);
      const totalSegmentKm = hourlySegments.reduce((sum, segment) => sum + Math.max(0, segment.km), 0);
      hourlySegments.forEach((seg) => {
        const h = Math.trunc(seg.hour);
        if (h < 0 || h > 23) return;
        const segKm = safe(seg.km);
        const segGross = safe(seg.gross);
        const segFuel = Number.isFinite(seg.fuelCost) && seg.fuelCost >= 0 ? seg.fuelCost : segKm * vehicleCostKm;
        const segNet = Number.isFinite(seg.net) ? seg.net : segGross - segFuel;
        const timeWeight = totalSegmentMovingMinutes > 0
          ? Math.max(0, seg.movingMinutes) / totalSegmentMovingMinutes
          : 1 / hourlySegments.length;
        const distanceWeight = totalSegmentKm > 0
          ? segKm / totalSegmentKm
          : 1 / hourlySegments.length;
        hourlyAccumulators[h].totalKm += segKm;
        hourlyAccumulators[h].totalGross += segGross;
        hourlyAccumulators[h].totalFuel += segFuel;
        hourlyAccumulators[h].totalNet += segNet;
        hourlyAccumulators[h].passengerHours += passHours * timeWeight;
        hourlyAccumulators[h].passengerKm += passKm * distanceWeight;
        hourlyAccumulators[h].count += 1;
      });
    } else {
      const coveredHours = getHoursCoveredByShift(rec.startTime, rec.endTime);
      const hoursCount = coveredHours.length || 1;
      coveredHours.forEach((h) => {
        // Sem segmentos reais, distribuir os valores observados de forma
        // neutra pelas horas cobertas; não inventar procura, km ou ganhos.
        const allocatedGross = gross / hoursCount;
        const allocatedKm = km / hoursCount;
        const allocatedFuel = fuel / hoursCount;
        const allocatedNet = net / hoursCount;

        hourlyAccumulators[h].totalGross += allocatedGross;
        hourlyAccumulators[h].totalKm += allocatedKm;
        hourlyAccumulators[h].totalFuel += allocatedFuel;
        hourlyAccumulators[h].totalNet += allocatedNet;
        hourlyAccumulators[h].passengerHours += passHours / hoursCount;
        hourlyAccumulators[h].passengerKm += passKm / hoursCount;
        hourlyAccumulators[h].count += 1;
      });
    }
  });

  // Calcular médias por plataforma
  (Object.keys(platformBreakdown) as PlatformType[]).forEach((p) => {
    const stat = platformBreakdown[p];
    stat.avgHourlyRate = stat.passengerHours > 0 ? Number((stat.gross / stat.passengerHours).toFixed(2)) : 0;
    stat.avgKmRate = stat.passengerDistanceKm > 0 ? Number((stat.gross / stat.passengerDistanceKm).toFixed(2)) : 0;
  });

  // Média global
  const avgHourlyGross =
    totalPassengerHours > 0
      ? Number((totalGross / totalPassengerHours).toFixed(2))
      : 0;

  const avgHourlyNet =
    totalPassengerHours > 0
      ? Number((totalNet / totalPassengerHours).toFixed(2))
      : 0;

  const avgHourlyKm =
    totalHours > 0
      ? Number((totalDistanceKm / totalHours).toFixed(1))
      : 0;

  const avgKmRate =
    totalPassengerKm > 0
      ? Number((totalGross / totalPassengerKm).toFixed(2))
      : 0;

  const avgNetKmRate =
    totalPassengerKm > 0
      ? Number((totalNet / totalPassengerKm).toFixed(2))
      : 0;

  const avgPerTrip =
    totalTrips > 0 ? Number((totalGross / totalTrips).toFixed(2)) : 0;

  const totalEmptyHours = Math.max(0, Number((totalHours - totalPassengerHours).toFixed(2)));
  const avgOccupancyRate = totalHours > 0 ? Math.min(100, Math.round((totalPassengerHours / totalHours) * 100)) : 0;
  const totalEmptyCost = Number((totalEmptyKm * vehicleCostKm).toFixed(2));

  // Construir a Matriz de 24 Horas
  const hourlyBreakdown: HourlyStat[] = hourlyAccumulators.map((acc, h) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const label = `${pad(h)}:00 - ${pad((h + 1) % 24)}:00`;
    let avgKm = 0;
    let avgEarnings = 0;
    let avgFuelCost = 0;
    let avgNetEarnings = 0;
    let avgHourlyRate = 0;
    let avgNetHourlyRate = 0;
    let avgKmRate = 0;
    let avgNetKmRate = 0;

    if (acc.count > 0) {
      avgKm = Number((acc.totalKm / acc.count).toFixed(1));
      avgEarnings = Number((acc.totalGross / acc.count).toFixed(2));
      avgFuelCost = Number((acc.totalFuel / acc.count).toFixed(2));
      avgNetEarnings = Number((acc.totalNet / acc.count).toFixed(2));

      avgHourlyRate = acc.passengerHours > 0 ? Number((acc.totalGross / acc.passengerHours).toFixed(2)) : 0;
      avgNetHourlyRate = acc.passengerHours > 0
        ? Number((acc.totalNet / acc.passengerHours).toFixed(2))
        : 0;
      avgKmRate = acc.passengerKm > 0 ? Number((acc.totalGross / acc.passengerKm).toFixed(2)) : 0;
      avgNetKmRate = acc.passengerKm > 0
        ? Number((acc.totalNet / acc.passengerKm).toFixed(2))
        : 0;
    } else {
      // Sem amostras não há uma taxa observada para mostrar.
    }

    const isPeakHour = avgHourlyGross > 0 && avgHourlyRate >= avgHourlyGross * 1.15;

    return {
      hour: h,
      label,
      avgKm,
      avgEarnings,
      avgFuelCost,
      avgNetEarnings,
      avgHourlyRate,
      avgNetHourlyRate,
      avgKmRate,
      avgNetKmRate,
      sampleCount: acc.count,
      isPeakHour,
    };
  });

  // Determinar melhor janela horária
  let bestHour = 0;
  let maxHourlyEarnings = 0;
  hourlyBreakdown.forEach((stat) => {
    if (stat.avgHourlyRate > maxHourlyEarnings) {
      maxHourlyEarnings = stat.avgHourlyRate;
      bestHour = stat.hour;
    }
  });

  const bestHourlyWindow = records.length > 0 && hourlyBreakdown.some((stat) => stat.sampleCount > 0 && stat.avgHourlyRate > 0)
    ? `${bestHour.toString().padStart(2, '0')}:00 - ${((bestHour + 3) % 24).toString().padStart(2, '0')}:00`
    : '—';
  const bestHourlyKmRate = bestHourlyWindow !== '—' ? (hourlyBreakdown[bestHour]?.avgKmRate || 0) : 0;

  let bestDay = '—';
  let maxDayEarnings = 0;
  Object.entries(dayOfWeekCount).forEach(([day, val]) => {
    if (val > maxDayEarnings) {
      maxDayEarnings = val;
      bestDay = day;
    }
  });

  let topPlatform: PlatformType = 'other';
  let maxPlatEarnings = 0;
  (Object.keys(platformBreakdown) as PlatformType[]).forEach((p) => {
    if (platformBreakdown[p].gross > maxPlatEarnings) {
      maxPlatEarnings = platformBreakdown[p].gross;
      topPlatform = p;
    }
  });

  return {
    totalGross: Number(totalGross.toFixed(2)),
    totalNet: Number(totalNet.toFixed(2)),
    totalHours: Number(totalHours.toFixed(2)),
    totalPassengerHours: Number(totalPassengerHours.toFixed(2)),
    totalEmptyHours,
    avgOccupancyRate,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    totalPassengerKm: Number(totalPassengerKm.toFixed(2)),
    totalEmptyKm: Number(totalEmptyKm.toFixed(2)),
    totalEmptyCost,
    totalTrips,
    totalExpenses: Number(totalExpenses.toFixed(2)),
    totalFuelCost: Number(totalFuelCost.toFixed(2)),
    avgHourlyGross,
    avgHourlyNet,
    avgHourlyKm,
    avgKmRate,
    avgNetKmRate,
    avgPerTrip,
    platformBreakdown,
    hourlyBreakdown,
    weeklyOccupancy,
    // Não apresentar localizações/esperas inventadas como se fossem dados reais.
    hotspotZones: [],
    bestHourlyWindow,
    bestHourlyKmRate,
    bestDayOfWeek: bestDay,
    topPlatform,
  };
}
