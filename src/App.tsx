import { useState, useEffect, useRef } from 'react';
import { useEarningsHistory } from './hooks/useEarningsHistory';
import { useShiftEarningsCalculator } from './hooks/useShiftEarningsCalculator';
import { useGeolocationTracker } from './hooks/useGeolocationTracker';
import { useGoalAudioAlerts } from './hooks/useGoalAudioAlerts';
import { useVehicleBatteryMonitor } from './hooks/useVehicleBatteryMonitor';
import {
  subscribeToAuth,
} from './services/firebase';
import { User } from 'firebase/auth';

import { LiveMetricsCard } from './components/LiveMetricsCard';
import { LiveMap } from './components/LiveMap';
import { AnalyticsSummary } from './components/AnalyticsSummary';
import { HistoryList } from './components/HistoryList';
import { EarningFormModal } from './components/EarningFormModal';
import type { EarningFormInitialData } from './components/EarningFormModal';
import { SettingsModal } from './components/SettingsModal';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import { TvdeSafetyAlert } from './components/TvdeSafetyAlert';
import { ArrivalAlertBanner } from './components/ArrivalAlertBanner';
import { AuthModal } from './components/AuthModal';
import { RecentTripsHomeCard } from './components/RecentTripsHomeCard';
import { GoalAndFuelBar } from './components/GoalAndFuelBar';

import { EarningRecord, PlatformType, FuelExpense } from './types/earnings';
import { TripDetail } from './types/session';
import { buildPlatformRecordDrafts } from './utils/platformShiftRecords';
import type { PlatformRecordDraft } from './utils/platformShiftRecords';
import {
  Activity,
  History,
  BarChart3,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Gauge,
  User as UserIcon,
  BatteryWarning,
} from 'lucide-react';
import { RearEntertainmentScreen } from './components/RearEntertainmentScreen';

