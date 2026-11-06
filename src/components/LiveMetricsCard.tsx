import React, { lazy, Suspense, useState } from 'react';
import { ShiftSession } from '../types/session';
import { EarningsSummary, PlatformType, UserSettings } from '../types/earnings';
import { formatCurrency, formatDistance, formatExpense, formatSecondsToDigital } from '../utils/formatters';
import { getEffectiveVehicleCostPerKm } from '../utils/calculations';
import { useTrafficHotspotAdvisor } from '../hooks/useTrafficHotspotAdvisor';
import {
  Clock,
  Zap,
  Fuel,
  Users,
  Gauge,
  Play,
  Square,
  Pause,
  RotateCcw,
  Navigation,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';

interface LiveMetricsCardProps {
  session: ShiftSession;
  summary: EarningsSummary;
  settings: UserSettings;
  isSessionOwnerDevice?: boolean;
  isLight?: boolean;
  onStartShift: (initialPlatform?: PlatformType) => void;
  onPauseShift: () => void;
  onResumeShift: () => void;
  onFinishShift: () => void;
  onStartTrip: (platform: PlatformType) => void;
  onFinishTrip: () => void;
  onCancelTrip?: () => void;
}

interface PlatformLiveMetrics {
  distanceKm: number;
  passengerSeconds: number;
  grossEarnings: number;
  fuelCost: number;
}

const AircraftSpeedometer = lazy(() => import('./AircraftSpeedometer'));

export const LiveMetricsCard: React.FC<LiveMetricsCardProps> = ({
  session,
  summary,
  settings,
  isSessionOwnerDevice = true,
  isLight = false,
  onStartShift,
  onPauseShift,
  onResumeShift,
  onFinishShift,
  onStartTrip,
  onFinishTrip,
  onCancelTrip,
}) => {
  // Modais de Edição Rápida
  const [confirmFinishPlatform, setConfirmFinishPlatform] = useState<PlatformType | null>(null);

  // Modo de Privacidade para Ocultar Ganhos
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('driverwise_privacy_mode') === 'true';
    } catch {
      return false;
    }
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('driverwise_privacy_mode', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const isShiftActive = session.state === 'active';
  const isShiftPaused = session.state === 'paused';
  const isInShift = isShiftActive || isShiftPaused;
  const isMoving = session.drivingStatus === 'moving';
  const pendingRouteGapCount = session.pendingRouteGaps?.length || 0;

  // Cálculos de Ganhos do Turno
  const costPerKm = getEffectiveVehicleCostPerKm(settings);
  const tripEarningsSum = session.trips && session.trips.length > 0
    ? Number(session.trips.reduce((acc, t) => acc + (t.estimatedEarnings || 0), 0).toFixed(2))
    : 0;
  const currentEarnings = Math.max(session.estimatedEarnings || 0, tripEarningsSum);

  const tripFuelSum = session.trips && session.trips.length > 0
    ? Number(session.trips.reduce((acc, t) => acc + (t.fuelCost !== undefined ? t.fuelCost : t.distanceKm * costPerKm), 0).toFixed(2))
    : 0;
  const manualFuelCost = (session.fuelExpenses || []).reduce((sum, expense) => sum + expense.amount, 0);
  const calculatedLiveFuelCost = Number((Math.max(Number((session.totalDistanceKm * costPerKm).toFixed(2)), tripFuelSum) + manualFuelCost).toFixed(2));
  const currentFuelCost = isInShift
    ? Math.max(Number((session.estimatedFuelCost || 0).toFixed(2)), calculatedLiveFuelCost)
    : summary.totalFuelCost;
  const currentNetEarnings = Number((currentEarnings - currentFuelCost).toFixed(2));

  // Os indicadores de rentabilidade são úteis apenas no tempo e distância
  // efetivamente faturáveis. O combustível continua a usar os quilómetros
  // totais, incluindo deslocações em vazio.
  const displayedGross = isInShift ? currentEarnings : summary.totalGross;
  const displayedNet = isInShift ? currentNetEarnings : summary.totalNet;
  const displayedPassengerHours = isInShift
    ? Math.max(0, session.passengerDurationSeconds / 3600)
    : summary.totalPassengerHours;
  const displayedPassengerKm = isInShift ? Math.max(0, session.passengerDistanceKm) : summary.totalPassengerKm;
  const displayedGrossHourly = displayedPassengerHours > 0
    ? Number((displayedGross / displayedPassengerHours).toFixed(2))
    : 0;
  const displayedNetHourly = displayedPassengerHours > 0
    ? Number((displayedNet / displayedPassengerHours).toFixed(2))
    : 0;
  const displayedGrossKmRate = displayedPassengerKm > 0
    ? Number((displayedGross / displayedPassengerKm).toFixed(2))
    : 0;
  const displayedNetKmRate = displayedPassengerKm > 0
    ? Number((displayedNet / displayedPassengerKm).toFixed(2))
    : 0;

  // Taxa de Ocupação (% tempo com passageiro)
  const occupancyRate =
    session.activeDurationSeconds > 0
      ? Math.round((session.passengerDurationSeconds / session.activeDurationSeconds) * 100)
      : 0;

  // Alerta de Desperdício em Vazio (> 35% de km sem passageiro com mais de 10km rodados)
  const emptyDistancePct =
    session.totalDistanceKm > 10
      ? Math.round((session.emptyDistanceKm / session.totalDistanceKm) * 100)
      : 0;
  const isHighDeadheadWaste = isShiftActive && emptyDistancePct >= 35 && session.emptyDistanceKm >= 8;

  // Parâmetros do Velocímetro Circular
  const MAX_SPEED = 180;
  const currentSpeed = Math.round(session.currentSpeedKmh || 0);
  const clampedSpeed = Math.min(MAX_SPEED, Math.max(0, currentSpeed));

  const CX = 300;
  const CY = 185;
  const RADIUS = 145;
  const needleAngle = 135 + (clampedSpeed / MAX_SPEED) * 270;
  const isFlameSpeed = currentSpeed >= 80;

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const rad = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: Number((centerX + radius * Math.cos(rad)).toFixed(2)),
      y: Number((centerY + radius * Math.sin(rad)).toFixed(2)),
    };
  };

  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, radius, startAngle);
    const end = polarToCartesian(x, y, radius, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  const baseTrackPath = describeArc(CX, CY, RADIUS, 135, 405);
  const activeTrackPath = clampedSpeed > 0 ? describeArc(CX, CY, RADIUS, 135, needleAngle) : '';

  const speedTicks = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180];
  const minorTicks = [10, 30, 50, 70, 90, 110, 130, 150, 170];

  // Identificação da Faixa Horária Atual
  const currentHour = new Date().getHours();
  const currentHourStat = summary.hourlyBreakdown.find((h) => h.hour === currentHour) || {
    hour: currentHour,
    label: `${currentHour.toString().padStart(2, '0')}:00`,
    avgHourlyRate: 0,
    avgKmRate: 0,
    isPeakHour: false,
  };
  const visibleHourStat = isInShift
    ? currentHourStat
    : { ...currentHourStat, avgHourlyRate: 0, isPeakHour: false };

  // Consultor de Tráfego & Hotspot
  const {
    trafficCondition,
    rollingAvgSpeed,
    topRecommendation,
    isTrafficJamAlert,
  } = useTrafficHotspotAdvisor({
    currentPosition: session.currentPosition,
    currentSpeedKmh: session.currentSpeedKmh,
    isMoving,
    hasPassenger: session.hasPassenger,
    isShiftActive,
  });

  const getPlatformName = (p?: PlatformType | null) => {
    switch (p) {
      case 'uber': return 'Uber';
      case 'bolt': return 'Bolt';
      case 'freenow': return 'FreeNow';
      default: return 'Outra';
    }
  };

  const getPlatformLiveMetrics = (platform: PlatformType): PlatformLiveMetrics => {
    const platformTrips = (session.trips || []).filter((trip) => trip.platform === platform);
    const completed = platformTrips.reduce((metrics, trip) => ({
      distanceKm: metrics.distanceKm + Math.max(0, trip.distanceKm || 0),
      passengerSeconds: metrics.passengerSeconds + Math.max(0, trip.durationSeconds || 0),
      grossEarnings: metrics.grossEarnings + Math.max(0, trip.estimatedEarnings || 0),
      fuelCost: metrics.fuelCost + Math.max(0, trip.fuelCost ?? (trip.distanceKm || 0) * costPerKm),
    }), {
      distanceKm: 0,
      passengerSeconds: 0,
      grossEarnings: 0,
      fuelCost: 0,
    });

    if (session.hasPassenger && session.currentTripPlatform === platform) {
      const currentDistanceKm = Math.max(0, session.totalDistanceKm - session.currentTripStartDistanceKm);
      const currentGrossEarnings = Math.max(0, session.estimatedEarnings - session.currentTripStartEarnings);
      return {
        distanceKm: completed.distanceKm + currentDistanceKm,
        passengerSeconds: completed.passengerSeconds + Math.max(0, session.currentTripDurationSeconds),
        grossEarnings: completed.grossEarnings + currentGrossEarnings,
        fuelCost: completed.fuelCost + currentDistanceKm * costPerKm,
      };
    }

    return completed;
  };

  const renderPlatformButton = (platform: 'uber' | 'bolt') => {
    const isActive = platform === 'uber' ? isUberActive : isBoltActive;
    const metrics = getPlatformLiveMetrics(platform);
    const platformName = platform === 'uber' ? 'UBER' : 'BOLT';
    const buttonLabel = isActive ? 'Em Viagem' : isShiftPaused ? 'Pausado' : 'Iniciar';

    return (
      <div key={platform} className={`flex flex-col items-center justify-center shrink-0 z-10 ${isActive ? 'pt-0.5' : ''}`}>
        {isActive && (
          <span className={`mb-1 text-[9px] sm:text-[10px] uppercase font-black tracking-[0.2em] ${
            platform === 'uber' ? 'text-white' : 'text-emerald-400'
          }`}>
            {platformName}
          </span>
        )}
        <button
          type="button"
          onClick={() => handleCircularPlatformClick(platform)}
          aria-label={`${platformName} ${buttonLabel}`}
          className={isActive
            ? `relative overflow-hidden w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 flex flex-col items-center justify-center shadow-xl cursor-pointer ${
                platform === 'uber'
                  ? 'bg-black border-emerald-400 ring-2 ring-emerald-400/80 shadow-emerald-500/20'
                  : 'bg-emerald-600 border-white ring-2 ring-emerald-300 shadow-emerald-400/30'
              }`
            : `w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 flex flex-col items-center justify-center shadow-lg hover:scale-105 active:scale-95 cursor-pointer ${
                platform === 'uber'
                  ? 'bg-black border-slate-500 hover:border-white'
                  : 'bg-[#10b981] hover:bg-[#059669] border-white/90'
              }`}
          title={isActive
            ? `Clique para finalizar a viagem ${platformName}`
            : isShiftActive
            ? `Clique para iniciar uma viagem ${platformName}`
            : `Clique para iniciar o turno na ${platformName}`}
        >
          {isActive ? (
            <>
              <span className="text-[7px] uppercase font-black tracking-widest text-emerald-300 mb-0.5">ATIVA</span>
              <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5 px-1.5 text-center">
                <div className="min-w-0">
                  <span className="block text-[6px] uppercase font-bold text-white/70">Km</span>
                  <span className="block text-[9px] sm:text-[10px] font-black font-mono text-white truncate">
                    {isPrivacyMode ? '•••' : formatDistance(metrics.distanceKm)}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-[6px] uppercase font-bold text-white/70">Tempo</span>
                  <span className="block text-[9px] sm:text-[10px] font-black font-mono text-white truncate">
                    {isPrivacyMode ? '••:••' : formatSecondsToDigital(metrics.passengerSeconds)}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-[6px] uppercase font-bold text-white/70">Valor</span>
                  <span className="block text-[9px] sm:text-[10px] font-black font-mono text-white truncate">
                    {isPrivacyMode ? '••••' : formatCurrency(metrics.grossEarnings)}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-[6px] uppercase font-bold text-white/70">Comb.</span>
                  <span className="block text-[9px] sm:text-[10px] font-black font-mono text-white truncate">
                    {isPrivacyMode ? '••••' : formatExpense(metrics.fuelCost)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs sm:text-sm font-black tracking-wider text-white uppercase">
                {platformName}
              </span>
              <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wider mt-0.5 flex items-center gap-1 ${
                platform === 'uber' ? 'text-slate-300' : 'text-emerald-100'
              }`}>
                <span className={`w-1 h-1 rounded-full ${platform === 'uber' ? 'bg-white' : 'bg-emerald-200'}`} />
                {buttonLabel}
              </span>
            </>
          )}
        </button>
        {!isActive && (
          <span className={`text-[9px] font-mono mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            {platformName === 'UBER' ? 'Uber TVDE' : 'Bolt TVDE'}
          </span>
        )}
      </div>
    );
  };

  const handleCircularPlatformClick = (platform: PlatformType) => {
    if (session.hasPassenger && session.currentTripPlatform === platform) {
      // Abre o modal de confirmação para prevenir paragens acidentais
      setConfirmFinishPlatform(platform);
    } else {
      onStartTrip(platform);
    }
  };

  const isUberActive = session.hasPassenger && session.currentTripPlatform === 'uber';
  const isBoltActive = session.hasPassenger && session.currentTripPlatform === 'bolt';

  return (
    <div className={`relative w-full rounded-3xl p-4 sm:p-5 space-y-4 border transition-all ${
      isLight
        ? 'bg-white border-slate-200 text-slate-900 shadow-xl shadow-slate-200/50'
        : 'bg-slate-950/95 border-slate-800 text-white shadow-2xl'
    }`}>
      {/* Alerta Consultor de Tráfego & Hotspot */}
      {isTrafficJamAlert && topRecommendation && (
        <div className={`p-2.5 rounded-2xl flex items-center justify-between gap-3 text-xs border ${
          isLight
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <div>
              <span className={`font-bold ${isLight ? 'text-rose-900' : 'text-white'}`}>Alerta de Tráfego Intenso ({rollingAvgSpeed} km/h):</span>{' '}
              <span>
                Evite rodar em vazio. Ponto sugerido:{' '}
                <b className="text-emerald-500">{topRecommendation.name}</b> (~{topRecommendation.estimatedDriveTimeMin} min, {topRecommendation.distanceKm} km).
              </span>
            </div>
          </div>
        </div>
      )}

      {isInShift && pendingRouteGapCount > 0 && (
        <div role="status" className={`p-2.5 rounded-2xl flex items-center gap-2.5 text-xs border ${
          isLight
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
        }`}>
          <Navigation className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            A aguardar rota viária pela internet ({pendingRouteGapCount} intervalo{pendingRouteGapCount === 1 ? '' : 's'}). Estes km ainda não foram contabilizados.
          </span>
        </div>
      )}

      {/* 1. TOPO: FAIXA HORÁRIA + GPS / TRÁFEGO + TEMPO TOTAL E PRIVACIDADE */}
      <div className={`flex flex-row items-center justify-between gap-3 border-b pb-3.5 pt-1.5 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        {/* Canto Superior Esquerdo: Faixa Horária & Indicadores de GPS e Tráfego */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border ${
            isLight
              ? 'bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-slate-900/90 border-slate-800 text-slate-300'
          }`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className={`font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Faixa {visibleHourStat.label}:</span>
            <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {isPrivacyMode ? '••,•• €/h' : `${formatCurrency(visibleHourStat.avgHourlyRate)}/h`}
            </span>
            {visibleHourStat.isPeakHour && (
              <span className="text-amber-500 font-semibold flex items-center gap-0.5 ml-1">
                <Zap className="w-3 h-3 fill-current" /> Pico
              </span>
            )}
          </div>

          {/* Indicador de GPS Ativo / Modo Observador */}
          {!isSessionOwnerDevice && isShiftActive ? (
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium border ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-amber-950/40 border-amber-800 text-amber-400'
            }`} title="Turno a decorrer noutro dispositivo. Este PC está apenas a observar os dados.">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="whitespace-nowrap">Modo Observador (Remoto)</span>
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium border ${
              isLight
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-900 border-slate-800 text-emerald-400'
            }`}>
              <Navigation className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="whitespace-nowrap">GPS Ativo</span>
            </div>
          )}

          {/* Indicador de Fluidez de Tráfego */}
          {isShiftActive && (
            <div
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium border transition ${
                trafficCondition === 'fluid'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : trafficCondition === 'moderate'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
              }`}
              title={`Velocidade Média: ${rollingAvgSpeed} km/h`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  trafficCondition === 'fluid'
                    ? 'bg-emerald-500'
                    : trafficCondition === 'moderate'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />
              <span className="whitespace-nowrap">
                {trafficCondition === 'fluid' && 'Fluido'}
                {trafficCondition === 'moderate' && 'Moderado'}
                {trafficCondition === 'heavy_traffic' && 'Pára-Arranca'}
              </span>
            </div>
          )}
        </div>

        {/* CANTO SUPERIOR DIREITO: TEMPO TOTAL DO TURNO + BOTÃO DE PRIVACIDADE */}
        <div className="flex items-center justify-end gap-3 shrink-0">
          <div className="text-right flex flex-col items-end whitespace-nowrap">
            <span className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 mb-0.5 ${
              isLight ? 'text-slate-500' : 'text-slate-500'
            }`}>
              <Clock className="w-3 h-3 text-sky-500" />
              Tempo Total
            </span>
            <div className={`text-lg sm:text-xl font-bold font-mono tracking-tight ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              {formatSecondsToDigital(session.activeDurationSeconds)}
            </div>
            <div className={`text-[10px] font-mono flex items-center gap-1.5 ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              <span>{formatSecondsToDigital(session.passengerDurationSeconds)} útil</span>
              <span className="text-emerald-500 font-bold">({occupancyRate}%)</span>
            </div>
          </div>

          {/* BOTÃO DO OLHO PARA OCULTAR GANHOS */}
          <button
            onClick={togglePrivacyMode}
            className={`p-2 rounded-2xl border transition-all shadow-sm shrink-0 ${
              isPrivacyMode
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 ring-1 ring-amber-500/40'
                : isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600 hover:text-slate-900'
                : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={isPrivacyMode ? 'Mostrar valores' : 'Ocultar valores para passageiros'}
          >
            {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ALERTA DE DESPERDÍCIO EM VAZIO */}
      {isHighDeadheadWaste && (
        <div className={`border rounded-2xl p-2.5 flex items-center justify-between gap-3 text-xs ${
          isLight
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className={`font-bold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>
                Alerta de Desperdício em Vazio ({emptyDistancePct}% dos Km):
              </span>{' '}
              <span className="text-[11px]">
                Imobilize o veículo num Hotspot TVDE estratégico para poupar combustível.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. O VELOCÍMETRO CENTRAL FLANQUEADO PELOS BOTÕES CIRCULARES DA UBER (ESQ) E BOLT (DIR) */}
      <div className="relative w-full max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-4 py-2">
        {/* BOTÃO UBER / MÉTRICAS DA VIAGEM ATIVA */}
        {renderPlatformButton('uber')}

        {/* CENTRO: O GRANDE VELOCÍMETRO CALIBRADO */}
        <div className="relative flex-1 max-w-[420px] flex flex-col items-center justify-center">
          {/* Fundo Dinâmico de Velocidade Leve com Animação de Borda em Chamas > 80 km/h */}
          <div
            className={`absolute inset-0 rounded-3xl transition-all duration-300 pointer-events-none ${
              isFlameSpeed
                ? 'bg-gradient-to-b from-orange-600/25 via-red-600/15 to-transparent border-2 border-orange-500 ring-4 ring-orange-500/50 shadow-[0_0_35px_rgba(249,115,22,0.6)] animate-pulse'
                : currentSpeed > 60
                ? 'bg-gradient-to-b from-amber-500/20 via-orange-500/10 to-transparent border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                : currentSpeed > 30
                ? 'bg-gradient-to-b from-cyan-500/15 via-sky-500/10 to-transparent border border-cyan-500/30'
                : currentSpeed > 0
                ? 'bg-gradient-to-b from-emerald-500/10 via-emerald-950/20 to-transparent border border-emerald-500/20'
                : isLight
                ? 'bg-slate-50/80 border border-slate-200'
                : 'bg-slate-900/40 border border-slate-800/60'
            }`}
          />

          {/* Indicadores de distância, posicionados nos cantos do contentor do velocímetro */}
          <div className={`absolute ${settings.aircraftSpeedometerEnabled ? 'top-1' : 'top-6'} left-2 z-10 flex flex-col items-start leading-tight pointer-events-none ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}>
            <span className="text-[9px] uppercase font-bold tracking-wider">Km c/ passageiro</span>
            <span className="text-sm font-black font-mono text-emerald-500">
              {formatDistance(isInShift ? session.passengerDistanceKm : 0)}
            </span>
          </div>
          <div className={`absolute ${settings.aircraftSpeedometerEnabled ? 'top-1' : 'top-6'} right-2 z-10 flex flex-col items-end leading-tight pointer-events-none ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}>
            <span className="text-[9px] uppercase font-bold tracking-wider">Km em vazio</span>
            <span className="text-sm font-black font-mono text-amber-500">
              {formatDistance(isInShift ? session.emptyDistanceKm : 0)}
            </span>
          </div>

          {/* Mostrador clássico ou modo avião 3D opcional */}
          {settings.aircraftSpeedometerEnabled ? (
            <Suspense
              fallback={(
                <div className="relative w-full aspect-[16/8] flex flex-col items-center justify-center gap-1">
                  <span className="text-4xl" aria-hidden="true">✈️</span>
                  <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono">A carregar velocímetro 3D</span>
                  <span className={`text-xs font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Km totais: {formatDistance(isInShift ? session.totalDistanceKm : 0)}
                  </span>
                </div>
              )}
            >
              <AircraftSpeedometer
                speedKmh={currentSpeed}
                isMoving={isMoving}
                isShiftActive={isShiftActive}
                isShiftPaused={isShiftPaused}
                hasPassenger={session.hasPassenger}
                totalDistanceKm={isInShift ? session.totalDistanceKm : 0}
                heading={session.currentPosition.heading}
                isLight={isLight}
              />
            </Suspense>
          ) : (
          /* Mostrador SVG calibrado */
          <div className="relative w-full aspect-[16/8] select-none">
            <svg className="w-full h-full" viewBox="0 0 600 370">
              <defs>
                <linearGradient id="speedArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="65%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <linearGradient id="speedNeedleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#f87171" />
                </linearGradient>
              </defs>

              {/* Trilho Base do Mostrador */}
              <path
                d={baseTrackPath}
                fill="none"
                stroke={isLight ? '#e2e8f0' : '#1e293b'}
                strokeWidth="12"
                strokeLinecap="round"
              />

              {/* Camada de Brilho de Vetor Leve */}
              {clampedSpeed > 0 && (
                <path
                  d={activeTrackPath}
                  fill="none"
                  stroke="url(#speedArcGrad)"
                  strokeWidth="18"
                  strokeOpacity="0.3"
                  strokeLinecap="round"
                />
              )}

              {/* Trilho Ativo Iluminado de Velocidade */}
              {clampedSpeed > 0 && (
                <path
                  d={activeTrackPath}
                  fill="none"
                  stroke="url(#speedArcGrad)"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
              )}

              {/* Ticks Maiores com Números (0 a 180 km/h) */}
              {speedTicks.map((val) => {
                const tickAngle = 135 + (val / MAX_SPEED) * 270;
                const pInner = polarToCartesian(CX, CY, RADIUS - 18, tickAngle);
                const pOuter = polarToCartesian(CX, CY, RADIUS - 6, tickAngle);
                const pText = polarToCartesian(CX, CY, RADIUS - 35, tickAngle);
                const isPassed = clampedSpeed >= val;

                return (
                  <g key={val}>
                    <line
                      x1={pInner.x}
                      y1={pInner.y}
                      x2={pOuter.x}
                      y2={pOuter.y}
                      stroke={isLight ? (isPassed ? '#0f172a' : '#94a3b8') : (isPassed ? '#f8fafc' : '#475569')}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <text
                      x={pText.x}
                      y={pText.y}
                      fill={isLight ? (isPassed ? '#0f172a' : '#64748b') : (isPassed ? '#ffffff' : '#64748b')}
                      fontSize="13"
                      fontWeight="800"
                      fontFamily="Rajdhani, sans-serif"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Ticks Menores */}
              {minorTicks.map((val) => {
                const tickAngle = 135 + (val / MAX_SPEED) * 270;
                const pInner = polarToCartesian(CX, CY, RADIUS - 12, tickAngle);
                const pOuter = polarToCartesian(CX, CY, RADIUS - 6, tickAngle);
                return (
                  <line
                    key={val}
                    x1={pInner.x}
                    y1={pInner.y}
                    x2={pOuter.x}
                    y2={pOuter.y}
                    stroke={isLight ? '#cbd5e1' : '#334155'}
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* A AGULHA DO VELOCÍMETRO */}
              <g
                transform={`rotate(${needleAngle}, ${CX}, ${CY})`}
                style={{ transition: 'transform 0.15s ease-out' }}
              >
                <polygon
                  points={`${CX - 6},${CY - 4} ${CX - 6},${CY + 4} ${CX + RADIUS - 16},${CY + 2} ${CX + RADIUS - 16},${CY - 2}`}
                  fill="url(#speedNeedleGrad)"
                />
                <polygon
                  points={`${CX + RADIUS - 18},${CY - 3.5} ${CX + RADIUS - 18},${CY + 3.5} ${CX + RADIUS - 4},${CY}`}
                  fill="#ef4444"
                />
              </g>

              {/* Hub Central Metalizado */}
              <circle cx={CX} cy={CY} r="20" fill={isLight ? '#ffffff' : '#090d16'} stroke={isLight ? '#94a3b8' : '#334155'} strokeWidth="3.5" />
              <circle cx={CX} cy={CY} r="7" fill="#10b981" />
            </svg>

            {/* LEITURA DIGITAL DA VELOCIDADE NO CENTRO */}
            <div className="absolute top-[22%] left-1/2 -translate-x-1/2 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className={`text-4xl sm:text-5xl font-black font-speed tracking-tight drop-shadow-md ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {currentSpeed}
              </span>
              <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500 font-mono -mt-1">
                KM / H
              </span>
            </div>

            {/* Quilómetros totais no velocímetro, imediatamente acima do estado */}
            <div className={`absolute top-[60%] left-1/2 -translate-x-1/2 flex flex-col items-center justify-center text-center pointer-events-none leading-tight ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              <span className="text-[9px] uppercase font-bold tracking-wider">Km totais</span>
              <span className={`text-sm font-black font-mono ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                {formatDistance(isInShift ? session.totalDistanceKm : 0)}
              </span>
            </div>

            {/* BADGE INFERIOR DE ESTADO DO TURNO: VERMELHO EM VAZIO E VERDE EM VIAGEM */}
            <div className="absolute top-[76%] left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
              <span className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full border shadow-sm flex items-center gap-1.5 ${
                !isShiftActive
                  ? isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-500'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                  : session.hasPassenger
                  ? isLight
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-emerald-200/50'
                    : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 shadow-emerald-500/20'
                  : isLight
                  ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-rose-200/50'
                  : 'bg-rose-950/80 border-rose-500/50 text-rose-400 shadow-rose-500/20'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  !isShiftActive
                    ? 'bg-slate-400'
                    : session.hasPassenger
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500 animate-pulse'
                }`} />
                <span>
                  {!isShiftActive
                    ? 'Turno Parado'
                    : session.hasPassenger
                    ? 'Viagem Ativa'
                    : 'Em Vazio'}
                </span>
              </span>
            </div>
          </div>
          )}
        </div>

        {/* BOTÃO BOLT / MÉTRICAS DA VIAGEM ATIVA */}
        {renderPlatformButton('bolt')}
      </div>

      {/* 3. MÉTRICAS FINANCEIRAS APENAS DO TURNO CORRENTE */}
      {isInShift && <div className={`w-full max-w-2xl mx-auto rounded-2xl p-3.5 grid grid-cols-2 sm:grid-cols-4 divide-x text-center gap-y-2 shadow-xl border ${
        isLight
          ? 'bg-slate-50 border-slate-200 divide-slate-200 text-slate-900 shadow-slate-200/50'
          : 'bg-slate-900 border-slate-800 divide-slate-800 text-white'
      }`}>
        <div className="px-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 flex items-center justify-center gap-1">
            <Gauge className="w-3 h-3 text-emerald-500" />
            {isInShift ? 'Lucro do Turno' : 'Lucro Acumulado'}
          </span>
          <span className="text-lg sm:text-xl font-black font-mono text-emerald-500 block mt-0.5">
            {isPrivacyMode ? '•••• €' : formatCurrency(displayedNet)}
          </span>
        </div>

        <div className="px-2">
          <span className={`text-[10px] uppercase font-bold tracking-wider block ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}>
            {isInShift ? 'Bruto do Turno' : 'Bruto Acumulado'}
          </span>
          <span className={`text-sm sm:text-base font-bold font-mono block mt-0.5 ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            {isPrivacyMode ? '•••• €' : formatCurrency(displayedGross)}
          </span>
        </div>

        <div className="px-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-sky-500 flex items-center justify-center gap-1">
            <Zap className="w-3 h-3 text-sky-500" />
            {isInShift ? 'Média útil do turno' : 'Média Horária útil'}
          </span>
          <span className="text-sm sm:text-base font-bold font-mono text-sky-500 block mt-0.5">
            {isPrivacyMode ? '••,•• €/h' : `${formatCurrency(displayedNetHourly)}/h`}
          </span>
          <span className={`block text-[9px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
            {isPrivacyMode
              ? 'Bruto ••,•• €/h · ••,•• €/km'
              : `Bruto ${formatCurrency(displayedGrossHourly)}/h · ${formatCurrency(displayedGrossKmRate)}/km bruto · ${formatCurrency(displayedNetKmRate)}/km líq.`}
          </span>
        </div>

        <div className="px-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500 flex items-center justify-center gap-1">
            <Fuel className="w-3 h-3 text-rose-500" />
            {isInShift ? 'Comb. Turno' : 'Comb. Total'}
          </span>
          <span className="text-sm sm:text-base font-bold font-mono text-rose-500 block mt-0.5">
            {formatExpense(currentFuelCost)}
          </span>
        </div>
      </div>}

      {/* 4. BOTÃO DE INICIAR TURNO / CONTROLOS DE VIAGEM */}
      <div className="w-full max-w-2xl mx-auto pt-1">
        {!isShiftActive && !isShiftPaused ? (
          /* QUANDO PARADO: BOTÃO DIRETO DE INICIAR TURNO */
          <button
            onClick={() => onStartShift()}
            disabled={!isSessionOwnerDevice && isShiftActive}
            className="w-full py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>INICIAR TURNO DE CONDUÇÃO</span>
          </button>
        ) : (
          /* QUANDO O TURNO ESTÁ ATIVO / PAUSADO */
          <div className="space-y-2">
            {session.hasPassenger && (
              /* QUANDO ESTÁ COM PASSAGEIRO: BOTÃO PROEMINENTE DE FINALIZAR VIAGEM */
              <button
                onClick={onFinishTrip}
                disabled={!isSessionOwnerDevice}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99] ring-2 ring-emerald-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Users className="w-4 h-4" />
                <span>FINALIZAR VIAGEM ATIVA ({getPlatformName(session.currentTripPlatform).toUpperCase()})</span>
              </button>
            )}

            {/* BOTÕES SECUNDÁRIOS DE TURNO (PAUSAR / CONCLUIR) */}
            <div className="flex items-center gap-2">
              {isShiftActive ? (
                <button
                  onClick={onPauseShift}
                  disabled={!isSessionOwnerDevice}
                  className={`flex-1 py-2.5 px-3 rounded-xl border font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                      : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Pause className="w-3.5 h-3.5 text-amber-500" />
                  <span>Pausar Turno</span>
                </button>
              ) : (
                <button
                  onClick={onResumeShift}
                  disabled={!isSessionOwnerDevice}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-600 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Retomar Turno</span>
                </button>
              )}

              <button
                onClick={onFinishShift}
                disabled={!isSessionOwnerDevice}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-500 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Square className="w-3.5 h-3.5 text-rose-500" />
                <span>Concluir Turno</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Confirmação para Finalizar ou Cancelar Viagem */}
      {confirmFinishPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className={`border rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-left ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900'
              : 'bg-slate-950 border-slate-800 text-white'
          }`}>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <Navigation className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold">
                Viagem {getPlatformName(confirmFinishPlatform)}
              </h4>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Escolha o que pretende fazer com a viagem em curso:
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmFinishPlatform(null);
                  onFinishTrip();
                }}
                className="aspect-square w-full max-w-[138px] justify-self-center rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition shadow-xl shadow-emerald-500/25 flex flex-col items-center justify-center gap-2 px-3 active:scale-95"
              >
                <Check className="h-7 w-7" strokeWidth={3} />
                <span className="max-w-[88px] leading-tight">Guardar viagem</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setConfirmFinishPlatform(null);
                  if (onCancelTrip) {
                    onCancelTrip();
                  }
                }}
                className="aspect-square w-full max-w-[138px] justify-self-center rounded-full bg-rose-500/15 hover:bg-rose-500/25 border-2 border-rose-500/50 text-rose-500 text-xs font-black transition flex flex-col items-center justify-center gap-2 px-3 active:scale-95"
              >
                <X className="h-7 w-7" strokeWidth={3} />
                <span className="max-w-[92px] leading-tight">Cancelar viagem</span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmFinishPlatform(null)}
                className={`col-span-2 w-full py-2.5 px-3 rounded-xl border text-xs font-semibold transition ${
                  isLight
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Continuar em Viagem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
