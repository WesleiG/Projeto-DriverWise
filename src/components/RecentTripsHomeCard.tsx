import React, { useState } from 'react';
import { TripDetail } from '../types/session';
import { EarningsSummary, PlatformType, UserSettings } from '../types/earnings';
import { calculateHoursBetween, getEffectiveVehicleCostPerKm } from '../utils/calculations';
import { formatCurrency, formatDistance, formatExpense, formatSecondsToDigital } from '../utils/formatters';
import { TripRouteModal } from './TripRouteModal';
import { getTripResolvedPath, getPathDistanceKm } from '../services/routeService';
import {
  Car,
  Navigation,
  Edit3,
  Trash2,
  MapPin,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface RecentTripsHomeCardProps {
  currentSessionTrips?: TripDetail[];
  summary: EarningsSummary;
  settings: UserSettings;
  isLight?: boolean;
  onDeleteTrip?: (tripId: string) => void;
  onEditTrip?: (trip: TripDetail) => void;
}

const RecentTripsHomeCardBase: React.FC<RecentTripsHomeCardProps> = ({
  currentSessionTrips = [],
  summary,
  settings,
  isLight = false,
  onDeleteTrip,
  onEditTrip,
}) => {
  const parseLocaleNumber = (value: string) => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const [selectedTripForMap, setSelectedTripForMap] = useState<TripDetail | null>(null);
  const [editingTrip, setEditingTrip] = useState<TripDetail | null>(null);
  const [editPlatform, setEditPlatform] = useState<PlatformType>('uber');
  const [editStartTime, setEditStartTime] = useState<string>('12:00');
  const [editEndTime, setEditEndTime] = useState<string>('12:20');
  const [editEarnings, setEditEarnings] = useState<string>('0');
  const [editDistance, setEditDistance] = useState<string>('0');
  const [editFuelCost, setEditFuelCost] = useState<string>('0');
  const [tripToDeleteId, setTripToDeleteId] = useState<string | null>(null);
  const [isEarningsManuallyEdited, setIsEarningsManuallyEdited] = useState(false);

  // A página inicial mostra apenas o turno em curso. Depois de finalizar,
  // session.trips é limpo e o cartão desaparece; o histórico fica na aba
  // própria, sem reaparecer como se ainda estivesse ativo.
  const allRecentTrips: { trip: TripDetail; source: 'session' | 'history' }[] = React.useMemo(() => {
    const list: { trip: TripDetail; source: 'session' | 'history' }[] = [];

    if (currentSessionTrips && currentSessionTrips.length > 0) {
      currentSessionTrips.forEach((t) => {
        const path = getTripResolvedPath(t);
        const pathDist = getPathDistanceKm(path);
        const effectiveDist = pathDist >= 0.3 && (t.distanceKm <= 0.25 || t.distanceKm < 0.7 * pathDist)
          ? pathDist
          : Math.max(t.distanceKm, pathDist > 0.05 ? pathDist : 0);
        const safeFuel = t.fuelCost !== undefined ? t.fuelCost : Number((effectiveDist * getEffectiveVehicleCostPerKm(settings)).toFixed(2));
        const normalized: TripDetail = {
          ...t,
          distanceKm: effectiveDist,
          fuelCost: safeFuel,
          netEarnings: Number((t.estimatedEarnings - safeFuel).toFixed(2)),
        };
        list.push({ trip: normalized, source: 'session' });
      });
    }

    return list.slice(-8).reverse();
  }, [currentSessionTrips, settings]);

  const handleOpenEdit = (trip: TripDetail) => {
    setEditingTrip(trip);
    setEditPlatform(trip.platform);
    setEditStartTime(trip.startTime || '12:00');
    setEditEndTime(trip.endTime || '12:20');
    setEditEarnings(String(trip.estimatedEarnings || 0));
    setEditDistance(String(trip.distanceKm || 0));
    setEditFuelCost(String(trip.fuelCost !== undefined ? trip.fuelCost : Number(((trip.distanceKm || 0) * getEffectiveVehicleCostPerKm(settings)).toFixed(2))));
    setIsEarningsManuallyEdited(false);
  };

  const estimateGrossForDistance = (trip: TripDetail, distanceKm: number) => {
    if (trip.distanceKm > 0) {
      return Number((Math.max(0, trip.estimatedEarnings) * (distanceKm / trip.distanceKm)).toFixed(2));
    }
    const platformStat = summary.platformBreakdown[trip.platform];
    const kmRate = platformStat?.avgKmRate > 0 ? platformStat.avgKmRate : summary.avgKmRate || settings.fallbackKmRate;
    const hourlyRate = platformStat?.avgHourlyRate > 0 ? platformStat.avgHourlyRate : summary.avgHourlyGross || settings.fallbackHourlyRate;
    const durationHours = Math.max(0, trip.durationSeconds) / 3600;
    return Number((distanceKm * kmRate * 0.55 + durationHours * hourlyRate * 0.45).toFixed(2));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip) return;

    const earnings = parseLocaleNumber(editEarnings);
    const distance = parseLocaleNumber(editDistance);
    const fuelValue = parseLocaleNumber(editFuelCost);
    if (![earnings, distance].every(Number.isFinite) || earnings < 0 || distance < 0) return;
    const fuel = Number.isFinite(fuelValue) && fuelValue >= 0 ? fuelValue : Number((distance * getEffectiveVehicleCostPerKm(settings)).toFixed(2));
    const net = Number((earnings - fuel).toFixed(2));

    // Recalcular sempre a duração a partir dos horários editados, incluindo
    // viagens que atravessam a meia-noite e o caso válido de duração zero.
    let durationSeconds = Number.isFinite(editingTrip.durationSeconds) ? Math.max(0, editingTrip.durationSeconds) : 0;
    if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(editStartTime) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(editEndTime)) {
      durationSeconds = Math.round(calculateHoursBetween(editStartTime, editEndTime) * 3600);
    }

    const updated: TripDetail = {
      ...editingTrip,
      platform: editPlatform,
      startTime: editStartTime,
      endTime: editEndTime,
      durationSeconds,
      distanceKm: distance,
      estimatedEarnings: earnings,
      fuelCost: fuel,
      netEarnings: net,
    };

    if (onEditTrip) {
      onEditTrip(updated);
    }

    setEditingTrip(null);
  };

  if (allRecentTrips.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-3xl p-4 sm:p-5 shadow-xl space-y-4 border transition-all ${
        isLight
          ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
          : 'bg-slate-950 border-slate-800 text-white'
      }`}
    >
      {/* Cabeçalho da Secção de Últimas Viagens */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b pb-3 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
            isLight
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
          }`}>
            <Car className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm sm:text-base font-bold flex items-center gap-2 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              <span>Últimas Viagens Realizadas</span>
              <span className={`text-xs font-mono font-normal ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>({allRecentTrips.length} viagens)</span>
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Histórico discriminado com quilometragem, combustível, lucro líquido e rota GPS
            </p>
          </div>
        </div>
      </div>

      {/* Grelha de Viagens com Mini-Visualizador e Controlo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {allRecentTrips.map(({ trip, source }, idx) => {
          const isUber = trip.platform === 'uber';
          const isBolt = trip.platform === 'bolt';

          return (
            <div
              key={trip.id || idx}
              className={`rounded-2xl p-3.5 flex flex-col justify-between space-y-3 shadow-md border transition-all group ${
                isLight
                  ? 'bg-slate-50 hover:bg-slate-100/80 border-slate-200 hover:border-slate-300'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700/80'
              }`}
            >
              {/* Topo da Viagem: Plataforma, Horário e Ações */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                      isUber
                        ? isLight
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-black text-white border-slate-700'
                        : isBolt
                        ? isLight
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                        : isLight
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-rose-950 text-rose-300 border-rose-500/50'
                    }`}
                  >
                    {trip.platform.toUpperCase()}
                  </span>

                  <span className={`text-xs font-mono font-semibold flex items-center gap-1 ${
                    isLight ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    <Clock className="w-3 h-3 text-sky-500" />
                    {trip.startTime} → {trip.endTime}
                  </span>

                  <span className={`text-[10px] font-mono ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    ({formatSecondsToDigital(trip.durationSeconds)})
                  </span>
                </div>

                {/* Botões de Ação (Editar e Eliminar) */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(trip)}
                    className={`p-1.5 rounded-lg border transition ${
                      isLight
                        ? 'bg-white hover:bg-slate-200 border-slate-200 text-slate-600 hover:text-slate-900'
                        : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title="Editar dados desta viagem"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setTripToDeleteId(trip.id || `trip-${idx}`)}
                    className={`p-1.5 rounded-lg border transition ${
                      isLight
                        ? 'bg-white hover:bg-rose-100 border-slate-200 text-slate-600 hover:text-rose-600'
                        : 'bg-slate-950 hover:bg-rose-500/20 border-slate-800 text-slate-400 hover:text-rose-400'
                    }`}
                    title="Eliminar esta viagem"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Informações Financeiras e Métricas da Corrida */}
              <div className={`grid grid-cols-3 gap-2 py-2 border-y font-mono text-xs ${
                isLight ? 'border-slate-200' : 'border-slate-800/80'
              }`}>
                <div>
                  <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Distância:</span>
                  <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {formatDistance(trip.distanceKm)}
                  </span>
                </div>

                <div>
                  <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Combustível:</span>
                  <span className="font-bold text-rose-500">
                    {formatExpense(trip.fuelCost !== undefined ? trip.fuelCost : trip.distanceKm * getEffectiveVehicleCostPerKm(settings))}
                  </span>
                </div>

                <div className="text-right">
                  <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Lucro Líquido:</span>
                  <span className="font-black text-emerald-500 text-sm">
                    {formatCurrency(trip.netEarnings ?? trip.estimatedEarnings)}
                  </span>
                </div>
              </div>

              {/* Botão de Rota GPS no Mapa */}
              <div className="flex items-center justify-between pt-0.5">
                <span className={`text-[11px] font-mono flex items-center gap-1 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  <MapPin className="w-3 h-3 text-emerald-500" />
                  {source === 'session' ? 'Turno Ativo' : 'Histórico'}
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedTripForMap(trip)}
                  className="py-1.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-500 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Ver Rota no Mapa</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Confirmação de Eliminação de Viagem */}
      {tripToDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className={`border rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900'
              : 'bg-slate-950 border-slate-800 text-white'
          }`}>
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold">Eliminar Viagem?</h4>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Tem a certeza de que deseja remover esta viagem? As métricas do turno e do histórico serão recalculadas.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTripToDeleteId(null)}
                className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  isLight
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTrip && tripToDeleteId) {
                    onDeleteTrip(tripToDeleteId);
                  }
                  setTripToDeleteId(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition shadow-lg shadow-rose-500/20"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Completo de Edição de Viagem */}
      {editingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <form
            onSubmit={handleSaveEdit}
            className={`border rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : 'bg-slate-950 border-slate-800 text-white'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-500" />
                <span>Editar Dados da Viagem</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                className={`text-xs ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Plataforma:</label>
                <select
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value as PlatformType)}
                  className={`w-full rounded-xl px-3 py-2 font-mono border focus:outline-none ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-slate-400'
                      : 'bg-slate-900 border-slate-800 text-white focus:border-slate-600'
                  }`}
                >
                  <option value="uber">Uber</option>
                  <option value="bolt">Bolt</option>
                  <option value="freenow">FreeNow</option>
                  <option value="other">Outra</option>
                </select>
              </div>

              {/* Horário de Início e Fim */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Início da Viagem:</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 font-mono border focus:outline-none ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-slate-400'
                        : 'bg-slate-900 border-slate-800 text-white focus:border-slate-600'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Fim da Viagem:</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 font-mono border focus:outline-none ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-slate-400'
                        : 'bg-slate-900 border-slate-800 text-white focus:border-slate-600'
                    }`}
                  />
                </div>
              </div>

              {/* Ganhos Brutos e Distância */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Faturação Bruta (€):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editEarnings}
                    onChange={(e) => {
                      setIsEarningsManuallyEdited(true);
                      setEditEarnings(e.target.value);
                    }}
                    className={`w-full rounded-xl px-3 py-2 font-mono border focus:outline-none ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-slate-400'
                        : 'bg-slate-900 border-slate-800 text-white focus:border-slate-600'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Distância Percorrida (Km):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editDistance}
                    onChange={(e) => {
                      const d = parseLocaleNumber(e.target.value);
                      setEditDistance(e.target.value);
                      setEditFuelCost((d * getEffectiveVehicleCostPerKm(settings)).toFixed(2));
                      if (!isEarningsManuallyEdited && editingTrip) {
                        setEditEarnings(String(estimateGrossForDistance(editingTrip, Math.max(0, d))));
                      }
                    }}
                    className={`w-full rounded-xl px-3 py-2 font-mono border focus:outline-none ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-slate-400'
                        : 'bg-slate-900 border-slate-800 text-white focus:border-slate-600'
                    }`}
                  />
                </div>
              </div>

              {/* Combustível */}
              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Custo de Combustível / Energia (€):</label>
                <input
                  type="number"
                  step="0.01"
                  value={editFuelCost}
                  onChange={(e) => setEditFuelCost(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-rose-500 font-mono border focus:outline-none ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 focus:border-slate-400'
                      : 'bg-slate-900 border-slate-800 focus:border-slate-600'
                  }`}
                />
              </div>

              {/* Resumo do Lucro Previsto */}
              <div className={`rounded-xl p-2.5 flex items-center justify-between font-mono text-xs border ${
                isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-800'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}>
                <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>Lucro Líquido Previsto:</span>
                <span className="text-emerald-500 font-bold">
                  {formatCurrency(parseLocaleNumber(editEarnings) - parseLocaleNumber(editFuelCost))}
                </span>
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 pt-2 border-t ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setEditingTrip(null)}
                className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  isLight
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-emerald-500/20"
              >
                Guardar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Visualização da Rota no Mapa */}
      <TripRouteModal
        isOpen={selectedTripForMap !== null}
        onClose={() => setSelectedTripForMap(null)}
        trip={selectedTripForMap}
      />
    </div>
  );
};

// Durante o tracking a App atualiza o painel principal várias vezes por
// segundo. A lista só depende da referência do array de viagens, portanto
// pode permanecer parada enquanto apenas velocidade/GPS mudam.
export const RecentTripsHomeCard = React.memo(RecentTripsHomeCardBase);