function formatDriverName(name?: string | null, email?: string | null): string {
  if (!name && !email) return 'Conta';
  if (!name) return email ? email.split('@')[0] : 'Conta';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function App() {
  const [activeTab, setActiveTab] = useState<'monitor' | 'analytics' | 'history' | 'rear'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#rear' || window.location.search.includes('mode=rear')) {
        return 'rear';
      }
    }
    return 'monitor';
  });
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSystemLight, setIsSystemLight] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  });

  // Tema automático sincronizado com o navegador
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const listener = (e: MediaQueryListEvent) => setIsSystemLight(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isSystemLight) {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [isSystemLight]);
  const [editingRecord, setEditingRecord] = useState<EarningFormInitialData | null>(null);
  const [isSyncBannerDismissed, setIsSyncBannerDismissed] = useState(false);

  // Subscrever estado de autenticação Firebase.
  useEffect(() => {
    const unsubAuth = subscribeToAuth((user) => {
      setCurrentUser(user);
    });

    return unsubAuth;
  }, []);

  // 1. Histórico de Ganhos e Definições de Utilizador
  const {
    records,
    settings,
    summary,
    isAuthLoading,
    syncError,
    addRecord,
    addRecords,
    updateRecord,
    deleteRecord,
    clearAllRecords,
    importRecords,
    updateSettings,
  } = useEarningsHistory();

  // 2. Motor da Sessão de Turno e Cálculo Dinâmico em Tempo Real
  const {
    session,
    startShift,
    pauseShift,
    resumeShift,
    finishShift,
    discardShift,
    detachShift,
    startTrip,
    finishTrip,
    cancelCurrentTrip,
    addFuelExpense,
    updateSessionTrip,
    deleteSessionTrip,
    isArrivalAlertOpen,
    currentTripSeconds,
    dismissArrivalAlert,
    confirmFinishTripFromArrivalAlert,
    handleMovementTick,
    remoteSyncError,
    isSessionOwnerDevice,
  } = useShiftEarningsCalculator({
    userId: currentUser?.uid,
    summary,
    settings,
    onFinishShift: (newShift) => {
      const platformRecords = buildPlatformRecordDrafts(newShift);
      const timestamp = new Date().toISOString();
      const firstRecord = platformRecords[0];

      setEditingRecord({
        ...firstRecord,
        id: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(platformRecords.length > 1
          ? {
              platformTripsCount: newShift.platformTripsCount,
              platformRecords,
            }
          : {}),
      });
      setIsFormModalOpen(true);
    },
  });

  const previousUserUidRef = useRef<string | null>(null);
  useEffect(() => {
    const nextUid = currentUser?.uid || null;
    if (previousUserUidRef.current && previousUserUidRef.current !== nextUid && session.state !== 'idle') {
      // Trocar de conta remove apenas o estado local desta sessão. O turno
      // continua no UID anterior para poder ser recuperado noutro dispositivo;
      // só "Descartar turno" o elimina remotamente.
      detachShift();
    }
    previousUserUidRef.current = nextUid;
  }, [currentUser?.uid, detachShift, session.state]);

  useEffect(() => {
    if (!isAuthLoading && !currentUser && session.state !== 'idle') {
      // O logout não é uma ordem para apagar o turno. Remove apenas o estado
      // local desta instância; o turno continua no UID anterior e pode ser
      // recuperado quando o condutor voltar a autenticar-se.
      detachShift();
    }
  }, [currentUser, detachShift, isAuthLoading, session.state]);

  // 3. Monitorização de Bateria e Saúde do Dispositivo no Veículo
  const battery = useVehicleBatteryMonitor({ isMoving: session.drivingStatus === 'moving' });

  // 4. Alertas Sonoros e Vocais de Metas Diárias
  useGoalAudioAlerts({
    currentEarnings: session.estimatedEarnings,
    dailyGoal: settings.dailyGoal,
    soundEnabled: settings.soundEnabled,
    voiceEnabled: settings.voiceEnabled,
    isShiftActive: session.state === 'active',
  });

  // 5. Rastreamento por GPS Real
  const geoTrackerState = useGeolocationTracker({
    enabled: session.state === 'active' && session.trackingMode === 'real_gps' && isSessionOwnerDevice,
    onPositionUpdate: (coords, speedKmh, heading, distDeltaKm, accuracyMeters) => {
      handleMovementTick(coords, speedKmh, distDeltaKm, heading, accuracyMeters);
    },
  });

  const activeSpeed = geoTrackerState.speedKmh;
  const activeHeading = geoTrackerState.heading;

  const handleOpenAdd = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    setEditingRecord(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (rec: EarningRecord) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    setEditingRecord(rec);
    setIsFormModalOpen(true);
  };

  const handleApplyOcrData = (parsedData: Partial<EarningRecord>) => {
    if (!currentUser) {
      setIsScannerModalOpen(false);
      setIsAuthModalOpen(true);
      return;
    }
    const distance = parsedData.distanceKm ?? 0;
    setEditingRecord({
      id: '',
      platform: parsedData.platform ?? 'other',
      date: parsedData.date ?? '',
      startTime: parsedData.startTime ?? '',
      endTime: parsedData.endTime ?? '',
      totalHours: parsedData.totalHours ?? 0,
      passengerHours: parsedData.passengerHours ?? 0,
      grossEarnings: parsedData.grossEarnings ?? 0,
      tips: parsedData.tips ?? 0,
      bonuses: parsedData.bonuses ?? 0,
      tollsReimbursed: 0,
      distanceKm: distance,
      passengerDistanceKm: parsedData.passengerDistanceKm ?? 0,
      emptyDistanceKm: parsedData.emptyDistanceKm ?? 0,
      occupancyRatePct: parsedData.occupancyRatePct ?? 0,
      tripsCount: parsedData.tripsCount ?? 0,
      fuelExpenses: parsedData.fuelExpenses ?? [],
      fuelCost: parsedData.fuelCost ?? 0,
      commissionCost: 0,
      otherExpenses: 0,
      netEarnings: 0,
      notes: parsedData.notes ?? 'Dados importados via OCR. Confirme todos os campos antes de guardar.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setIsFormModalOpen(true);
  };

  const handleSaveForm = (
    recordData: Omit<EarningRecord, 'id' | 'createdAt' | 'updatedAt' | 'netEarnings'>,
    editId?: string
  ) => {
    if (!currentUser) {
      setIsFormModalOpen(false);
      setIsAuthModalOpen(true);
      return;
    }
    try {
      if (editId) {
        updateRecord(editId, recordData);
      } else {
        addRecord(recordData);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível guardar o turno.');
    }
  };

  const handleSaveMany = (recordData: PlatformRecordDraft[]) => {
    if (!currentUser) {
      setIsFormModalOpen(false);
      setIsAuthModalOpen(true);
      return;
    }
    try {
      addRecords(recordData);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível guardar os registos do turno.');
    }
  };

  const currentVelocity = Math.round(activeSpeed || session.currentSpeedKmh || 0);

  const handleStartShift = (platform?: PlatformType) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    startShift(platform);
  };

  const recalculateTripAggregates = (record: EarningRecord, trips: TripDetail[]) => {
    const previousTrips = record.trips || [];
    const sum = (items: TripDetail[], selector: (trip: TripDetail) => number) =>
      items.reduce((total, trip) => total + (Number.isFinite(selector(trip)) ? selector(trip) : 0), 0);
    const previousGross = sum(previousTrips, (trip) => trip.estimatedEarnings);
    const previousDistance = sum(previousTrips, (trip) => trip.distanceKm);
    const previousFuel = sum(previousTrips, (trip) => trip.fuelCost || 0);
    const nextGross = sum(trips, (trip) => trip.estimatedEarnings);
    const nextDistance = sum(trips, (trip) => trip.distanceKm);
    const nextFuel = sum(trips, (trip) => trip.fuelCost || 0);

    return {
      trips,
      tripsCount: trips.length,
      grossEarnings: Number(Math.max(0, record.grossEarnings - previousGross + nextGross).toFixed(2)),
      distanceKm: Number(Math.max(0, record.distanceKm - previousDistance + nextDistance).toFixed(2)),
      fuelCost: Number(Math.max(0, record.fuelCost - previousFuel + nextFuel).toFixed(2)),
    };
  };

  const getGlobalSpeedBg = () => {
    if (activeTab !== 'monitor') return 'bg-slate-950';
    if (currentVelocity >= 80) return 'bg-gradient-to-b from-red-950/50 via-orange-950/25 to-slate-950';
    if (currentVelocity > 60) return 'bg-gradient-to-b from-amber-950/35 via-orange-950/15 to-slate-950';
    if (currentVelocity > 30) return 'bg-gradient-to-b from-cyan-950/30 via-slate-900/40 to-slate-950';
    if (currentVelocity > 0) return 'bg-gradient-to-b from-emerald-950/20 via-slate-900/30 to-slate-950';
    return 'bg-slate-950';
  };

  const handleDeleteTrip = (tripId: string) => {
    // 1. Se a viagem pertencer à sessão ativa em curso
    if (session.trips && session.trips.some((t) => t.id === tripId)) {
      deleteSessionTrip(tripId);
    }

    // 2. Se a viagem pertencer aos registos do histórico gravado
    records.forEach((rec) => {
      if (rec.trips && rec.trips.some((t) => t.id === tripId)) {
        const remainingTrips = rec.trips.filter((t) => t.id !== tripId);
        updateRecord(rec.id, recalculateTripAggregates(rec, remainingTrips));
      }
    });
  };

  const handleEditTrip = (updatedTrip: TripDetail) => {
    // 1. Se a viagem pertencer à sessão ativa em curso
    if (session.trips && session.trips.some((t) => t.id === updatedTrip.id)) {
      updateSessionTrip(updatedTrip);
    }

    // 2. Se a viagem pertencer aos registos do histórico gravado
    records.forEach((rec) => {
      if (rec.trips && rec.trips.some((t) => t.id === updatedTrip.id)) {
        const updatedTrips = rec.trips.map((t) => (t.id === updatedTrip.id ? updatedTrip : t));
        updateRecord(rec.id, recalculateTripAggregates(rec, updatedTrips));
      }
    });
  };

  return (
    <div className={`min-h-screen flex flex-col selection:bg-emerald-500 selection:text-slate-950 transition-colors duration-500 ease-out ${
      isSystemLight
        ? 'bg-slate-100 text-slate-900'
        : `text-slate-100 ${getGlobalSpeedBg()}`
    }`}>
      {/* Alerta de Conformidade TVDE (Lei n.º 45/2018) */}
      <TvdeSafetyAlert activeDurationSeconds={session.activeDurationSeconds} />

      {/* Alerta de Descarga / Bateria Veicular */}
      {battery.showAlert && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between text-amber-300 text-xs animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <BatteryWarning className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
            <span>
              {battery.alertType === 'low_battery' && (
                <>
                  <b>Atenção: Bateria Crítica ({battery.level}%)</b> — Ligue o cabo de alimentação do veículo para evitar interrupções no turno!
                </>
              )}
              {battery.alertType === 'unplugged_driving' && (
                <>
                  <b>Carregador Desligado</b> — O telemóvel está em descarga durante a condução ({battery.level}% restantes).
                </>
              )}
            </span>
          </div>
          <button
            onClick={battery.dismissBatteryAlert}
            className="text-[11px] font-semibold text-amber-200 hover:text-white px-2 py-0.5 rounded bg-amber-500/20"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Alerta de Chegada ao Destino */}
      <ArrivalAlertBanner
        isOpen={isArrivalAlertOpen}
        tripDurationSeconds={currentTripSeconds}
        onConfirmFinishTrip={confirmFinishTripFromArrivalAlert}
        onDismiss={dismissArrivalAlert}
      />

      {/* Barra de Navegação Superior Minimalista */}
      <header className={`sticky top-0 z-40 border-b px-4 sm:px-6 lg:px-8 py-2.5 transition-colors ${
        isSystemLight ? 'bg-white/95 border-slate-200 shadow-sm' : 'bg-slate-950/95 border-slate-800/80'
      }`}>
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-md shadow-emerald-500/20">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <span className={`text-base sm:text-lg font-black tracking-tight ${
                isSystemLight ? 'text-slate-900' : 'text-white'
              }`}>
                DriverWise
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center p-1 rounded-2xl border text-xs ${
              isSystemLight ? 'bg-slate-200/80 border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}>
              <button
                onClick={() => setActiveTab('monitor')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  activeTab === 'monitor'
                    ? isSystemLight
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'bg-slate-800 text-white shadow-sm'
                    : isSystemLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Cockpit</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  activeTab === 'analytics'
                    ? isSystemLight
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'bg-slate-800 text-white shadow-sm'
                    : isSystemLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Análise</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  activeTab === 'history'
                    ? isSystemLight
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'bg-slate-800 text-white shadow-sm'
                    : isSystemLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico</span>
              </button>

            </div>

            {/* Botão de Autenticação / Perfil */}
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className={`p-1.5 sm:px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                currentUser
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  : isSystemLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title={currentUser ? `Autenticado como ${currentUser.email}` : 'Entrar na Conta'}
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  className="w-4 h-4 rounded-full object-cover border border-emerald-400/50 flex-shrink-0"
                />
              ) : currentUser ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <UserIcon className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {currentUser ? formatDriverName(currentUser.displayName, currentUser.email) : 'Entrar'}
              </span>
            </button>

            <button
              onClick={() => currentUser ? setIsSettingsModalOpen(true) : setIsAuthModalOpen(true)}
              className={`p-1.5 rounded-xl border transition-all ${
                isSystemLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-600'
                  : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Definições"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Banner de Privacidade e Proteção de Dados de Utilizadores Não Autenticados */}
      {!currentUser && !isAuthLoading && (
        <div className={`border-b px-4 sm:px-6 lg:px-8 py-3 text-xs flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-300 ${
          isSystemLight
            ? 'bg-emerald-50/80 border-emerald-300 text-slate-800'
            : 'bg-slate-900 border-emerald-500/30 text-slate-300'
        }`}>
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>
              <b>Modo Protegido & Confidencial</b> — Inicie sessão para carregar o seu histórico privado de turnos e telemetria TVDE.
            </span>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-md shadow-emerald-500/20 whitespace-nowrap"
          >
            Iniciar Sessão
          </button>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {(syncError || remoteSyncError) && currentUser && !isSyncBannerDismissed && (
          <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-center justify-between gap-3 animate-in fade-in duration-150">
            <span>Sincronização: {syncError || remoteSyncError}</span>
            <button
              type="button"
              onClick={() => setIsSyncBannerDismissed(true)}
              className="text-[11px] font-bold text-amber-300 hover:text-white px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition whitespace-nowrap"
            >
              Fechar
            </button>
          </div>
        )}
        {activeTab === 'monitor' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* 1. Painel Cockpit Velocímetro Automóvel com Botão de Iniciar Turno & Iniciar Viagem por Plataforma */}
            <LiveMetricsCard
              session={{ ...session, currentSpeedKmh: activeSpeed }}
              summary={summary}
              settings={settings}
              isSessionOwnerDevice={isSessionOwnerDevice}
              isLight={isSystemLight}
              onStartShift={handleStartShift}
              onPauseShift={pauseShift}
              onResumeShift={resumeShift}
              onFinishShift={finishShift}
              onStartTrip={startTrip}
              onFinishTrip={finishTrip}
              onCancelTrip={cancelCurrentTrip}
            />

            {/* Barra de Meta Diária & Gestão de Combustível / Abastecer */}
            <GoalAndFuelBar
              settings={settings}
              currentEarnings={session.estimatedEarnings}
              currentFuelCost={session.estimatedFuelCost}
              manualFuelCost={(session.fuelExpenses || []).reduce((acc: number, curr: FuelExpense) => acc + curr.amount, 0)}
              isInShift={session.state === 'active' || session.state === 'paused'}
              isLight={isSystemLight}
              onUpdateSettings={updateSettings}
              onAddFuelExpense={addFuelExpense}
            />

            {/* 2. Secção de Trajeto GPS em Tempo Real (Largura Total) */}
            <div className="w-full space-y-1.5">
              <span className={`text-xs font-semibold px-1 block ${
                isSystemLight ? 'text-slate-600' : 'text-slate-400'
              }`}>
                Trajeto e Localização GPS em Tempo Real
              </span>
              <LiveMap
                currentPosition={session.currentPosition}
                heading={activeHeading}
                speedKmh={activeSpeed}
                pathHistory={session.pathHistory}
                isTracking={session.state === 'active'}
              />
            </div>

            {/* 3. Histórico de Últimas Viagens na Tela Inicial (com rotas, km, combustível, edição e exclusão) */}
            <RecentTripsHomeCard
              currentSessionTrips={session.trips}
              summary={summary}
              settings={settings}
              isLight={isSystemLight}
              onDeleteTrip={handleDeleteTrip}
              onEditTrip={handleEditTrip}
            />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="animate-in fade-in duration-200">
            <AnalyticsSummary records={records} settings={settings} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in fade-in duration-200">
            <HistoryList
              records={records}
              onAddRecord={handleOpenAdd}
              onEditRecord={handleOpenEdit}
              onDeleteRecord={deleteRecord}
              onOpenScanner={() => currentUser ? setIsScannerModalOpen(true) : setIsAuthModalOpen(true)}
            />
          </div>
        )}

        {activeTab === 'rear' && (
          <div className="animate-in fade-in duration-200 -mx-4 sm:-mx-6 lg:-mx-8 -my-4 sm:-my-6 lg:-my-8">
            <RearEntertainmentScreen
              session={{ ...session, currentSpeedKmh: activeSpeed }}
              isLight={isSystemLight}
              onExitRearMode={() => setActiveTab('monitor')}
            />
          </div>
        )}
      </main>

      {/* Rodapé */}
      <footer className={`py-3.5 px-6 text-center text-xs border-t transition-colors ${
        isSystemLight
          ? 'bg-white border-slate-200 text-slate-500'
          : 'bg-slate-950 border-slate-800/80 text-slate-500'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>DriverWise © 2026 • Ferramenta de Otimização TVDE</span>
          <span className={`flex items-center gap-1 ${isSystemLight ? 'text-slate-600' : 'text-slate-400'}`}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Conformidade com a Lei TVDE n.º 45/2018
          </span>
        </div>
      </footer>

      {/* Modais */}
      <EarningFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveForm}
        onSaveMany={handleSaveMany}
        onDiscardShift={discardShift}
        initialData={editingRecord}
        defaultCommissionPct={settings.defaultCommissionPct}
        defaultTaxPct={settings.defaultTaxPct}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        records={records}
        onUpdateSettings={updateSettings}
        onImportRecords={importRecords}
        onClearAll={clearAllRecords}
      />

      <ReceiptScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        onApplyParsedData={handleApplyOcrData}
      />

      {/* Modal de Autenticação e Perfil */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
      />

    </div>
  );
}

export default App;
