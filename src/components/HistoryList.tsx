import React, { useState, useMemo } from 'react';
import { EarningRecord, PlatformType } from '../types/earnings';
import { TripDetail } from '../types/session';
import { formatCurrency, formatDatePT, formatDecimalHours, formatDistance, formatExpense, formatSecondsToDigital } from '../utils/formatters';
import { calculateNetEarnings } from '../utils/calculations';
import { TripRouteModal } from './TripRouteModal';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Calendar,
  Clock,
  Route,
  AlertTriangle,
  Sparkles,
  Users,
  ChevronDown,
  ChevronUp,
  Car,
  Navigation,
} from 'lucide-react';

interface HistoryListProps {
  records: EarningRecord[];
  onAddRecord: () => void;
  onEditRecord: (record: EarningRecord) => void;
  onDeleteRecord: (id: string) => void;
  onOpenScanner?: () => void;
}

type PeriodFilter = 'all' | 'today' | 'week' | 'month' | '30days';

export const HistoryList: React.FC<HistoryListProps> = ({
  records,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  onOpenScanner,
}) => {
  const [filterPlatform, setFilterPlatform] = useState<PlatformType | 'all'>('all');
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [selectedTripForMap, setSelectedTripForMap] = useState<TripDetail | null>(null);

  const filteredRecords = useMemo(() => {
    const now = new Date();
    const toLocalDate = (value: Date) => `${value.getFullYear()}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`;
    const todayStr = toLocalDate(now);

    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - diffToMonday);
    const mondayStr = toLocalDate(mondayDate);

    const monthStartStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysStr = toLocalDate(thirtyDaysAgo);

    return records.filter((rec) => {
      // 1. Filtro de Plataforma
      const matchPlatform = filterPlatform === 'all' || rec.platform === filterPlatform;

      // 2. Filtro de Período
      let matchPeriod = true;
      if (filterPeriod === 'today') {
        matchPeriod = rec.date === todayStr;
      } else if (filterPeriod === 'week') {
        matchPeriod = rec.date >= mondayStr && rec.date <= todayStr;
      } else if (filterPeriod === 'month') {
        matchPeriod = rec.date >= monthStartStr && rec.date <= todayStr;
      } else if (filterPeriod === '30days') {
        matchPeriod = rec.date >= thirtyDaysStr && rec.date <= todayStr;
      }

      // 3. Pesquisa de Texto
      const matchSearch =
        !searchTerm ||
        rec.date.includes(searchTerm) ||
        (rec.notes && rec.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchPlatform && matchPeriod && matchSearch;
    });
  }, [records, filterPlatform, filterPeriod, searchTerm]);

  // Totais dos Registos Filtrados
  const filteredTotals = useMemo(() => {
    return filteredRecords.reduce(
      (acc, r) => ({
        count: acc.count + 1,
        gross: acc.gross + (r.grossEarnings || 0) + (r.tips || 0) + (r.bonuses || 0) + (r.tollsReimbursed || 0),
        net: acc.net + calculateNetEarnings(r.grossEarnings, r.tips, r.bonuses, r.fuelCost, r.commissionCost, r.otherExpenses, r.tollsReimbursed, r.taxCost),
        hours: acc.hours + (r.totalHours || 0),
        trips: acc.trips + (r.tripsCount || 0),
        fuel: acc.fuel + Math.max(
          r.fuelCost || 0,
          (r.fuelExpenses || []).reduce((total, expense) => total + Math.max(0, expense.amount || 0), 0)
        ),
      }),
      { count: 0, gross: 0, net: 0, hours: 0, trips: 0, fuel: 0 }
    );
  }, [filteredRecords]);

  const platformBadgeInfo = (p: PlatformType) => {
    switch (p) {
      case 'uber':
        return { name: 'Uber', bg: 'bg-black text-white border-slate-700' };
      case 'bolt':
        return { name: 'Bolt', bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50' };
      case 'freenow':
        return { name: 'FreeNow', bg: 'bg-rose-950/80 text-rose-300 border-rose-500/50' };
      default:
        return { name: 'Outra', bg: 'bg-slate-900 text-slate-300 border-slate-700' };
    }
  };

  const toggleExpandTrips = (recId: string) => {
    setExpandedRecordId((prev) => (prev === recId ? null : recId));
  };

  return (
    <div className="space-y-4">
      {/* 1. BARRA DE FILTROS (PESQUISA, PERÍODO, PLATAFORMA E AÇÕES) */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Pesquisa & Filtros de Plataforma */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar por data ou notas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>

            {/* Filtro de Plataforma */}
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'uber', label: 'Uber' },
                  { id: 'bolt', label: 'Bolt' },
                  { id: 'freenow', label: 'FreeNow' },
                  { id: 'other', label: 'Outra' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterPlatform(tab.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    filterPlatform === tab.id
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filtro de Período */}
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'today', label: 'Hoje' },
                  { id: 'week', label: 'Semana' },
                  { id: 'month', label: 'Mês' },
                  { id: '30days', label: '30 dias' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterPeriod(tab.id)}
                  className={`px-2 py-1 rounded-lg font-semibold transition-all ${
                    filterPeriod === tab.id
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Botões de Ação (Scanner, Registar Turno) */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Importar</span>
              </button>
            )}

            <button
              onClick={onAddRecord}
              className="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Registar Turno</span>
            </button>
          </div>
        </div>

        {/* Resumo Consolidado dos Registos Filtrados */}
        {filteredRecords.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold">{filteredTotals.count} turnos encontrados:</span>
              <span className="text-slate-300 font-bold">{formatCurrency(filteredTotals.gross)} bruto</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">{formatCurrency(filteredTotals.net)} líq.</span>
            </div>
            <div className="flex items-center gap-3">
              <span>{filteredTotals.hours.toFixed(1)}h totais</span>
              <span>{filteredTotals.trips} viagens</span>
              {filteredTotals.fuel > 0 && (
                <span className="text-rose-400">{formatExpense(filteredTotals.fuel)} comb.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. LISTA DE REGISTOS DE TURNO */}
      {filteredRecords.length === 0 ? (
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-12 text-center space-y-3 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-slate-400 flex items-center justify-center mx-auto border border-slate-800">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">Nenhum registo encontrado</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Não existem turnos que correspondam aos filtros selecionados. Registe um novo turno ou importe o relatório da plataforma.
          </p>
          <button
            onClick={onAddRecord}
            className="mt-2 py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Criar Primeiro Registo</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((rec) => {
            const badge = platformBadgeInfo(rec.platform);
            const hourlyBasis = rec.passengerHours > 0 ? rec.passengerHours : rec.totalHours;
            const hourlyRate = hourlyBasis > 0 ? rec.netEarnings / hourlyBasis : 0;
            const hasTrips = rec.trips && rec.trips.length > 0;
            const isExpanded = expandedRecordId === rec.id;

            return (
              <div
                key={rec.id}
                className="bg-slate-950 hover:bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md transition-all flex flex-col space-y-3"
              >
                {/* Linha Principal do Turno */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Lado Esquerdo: Identificação do Turno */}
                  <div className="flex items-start gap-3">
                    <div className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold uppercase tracking-wider ${badge.bg}`}>
                      {badge.name}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{formatDatePT(rec.date)}</span>
                        <span className="text-xs text-slate-500 font-mono">
                          ({rec.startTime} - {rec.endTime})
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400 mt-1">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-sky-400" />
                          {formatDecimalHours(rec.totalHours)}
                        </span>
                        {rec.passengerHours !== undefined && rec.passengerHours > 0 && (
                          <span className="flex items-center gap-1 text-emerald-400 font-mono">
                            <Users className="w-3 h-3" />
                            {formatDecimalHours(rec.passengerHours)} útil
                            <span className="text-[10px] text-slate-500">
                              ({rec.occupancyRatePct ?? (rec.totalHours > 0 ? Math.round((rec.passengerHours / rec.totalHours) * 100) : 0)}%)
                            </span>
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-mono">
                          <Route className="w-3 h-3 text-amber-400" />
                          {formatDistance(rec.distanceKm)}
                          {rec.passengerDistanceKm !== undefined && rec.passengerDistanceKm > 0 && (
                            <span className="text-[10px] text-slate-500">
                              ({formatDistance(rec.passengerDistanceKm)} c/ pass.)
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-slate-300 font-semibold">{rec.tripsCount} viag.</span>
                        {rec.fuelCost > 0 && (
                          <span className="text-rose-400 font-mono text-[11px]">
                            {formatExpense(rec.fuelCost)} comb.
                          </span>
                        )}
                        {(rec.commissionCost > 0 || (rec.taxCost ?? 0) > 0 || rec.otherExpenses > 0) && (
                          <span className="text-rose-300 font-mono text-[11px]">
                            -{formatCurrency(rec.commissionCost + (rec.taxCost ?? 0) + rec.otherExpenses)} deduções
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Lado Direito: Lucro Líquido Real, Média Horária e Ações */}
                  <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                    <div className="text-left md:text-right font-mono">
                      <div className="text-base sm:text-lg font-black text-emerald-400">
                        {formatCurrency(rec.netEarnings)}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center md:justify-end gap-1.5">
                        <span className="text-slate-500">{formatCurrency(rec.grossEarnings)} brt.</span>
                        <span>•</span>
                        <span className="text-sky-400 font-semibold">{formatCurrency(hourlyRate)}/h</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditRecord(rec)}
                        className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="Editar turno"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setRecordToDelete(rec.id)}
                        className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                        title="Eliminar turno"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notas do Turno */}
                {rec.notes && (
                  <div className="text-xs text-slate-400 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
                    {rec.notes}
                  </div>
                )}

                {/* Secção de Viagens Individuais e Rotas no Mapa */}
                {hasTrips && (
                  <div className="pt-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => toggleExpandTrips(rec.id)}
                      className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-xs font-semibold text-slate-300 transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ver Viagens Individuais deste Turno ({rec.trips!.length})</span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        {isExpanded ? (
                          <>
                            <span>Ocultar</span>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            <span>Detalhar rotas</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </span>
                    </button>

                    {/* Lista Expansível de Viagens */}
                    {isExpanded && (
                      <div className="mt-2.5 space-y-2 animate-in fade-in duration-200">
                        {rec.trips!.map((trip, idx) => (
                          <div
                            key={trip.id || idx}
                            className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-300"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-mono text-[10px] text-slate-400">
                                {idx + 1}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-black border border-slate-700 text-[10px] font-bold uppercase">
                                {trip.platform}
                              </span>
                              <span className="font-mono text-slate-400">
                                {trip.startTime} → {trip.endTime}
                              </span>
                              <span className="font-mono font-bold text-slate-200">
                                {formatDistance(trip.distanceKm)}
                              </span>
                              <span className="text-slate-400 font-mono">
                                ({formatSecondsToDigital(trip.durationSeconds)})
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
                              <div className="flex items-center gap-2 font-mono text-xs">
                                <span className="text-slate-400 text-[11px]" title="Bruto">
                                  {formatCurrency(trip.estimatedEarnings)}
                                </span>
                                {trip.fuelCost !== undefined && trip.fuelCost > 0 && (
                                  <span className="text-rose-400 text-[10px]" title="Custo de Combustível">
                                    {formatExpense(trip.fuelCost)}
                                  </span>
                                )}
                                <span className="font-bold text-emerald-400" title="Lucro Líquido Real">
                                  {formatCurrency(trip.netEarnings ?? trip.estimatedEarnings)} líq.
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setSelectedTripForMap(trip)}
                                className="py-1 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px] flex items-center gap-1.5 transition"
                              >
                                <Navigation className="w-3 h-3" />
                                <span>Ver Rota</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação de Eliminação */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Eliminar Turno?</h4>
              <p className="text-xs text-slate-400">
                Esta ação não pode ser anulada. O registo será removido permanentemente do seu histórico.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRecordToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDeleteRecord(recordToDelete);
                  setRecordToDelete(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition shadow-lg shadow-rose-500/20"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Rota GPS no Mapa */}
      <TripRouteModal
        isOpen={selectedTripForMap !== null}
        onClose={() => setSelectedTripForMap(null)}
        trip={selectedTripForMap}
      />
    </div>
  );
};
