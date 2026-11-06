import React, { useEffect, useMemo, useState } from 'react';
import { UserSettings, EarningRecord, VehicleType, PlatformType } from '../types/earnings';
import { X, Save, Download, Upload, Volume2, Fuel, Target, Users, Plane } from 'lucide-react';
import { VEHICLE_PRESETS, calculateCostPerKm, getObservedFuelCostPerKm } from '../utils/calculations';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  records: EarningRecord[];
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onImportRecords: (records: unknown[]) => void | Promise<void>;
  onClearAll: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  records,
  onUpdateSettings,
  onImportRecords,
  onClearAll,
}) => {
  const [dailyGoal, setDailyGoal] = useState<number>(settings.dailyGoal);
  const [weeklyGoal, setWeeklyGoal] = useState<number>(settings.weeklyGoal);
  const [fallbackHourlyRate, setFallbackHourlyRate] = useState<number>(settings.fallbackHourlyRate);
  const [defaultCommissionPct, setDefaultCommissionPct] = useState<number>(settings.defaultCommissionPct ?? 0);
  const [defaultTaxPct, setDefaultTaxPct] = useState<number>(settings.defaultTaxPct ?? 0);
  const [movementThreshold, setMovementThreshold] = useState<number>(settings.movementThresholdSpeedKmh);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(settings.soundEnabled ?? true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(settings.voiceEnabled ?? true);
  const [aircraftSpeedometerEnabled, setAircraftSpeedometerEnabled] = useState<boolean>(settings.aircraftSpeedometerEnabled ?? false);
  const [enabledPlatforms, setEnabledPlatforms] = useState<PlatformType[]>(
    settings.enabledPlatforms && settings.enabledPlatforms.length > 0
      ? settings.enabledPlatforms
      : ['uber', 'bolt', 'freenow']
  );

  // Definições do Veículo & Energia
  const [vehicleType, setVehicleType] = useState<VehicleType>(settings.vehicleEnergy?.vehicleType || 'electric');
  const [consumption, setConsumption] = useState<number>(settings.vehicleEnergy?.consumptionPer100Km ?? 15.0);
  const [fuelPrice, setFuelPrice] = useState<number>(settings.vehicleEnergy?.fuelPricePerUnit ?? 0.24);
  const [costPerKm, setCostPerKm] = useState<number>(settings.vehicleEnergy?.costPerKm ?? 0.08);

  const [confirmClear, setConfirmClear] = useState(false);
  const observedCostPerKm = useMemo(() => getObservedFuelCostPerKm(records), [records]);
  const displayedCostPerKm = observedCostPerKm ?? costPerKm;

  useEffect(() => {
    setDailyGoal(settings.dailyGoal);
    setWeeklyGoal(settings.weeklyGoal);
    setFallbackHourlyRate(settings.fallbackHourlyRate);
    setDefaultCommissionPct(settings.defaultCommissionPct ?? 0);
    setDefaultTaxPct(settings.defaultTaxPct ?? 0);
    setMovementThreshold(settings.movementThresholdSpeedKmh);
    setSoundEnabled(settings.soundEnabled ?? true);
    setVoiceEnabled(settings.voiceEnabled ?? true);
    setAircraftSpeedometerEnabled(settings.aircraftSpeedometerEnabled ?? false);
    setEnabledPlatforms(settings.enabledPlatforms?.length ? settings.enabledPlatforms : ['uber', 'bolt', 'freenow']);
    setVehicleType(settings.vehicleEnergy?.vehicleType ?? 'electric');
    setConsumption(settings.vehicleEnergy?.consumptionPer100Km ?? 15);
    setFuelPrice(settings.vehicleEnergy?.fuelPricePerUnit ?? 0.24);
    setCostPerKm(settings.vehicleEnergy?.costPerKm ?? 0.08);
  }, [settings]);

  if (!isOpen) return null;

  const handleTogglePlatform = (plat: PlatformType) => {
    if (enabledPlatforms.includes(plat)) {
      if (enabledPlatforms.length === 1) {
        alert('Deve manter pelo menos uma plataforma ativa para as viagens.');
        return;
      }
      setEnabledPlatforms(enabledPlatforms.filter((p) => p !== plat));
    } else {
      setEnabledPlatforms([...enabledPlatforms, plat]);
    }
  };

  const handleSelectPreset = (type: VehicleType) => {
    setVehicleType(type);
    const preset = VEHICLE_PRESETS[type];
    if (preset) {
      setConsumption(preset.consumption);
      setFuelPrice(preset.unitPrice);
      setCostPerKm(preset.defaultCostKm);
    }
  };

  const handleConsumptionOrPriceChange = (newCons: number, newPrice: number) => {
    setConsumption(newCons);
    setFuelPrice(newPrice);
    const calculated = calculateCostPerKm(newCons, newPrice);
    setCostPerKm(calculated);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const values = [dailyGoal, weeklyGoal, fallbackHourlyRate, defaultCommissionPct, defaultTaxPct, movementThreshold, consumption, fuelPrice, displayedCostPerKm];
    if (values.some((value) => !Number.isFinite(value) || value < 0)
      || defaultCommissionPct > 100 || defaultTaxPct > 100) {
      alert('Introduza apenas valores numéricos válidos.');
      return;
    }
    onUpdateSettings({
      dailyGoal: Number(dailyGoal),
      weeklyGoal: Number(weeklyGoal),
      fallbackHourlyRate: Number(fallbackHourlyRate),
      defaultCommissionPct: Number(defaultCommissionPct),
      defaultTaxPct: Number(defaultTaxPct),
      movementThresholdSpeedKmh: Number(movementThreshold),
      soundEnabled,
      voiceEnabled,
      aircraftSpeedometerEnabled,
      enabledPlatforms,
      vehicleEnergy: {
        vehicleType,
        consumptionPer100Km: Number(consumption),
        fuelPricePerUnit: Number(fuelPrice),
        costPerKm: Number(displayedCostPerKm.toFixed(3)),
      },
    });
    onClose();
  };

  const handleExportJSON = () => {
    const dataBlob = new Blob([JSON.stringify({ records, settings }, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(dataBlob);
    const now = new Date();
    const localDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', objectUrl);
    downloadAnchor.setAttribute('download', `driverwise_backup_${localDate}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      if (file.size > 5 * 1024 * 1024) {
        alert('O backup não pode exceder 5 MB.');
        return;
      }
      fileReader.onerror = () => alert('Não foi possível ler o ficheiro selecionado.');
      fileReader.readAsText(file, 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (!parsed || !Array.isArray(parsed.records) || parsed.records.length > 10000) {
            throw new Error('O backup não contém uma lista válida de registos.');
          }
          void Promise.resolve(onImportRecords(parsed.records)).then(() => {
            if (parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)) {
              onUpdateSettings(parsed.settings as Partial<UserSettings>);
            }
            alert(`Foram importados com sucesso ${parsed.records.length} registos!`);
            onClose();
          }).catch((error) => {
            alert(error instanceof Error ? error.message : 'Não foi possível importar os registos.');
          });
        } catch {
          alert('Erro ao ler o ficheiro JSON. Certifique-se de que é uma cópia de segurança válida do DriverWise.');
        }
      };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] text-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>⚙️ Definições & Parâmetros</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* 1. Metas Diárias & Semanais */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              Metas de Faturação & Parâmetros
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Meta Diária (€)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Meta Semanal (€)</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={weeklyGoal}
                  onChange={(e) => setWeeklyGoal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1" title="Valor médio estimado utilizado antes de ter histórico suficiente no turno">
                  Ref. Horária (€/h)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={fallbackHourlyRate}
                  onChange={(e) => setFallbackHourlyRate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1" title="Velocidade mínima GPS para considerar o veículo em circulação vs imobilizado">
                  Limiar GPS (km/h)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="1"
                  value={movementThreshold}
                  onChange={(e) => setMovementThreshold(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 italic mt-1">
              * A Referência Horária é a média padrão (€/h) usada nas estimativas em tempo real.
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Comissão padrão (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={defaultCommissionPct}
                  onChange={(e) => setDefaultCommissionPct(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Impostos padrão (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={defaultTaxPct}
                  onChange={(e) => setDefaultTaxPct(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 italic mt-1">
              Estes valores aplicam-se automaticamente no fecho do turno e podem ser ajustados nesse momento.
            </p>
          </div>

          {/* 2. Visualização do velocímetro */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-sky-400" />
              Visualização do Velocímetro
            </h4>
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 cursor-pointer text-xs hover:border-sky-500/40 transition-colors">
              <input
                type="checkbox"
                checked={aircraftSpeedometerEnabled}
                onChange={(e) => setAircraftSpeedometerEnabled(e.target.checked)}
                className="mt-0.5 rounded text-sky-500 focus:ring-0 bg-slate-950"
              />
              <span className="space-y-1">
                <span className="block font-bold text-slate-100">Modo avião leve</span>
                <span className="block text-[11px] leading-relaxed text-slate-400">
                  Mostra um avião vetorial numa pista: acelera, descola e ganha efeitos de velocidade; ao desacelerar, regressa à pista e pousa. Foi desenhado para manter o browser do Tesla fluido e não usa WebGL nem modelos 3D pesados.
                </span>
              </span>
            </label>
          </div>

          {/* 2. Plataformas Ativas */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              Plataformas Disponíveis
            </h4>
            <div className="flex flex-wrap gap-2">
              {(['uber', 'bolt', 'freenow', 'other'] as PlatformType[]).map((plat) => {
                const active = enabledPlatforms.includes(plat);
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => handleTogglePlatform(plat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      active
                        ? 'bg-slate-800 border-slate-600 text-white'
                        : 'bg-slate-900/40 border-slate-800/80 text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    {(plat === 'freenow' ? 'FreeNow' : plat === 'other' ? 'Outra' : plat.toUpperCase())} {active ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Veículo & Combustível */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-emerald-400" />
                Veículo & Eficiência de Combustível
              </h4>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {displayedCostPerKm.toFixed(3)} €/km
              </span>
            </div>

            {/* Presets de Veículo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'electric', name: '⚡ Elétrico' },
                  { id: 'hybrid', name: '🔋 Híbrido' },
                  { id: 'diesel', name: '⛽ Gasóleo' },
                  { id: 'petrol', name: '⛽ Gasolina' },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectPreset(v.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    vehicleType === v.id
                      ? 'bg-slate-800 border-slate-600 text-white shadow-sm'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>

            {/* Consumo e Preço */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Consumo Médio (por 100 km)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={consumption}
                  onChange={(e) =>
                    handleConsumptionOrPriceChange(parseFloat(e.target.value) || 0, fuelPrice)
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Preço por Unidade (€/L ou €/kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={fuelPrice}
                  onChange={(e) =>
                    handleConsumptionOrPriceChange(consumption, parseFloat(e.target.value) || 0)
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
              <span className="font-bold text-emerald-300">Estimativa automática:</span>{' '}
              {observedCostPerKm !== null
                ? `os seus registos indicam ${displayedCostPerKm.toFixed(3)} €/km, com base no combustível/energia registado e em ${records.reduce((sum, record) => sum + Math.max(0, record.distanceKm || 0), 0).toFixed(1)} km.`
                : 'ainda não há combustível e quilómetros suficientes no histórico; é usada a estimativa do consumo e preço por unidade.'}
            </div>
          </div>

          {/* 4. Notificações e Sons de Metas */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
              Sons de Conquistas de Metas (50%, 75%, 100%)
            </h4>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-0 bg-slate-950"
                />
                <span>Efeitos Sonoros</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(e) => setVoiceEnabled(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-0 bg-slate-950"
                />
                <span>Alertas Vocais</span>
              </label>
            </div>
          </div>

          {/* 5. Gestão de Dados */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Cópia de Segurança & Dados
            </h4>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportJSON}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Backup</span>
              </button>

              <label className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                <Upload className="w-3.5 h-3.5" />
                <span>Importar Backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>
            </div>

            {confirmClear ? (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                    onClose();
                  }}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                >
                  Confirmar Eliminação Total
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="w-full py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 text-xs font-semibold transition-all text-center"
              >
                Apagar Todo o Histórico
              </button>
            )}
          </div>

          {/* Botão Salvar */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Alterações</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
