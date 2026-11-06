import React, { useState, useMemo } from 'react';
import { EarningRecord, EarningsSummary, UserSettings, HotspotZone } from '../types/earnings';
import { calculateEarningsSummary } from '../utils/calculations';
import { formatCurrency, formatDistance, formatExpense } from '../utils/formatters';
import {
  Clock,
  Award,
  Zap,
  Activity,
  Timer,
  Plane,
  Building2,
  GlassWater,
  Sun,
  Train,
  MapPin,
  BarChart3,
  Calendar,
  Layers,
  Fuel,
  Percent,
  TrendingUp,
} from 'lucide-react';

interface AnalyticsSummaryProps {
  records: EarningRecord[];
  settings: UserSettings;
}

type PeriodFilter = 'all' | 'today' | 'week' | 'month' | '30days';
type PlatformFilter = 'all' | 'uber' | 'bolt' | 'freenow' | 'other';

export const AnalyticsSummary: React.FC<AnalyticsSummaryProps> = ({ records, settings }) => {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'matrix24h' | 'deadhead' | 'hotspots'>('overview');
  const [hourlyViewMode, setHourlyViewMode] = useState<'net' | 'gross' | 'km'>('net');
  const [selectedZoneCategory, setSelectedZoneCategory] = useState<'all' | 'airport' | 'corporate' | 'nightlife' | 'coastal'>('all');

  // 1. Filtragem Dinâmica dos Registos por Período e Plataforma
  const filteredRecords = useMemo(() => {
    const now = new Date();
    const toLocalDate = (value: Date) => `${value.getFullYear()}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`;
    const todayStr = toLocalDate(now);

    // Início da semana (Segunda-feira)
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - diffToMonday);
    const mondayStr = toLocalDate(mondayDate);

    // Início do mês
    const monthStartStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;

    // 30 dias atrás
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysStr = toLocalDate(thirtyDaysAgo);

    return records.filter((rec) => {
      // Filtro de Plataforma
      if (platformFilter !== 'all' && rec.platform !== platformFilter) {
        return false;
      }

      // Filtro de Período
      if (periodFilter === 'today') {
        return rec.date === todayStr;
      }
      if (periodFilter === 'week') {
        return rec.date >= mondayStr && rec.date <= todayStr;
      }
      if (periodFilter === 'month') {
        return rec.date >= monthStartStr && rec.date <= todayStr;
      }
      if (periodFilter === '30days') {
        return rec.date >= thirtyDaysStr && rec.date <= todayStr;
      }

      return true;
    });
  }, [records, periodFilter, platformFilter]);

  // 2. Resumo Estatístico Rigorosamente Recalculado
  const summary: EarningsSummary = useMemo(() => {
    return calculateEarningsSummary(filteredRecords, settings);
  }, [filteredRecords, settings]);

  const platforms = [
    { id: 'uber', name: 'Uber', color: 'bg-black border-slate-700 text-white', barColor: 'bg-white' },
    { id: 'bolt', name: 'Bolt', color: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300', barColor: 'bg-emerald-400' },
    { id: 'freenow', name: 'FreeNow', color: 'bg-rose-950/80 border-rose-500/50 text-rose-300', barColor: 'bg-rose-400' },
    { id: 'other', name: 'Outras', color: 'bg-slate-900 border-slate-800 text-slate-300', barColor: 'bg-sky-400' },
  ] as const;

  const maxPlatformGross = Math.max(
    ...platforms.map((p) => summary.platformBreakdown[p.id]?.gross || 0),
    1
  );

  const maxHourlyGross = Math.max(
    ...(summary.hourlyBreakdown?.map((h) => h.avgHourlyRate) || [0]),
    1
  );

  const maxHourlyNet = Math.max(
    ...(summary.hourlyBreakdown?.map((h) => h.avgNetHourlyRate) || [0]),
    1
  );

  const maxHourlyKm = Math.max(
    ...(summary.hourlyBreakdown?.map((h) => h.avgKm) || [0]),
    1
  );

  const renderZoneIcon = (type: HotspotZone['iconType']) => {
    switch (type) {
      case 'airport':
        return <Plane className="w-4 h-4 text-sky-400" />;
      case 'corporate':
        return <Building2 className="w-4 h-4 text-indigo-400" />;
      case 'nightlife':
        return <GlassWater className="w-4 h-4 text-amber-400" />;
      case 'coastal':
        return <Sun className="w-4 h-4 text-yellow-400" />;
      case 'transit':
        return <Train className="w-4 h-4 text-emerald-400" />;
      default:
        return <MapPin className="w-4 h-4 text-emerald-400" />;
    }
  };

  const filteredZones = summary.hotspotZones?.filter((z) => {
    if (selectedZoneCategory === 'all') return true;
    return z.iconType === selectedZoneCategory;
  }) || [];

  // Margem Líquida Percentual
  const netMarginPct = summary.totalGross > 0 ? Math.round((summary.totalNet / summary.totalGross) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* 1. BARRA SUPERIOR DE FILTROS (PERÍODO & PLATAFORMA) */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-3.5 sm:p-4.5 space-y-3 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <span>Centro de Análise & Inteligência</span>
            </h2>
            <p className="text-xs text-slate-400">
              Desempenho consolidado com base em <b>{filteredRecords.length}</b> turnos registados
            </p>
          </div>

          {/* Sub-Tabs de Navegação */}
          <div className="flex items-center bg-slate-900 p-1 rounded-2xl border border-slate-800 text-xs self-start sm:self-auto">
            <button
              onClick={() => setActiveSubTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
                activeSubTab === 'overview'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Visão Geral</span>
            </button>

            <button
              onClick={() => setActiveSubTab('matrix24h')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
                activeSubTab === 'matrix24h'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Matriz 24h</span>
            </button>

            <button
              onClick={() => setActiveSubTab('deadhead')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
                activeSubTab === 'deadhead'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              <span>Tempo em Vazio</span>
            </button>

            <button
              onClick={() => setActiveSubTab('hotspots')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
                activeSubTab === 'hotspots'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Hotspots GPS</span>
            </button>
          </div>
        </div>

        {/* Seletores de Filtros de 1-Toque */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Filtro de Período */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-sky-400" /> Período:
            </span>
            <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 font-medium">
              <button
                onClick={() => setPeriodFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  periodFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setPeriodFilter('today')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  periodFilter === 'today' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Hoje
              </button>
              <button
                onClick={() => setPeriodFilter('week')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  periodFilter === 'week' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Esta Semana
              </button>
              <button
                onClick={() => setPeriodFilter('month')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  periodFilter === 'month' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Este Mês
              </button>
              <button
                onClick={() => setPeriodFilter('30days')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  periodFilter === '30days' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Últimos 30 Dias
              </button>
            </div>
          </div>

          {/* Filtro de Plataforma */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-emerald-400" /> Plataforma:
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 font-medium">
              <button
                onClick={() => setPlatformFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  platformFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setPlatformFilter('uber')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  platformFilter === 'uber' ? 'bg-black text-white border border-slate-700 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Uber
              </button>
              <button
                onClick={() => setPlatformFilter('bolt')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  platformFilter === 'bolt' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bolt
              </button>
              <button
                onClick={() => setPlatformFilter('freenow')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  platformFilter === 'freenow' ? 'bg-rose-950 text-rose-300 border border-rose-500/50 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                FreeNow
              </button>
              <button
                onClick={() => setPlatformFilter('other')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  platformFilter === 'other' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Outra
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CONTEÚDO DA SUB-ABA ATIVA */}

      {/* ========================================================================= */}
      {/* ABA 1: VISÃO GERAL (KPIS CONSOLIDADOS & COMPARATIVO DE PLATAFORMAS) */}
      {/* ========================================================================= */}
      {activeSubTab === 'overview' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Grelha de 6 Cartões Principais de KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* KPI 1: Lucro Líquido Real */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-400" />
                  Lucro Líquido Real
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold font-mono text-[10px]">
                  {netMarginPct}% margem
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight">
                {formatCurrency(summary.totalNet)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Bruto: {formatCurrency(summary.totalGross)}</span>
                <span className="text-rose-400">{formatExpense(summary.totalFuelCost)} comb.</span>
              </div>
            </div>

            {/* KPI 2: Faturação Bruta Total */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  Faturação Bruta
                </span>
                <span className="text-slate-500 text-[10px] font-mono">
                  {summary.totalTrips} viagens
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                {formatCurrency(summary.totalGross)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Média/Corrida: {formatCurrency(summary.avgPerTrip)}</span>
                <span className="text-slate-300">{formatDistance(summary.totalDistanceKm)}</span>
              </div>
            </div>

            {/* KPI 3: Rendimento Horário Real */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Rendimento Horário
                </span>
                <span className="text-slate-500 text-[10px] font-mono">
                  {summary.totalPassengerHours.toFixed(1)}h c/ passageiro
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-tight">
                {formatCurrency(summary.avgHourlyNet)}/h
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Bruto: {formatCurrency(summary.avgHourlyGross)}/h</span>
                <span className="text-emerald-400 font-bold">{summary.totalPassengerHours.toFixed(1)}h úteis</span>
              </div>
            </div>

            {/* KPI 4: Rendimento por Km */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Rendimento por Km
                </span>
                <span className="text-slate-500 text-[10px] font-mono">
                  {formatDistance(summary.totalPassengerKm)} c/ passageiro
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-indigo-300 font-mono tracking-tight">
                {formatCurrency(summary.avgNetKmRate)}/km
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Bruto: {formatCurrency(summary.avgKmRate)}/km</span>
                <span className="text-slate-300">{formatDistance(summary.totalPassengerKm)} c/ pass.</span>
              </div>
            </div>

            {/* KPI 5: Taxa de Ocupação (% Tempo Útil) */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-emerald-400" />
                  Taxa de Ocupação
                </span>
                <span className="text-emerald-400 text-[10px] font-mono font-bold">
                  {summary.avgOccupancyRate}% útil
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-300 font-mono tracking-tight">
                {summary.avgOccupancyRate}%
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 mt-1">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${summary.avgOccupancyRate}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between pt-1">
                <span>{summary.totalPassengerHours.toFixed(1)}h c/ passageiro</span>
                <span>{summary.totalEmptyHours.toFixed(1)}h em vazio</span>
              </div>
            </div>

            {/* KPI 6: Despesa de Combustível / Energia */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Fuel className="w-4 h-4 text-rose-400" />
                  Combustível / Energia
                </span>
                <span className="text-slate-500 text-[10px] font-mono">
                  {settings.vehicleEnergy?.costPerKm.toFixed(2)}€/km
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-400 font-mono tracking-tight">
                {formatExpense(summary.totalFuelCost)}
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Desperdício em Vazio:</span>
                <span className="text-amber-400 font-bold">{formatExpense(summary.totalEmptyCost)}</span>
              </div>
            </div>
          </div>

          {/* Destaques de Horário & Melhor Dia */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 flex items-center justify-between shadow-lg">
              <div className="space-y-1">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Melhor Janela Horária (Pico)
                </span>
                <div className="text-xl font-bold font-mono text-white">
                  {summary.bestHourlyWindow}
                </div>
                <span className="text-[11px] text-slate-500">
                  Maior rentabilidade horária média ({summary.bestHourlyKmRate} km/h ritmo)
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-lg">
                <Zap className="w-6 h-6 fill-current" />
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 flex items-center justify-between shadow-lg">
              <div className="space-y-1">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  Melhor Dia da Semana
                </span>
                <div className="text-xl font-bold text-white">
                  {summary.bestDayOfWeek}
                </div>
                <span className="text-[11px] text-slate-500">
                  Dia com maior volume de faturação e pedidos
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-lg">
                <Award className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Desempenho por Plataforma (Barras Proporcionais & Cartões Detalhados) */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Desempenho Discriminado por Plataforma</h3>
                <p className="text-xs text-slate-400">Comparativo real de rentabilidade entre Uber, Bolt e FreeNow</p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Líder: <b className="text-emerald-400 uppercase">{summary.totalGross > 0 ? summary.topPlatform : '—'}</b>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {platforms.filter((p) => p.id !== 'other').map((plat) => {
                const stat = summary.platformBreakdown[plat.id] || {
                  gross: 0,
                  net: 0,
                  hours: 0,
                  passengerHours: 0,
                  distanceKm: 0,
                  passengerDistanceKm: 0,
                  trips: 0,
                  avgHourlyRate: 0,
                  avgKmRate: 0,
                };
                const pctOfMax = Math.round((stat.gross / maxPlatformGross) * 100);

                return (
                  <div
                    key={plat.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-2.5 shadow-md flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase border ${plat.color}`}>
                          {plat.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {stat.trips} viagens
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {formatCurrency(stat.net)} líq.
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Faturação Bruta:</span>
                        <span className="font-mono font-bold text-white">{formatCurrency(stat.gross)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full ${plat.barColor} rounded-full transition-all duration-500`}
                          style={{ width: `${pctOfMax}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Rendimento/h útil:</span>
                        <span className="text-slate-200 font-bold">{formatCurrency(stat.avgHourlyRate)}/h</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block text-[10px]">Rendimento/km c/ pass.:</span>
                        <span className="text-slate-200 font-bold">{formatCurrency(stat.avgKmRate)}/km</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: MATRIZ DE 24 HORAS */}
      {/* ========================================================================= */}
      {activeSubTab === 'matrix24h' && (
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Matriz de Rentabilidade por Hora do Dia (00:00 às 23:59)
              </h3>
              <p className="text-xs text-slate-400">
                Identifique as faixas horárias com maior taxa horária e multiplicadores de preço
              </p>
            </div>

            {/* Alternador de Modo de Visualização */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setHourlyViewMode('net')}
                className={`px-3 py-1 rounded-lg transition ${
                  hourlyViewMode === 'net' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Líquido (€/h)
              </button>
              <button
                onClick={() => setHourlyViewMode('gross')}
                className={`px-3 py-1 rounded-lg transition ${
                  hourlyViewMode === 'gross' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Bruto (€/h)
              </button>
              <button
                onClick={() => setHourlyViewMode('km')}
                className={`px-3 py-1 rounded-lg transition ${
                  hourlyViewMode === 'km' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Velocidade (km/h)
              </button>
            </div>
          </div>

          {/* Grelha de 24 Horas em Barras Verticais/Horizontais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {summary.hourlyBreakdown.map((hStat) => {
              const val =
                hourlyViewMode === 'net'
                  ? hStat.avgNetHourlyRate
                  : hourlyViewMode === 'gross'
                  ? hStat.avgHourlyRate
                  : hStat.avgKm;

              const maxVal =
                hourlyViewMode === 'net'
                  ? maxHourlyNet
                  : hourlyViewMode === 'gross'
                  ? maxHourlyGross
                  : maxHourlyKm;

              const barPct = Math.min(100, Math.max(15, Math.round((val / maxVal) * 100)));

              return (
                <div
                  key={hStat.hour}
                  className={`bg-slate-900 border rounded-2xl p-2.5 space-y-1.5 transition-all hover:scale-[1.02] ${
                    hStat.isPeakHour
                      ? 'border-amber-500/50 bg-amber-950/20'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-white">{hStat.hour.toString().padStart(2, '0')}:00</span>
                    {hStat.isPeakHour && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                        PICO
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-black font-mono text-emerald-400">
                    {hourlyViewMode === 'km' ? `${val} km/h` : formatCurrency(val)}
                  </div>

                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full ${
                        hStat.isPeakHour ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                    <span>{hStat.sampleCount} turnos</span>
                    <span>{formatCurrency(hStat.avgKmRate)}/km</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: TEMPO EM VAZIO & DESPERDÍCIO */}
      {/* ========================================================================= */}
      {activeSubTab === 'deadhead' && (
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl animate-in fade-in duration-200">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Timer className="w-4 h-4 text-rose-400" />
              Auditoria de Tempo Útil vs Desperdício em Vazio
            </h3>
            <p className="text-xs text-slate-400">
              Análise de horas e quilómetros rodados sem passageiro no veículo
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <span className="text-xs text-slate-400 font-semibold block">Horas com Passageiro</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {summary.totalPassengerHours.toFixed(1)} h
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {summary.avgOccupancyRate}% do tempo total trabalhado
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <span className="text-xs text-slate-400 font-semibold block">Horas em Vazio (À Procura)</span>
              <div className="text-2xl font-black text-amber-400 font-mono">
                {summary.totalEmptyHours.toFixed(1)} h
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {Math.max(0, 100 - summary.avgOccupancyRate)}% do tempo sem corrida ativa
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <span className="text-xs text-slate-400 font-semibold block">Custo Desperdiçado em Vazio</span>
              <div className="text-2xl font-black text-rose-400 font-mono">
                {formatExpense(summary.totalEmptyCost)}
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {formatDistance(summary.totalEmptyKm)} rodados sem cliente
              </span>
            </div>
          </div>

          {/* Relatório Semanal de Ocupação */}
          {summary.weeklyOccupancy && summary.weeklyOccupancy.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-white block">Histórico Diário de Ocupação:</span>
              <div className="space-y-1.5">
                {summary.weeklyOccupancy.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="w-28 font-bold text-slate-200">{item.dayLabel}</div>
                    <div className="flex-1 max-w-xs h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${item.occupancyRate}%` }}
                      />
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-400 font-bold">{item.occupancyRate}% útil</span>
                      <span className="text-slate-500 ml-2">({item.passengerHours}h / {item.totalHours}h)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 4: HOTSPOTS ESTRATÉGICOS */}
      {/* ========================================================================= */}
      {activeSubTab === 'hotspots' && (
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Hotspots TVDE de Alta Densidade & Eficiência em Portugal
              </h3>
              <p className="text-xs text-slate-400">
                Posicionamento geográfico inteligente para evitar quilómetros em vazio
              </p>
            </div>

            {/* Categorias de Zonas */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setSelectedZoneCategory('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  selectedZoneCategory === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setSelectedZoneCategory('airport')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  selectedZoneCategory === 'airport' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Aeroportos
              </button>
              <button
                onClick={() => setSelectedZoneCategory('corporate')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  selectedZoneCategory === 'corporate' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Corporativo
              </button>
              <button
                onClick={() => setSelectedZoneCategory('nightlife')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  selectedZoneCategory === 'nightlife' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Noturno
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredZones.length === 0 ? (
              <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
                Ainda não existem dados verificados de procura, espera ou eficiência por zona. Esta área será preenchida quando uma fonte real for configurada.
              </div>
            ) : filteredZones.map((zone) => (
              <div
                key={zone.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-md flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                      {renderZoneIcon(zone.iconType)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{zone.name}</h4>
                      <span className="text-[11px] text-slate-400">{zone.area}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                    {zone.badge}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {zone.description}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Horários Fortes:</span>
                    <span className="text-amber-400 font-bold">{zone.recommendedHours}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px]">Eficiência / Espera:</span>
                    <span className="text-emerald-400 font-bold">{zone.occupancyEfficiency}% (~{zone.avgWaitMinutes} min)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
