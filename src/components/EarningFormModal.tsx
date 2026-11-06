import React, { useState, useEffect } from 'react';
import { EarningRecord, PlatformType } from '../types/earnings';
import { applyUniversalShiftCosts } from '../utils/platformShiftRecords';
import type { PlatformRecordDraft, UniversalShiftCosts } from '../utils/platformShiftRecords';
import { calculateHoursBetween, calculateNetEarnings } from '../utils/calculations';
import { formatCurrency } from '../utils/formatters';
import { X, Save, Clock, Users, Trash2 } from 'lucide-react';

const structuredFuelTotal = (expenses: EarningRecord['fuelExpenses']) =>
  (expenses || []).reduce((total, expense) => total + (Number.isFinite(expense.amount) ? Math.max(0, expense.amount) : 0), 0);

export type EarningFormInitialData = Partial<EarningRecord> & {
  platformTripsCount?: Partial<Record<PlatformType, number>>;
  platformRecords?: PlatformRecordDraft[];
};

interface EarningFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: Omit<EarningRecord, 'id' | 'createdAt' | 'updatedAt' | 'netEarnings'>, editId?: string) => void;
  onSaveMany?: (records: PlatformRecordDraft[]) => void;
  onDiscardShift?: () => void;
  initialData?: EarningFormInitialData | null;
  defaultCommissionPct?: number;
  defaultTaxPct?: number;
}

export const EarningFormModal: React.FC<EarningFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onSaveMany,
  onDiscardShift,
  initialData,
  defaultCommissionPct = 0,
  defaultTaxPct = 0,
}) => {
  const [platform, setPlatform] = useState<PlatformType>('uber');
  const [platformDrafts, setPlatformDrafts] = useState<PlatformRecordDraft[] | null>(null);
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [totalHours, setTotalHours] = useState<number>(0);
  const [passengerHours, setPassengerHours] = useState<number>(0);

  const [grossEarnings, setGrossEarnings] = useState<number>(0);
  const [tips, setTips] = useState<number>(0);
  const [bonuses, setBonuses] = useState<number>(0);
  const [tollsReimbursed, setTollsReimbursed] = useState<number>(0);

  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [passengerDistanceKm, setPassengerDistanceKm] = useState<number>(0);
  const [emptyDistanceKm, setEmptyDistanceKm] = useState<number>(0);
  const [tripsCount, setTripsCount] = useState<number>(0);

  const [fuelCost, setFuelCost] = useState<number>(0);
  const [otherExpenses, setOtherExpenses] = useState<number>(0);
  const [universalFuelCost, setUniversalFuelCost] = useState<number>(0);
  const [universalOtherExpenses, setUniversalOtherExpenses] = useState<number>(0);
  const [commissionPct, setCommissionPct] = useState<number>(defaultCommissionPct);
  const [taxPct, setTaxPct] = useState<number>(defaultTaxPct);
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const loadFields = (data: Partial<EarningRecord>) => {
    setDate(data.date ?? '');
    setStartTime(data.startTime ?? '');
    setEndTime(data.endTime ?? '');
    setTotalHours(data.totalHours ?? 0);
    setPassengerHours(data.passengerHours ?? 0);
    setGrossEarnings(data.grossEarnings ?? 0);
    setTips(data.tips ?? 0);
    setBonuses(data.bonuses ?? 0);
    setTollsReimbursed(data.tollsReimbursed ?? 0);
    setDistanceKm(data.distanceKm ?? 0);
    setPassengerDistanceKm(data.passengerDistanceKm ?? 0);
    setEmptyDistanceKm(data.emptyDistanceKm ?? 0);
    setTripsCount(data.tripsCount ?? 0);
    setFuelCost(Math.max(data.fuelCost ?? 0, structuredFuelTotal(data.fuelExpenses)));
    setOtherExpenses(data.otherExpenses ?? 0);
    setNotes(data.notes ?? '');
  };

  useEffect(() => {
    if (initialData?.platformRecords?.length) {
      const drafts = initialData.platformRecords;
      const firstDraft = drafts[0];
      const declaredFuel = drafts.reduce((sum, draft) => sum + Math.max(0, draft.fuelCost || 0), 0);
      const structuredFuel = drafts.reduce((sum, draft) => sum + structuredFuelTotal(draft.fuelExpenses), 0);
      const totalFuel = Math.max(declaredFuel, structuredFuel);
      const totalOtherExpenses = drafts.reduce((sum, draft) => sum + Math.max(0, draft.otherExpenses || 0), 0);
      setPlatformDrafts(drafts);
      setPlatform(firstDraft.platform);
      setUniversalFuelCost(Number(totalFuel.toFixed(2)));
      setUniversalOtherExpenses(Number(totalOtherExpenses.toFixed(2)));
      setFuelCost(Number(totalFuel.toFixed(2)));
      setOtherExpenses(Number(totalOtherExpenses.toFixed(2)));
      setCommissionPct(defaultCommissionPct);
      setTaxPct(defaultTaxPct);
      loadFields(firstDraft);
    } else if (initialData) {
      setPlatformDrafts(null);
      setPlatform(initialData.platform ?? 'uber');
      const isExistingRecord = Boolean(initialData.id);
      const gross = Math.max(0, initialData.grossEarnings ?? 0);
      const legacyCommissionPct = gross > 0 ? ((initialData.commissionCost ?? 0) / gross) * 100 : defaultCommissionPct;
      const legacyTaxPct = gross > 0 ? ((initialData.taxCost ?? 0) / gross) * 100 : defaultTaxPct;
      setUniversalFuelCost(Math.max(initialData.fuelCost ?? 0, structuredFuelTotal(initialData.fuelExpenses)));
      setUniversalOtherExpenses(initialData.otherExpenses ?? 0);
      setCommissionPct(initialData.commissionPct ?? (isExistingRecord ? legacyCommissionPct : defaultCommissionPct));
      setTaxPct(initialData.taxPct ?? (isExistingRecord ? legacyTaxPct : defaultTaxPct));
      loadFields(initialData);
    } else {
      setPlatformDrafts(null);
      setPlatform('uber');
      setUniversalFuelCost(0);
      setUniversalOtherExpenses(0);
      setCommissionPct(defaultCommissionPct);
      setTaxPct(defaultTaxPct);
      loadFields({});
    }
    setFormError(null);
  }, [initialData, isOpen, defaultCommissionPct, defaultTaxPct]);

  const buildCurrentRecord = (): PlatformRecordDraft => {
    const currentDraft = platformDrafts?.find((draft) => draft.platform === platform);
    const currentGross = Number(grossEarnings);
    const currentCommissionCost = platformDrafts
      ? Number(currentDraft?.commissionCost ?? 0)
      : Number((Math.max(0, currentGross) * Math.max(0, commissionPct) / 100).toFixed(2));
    const currentTaxCost = platformDrafts
      ? Number(currentDraft?.taxCost ?? 0)
      : Number((Math.max(0, currentGross) * Math.max(0, taxPct) / 100).toFixed(2));
    return {
      platform,
      date,
      startTime,
      endTime,
      totalHours: Number(totalHours),
      passengerHours: Number(passengerHours),
      passengerDistanceKm: Number(passengerDistanceKm),
      emptyDistanceKm: Number(emptyDistanceKm),
      occupancyRatePct: occupancyRate,
      grossEarnings: Number(grossEarnings),
      tips: Number(tips),
      bonuses: Number(bonuses),
      tollsReimbursed: Number(tollsReimbursed),
      distanceKm: Number(distanceKm),
      tripsCount: Number(tripsCount),
      trips: currentDraft?.trips || initialData?.trips || [],
      fuelCost: platformDrafts ? Number(currentDraft?.fuelCost ?? 0) : Number(universalFuelCost),
      fuelExpenses: currentDraft?.fuelExpenses || initialData?.fuelExpenses || [],
      commissionCost: currentCommissionCost,
      commissionPct: Number(commissionPct),
      taxCost: currentTaxCost,
      taxPct: Number(taxPct),
      otherExpenses: platformDrafts ? Number(currentDraft?.otherExpenses ?? 0) : Number(universalOtherExpenses),
      hourlySegments: currentDraft?.hourlySegments || initialData?.hourlySegments || [],
      notes,
    };
  };

  const handlePlatformSelect = (nextPlatform: PlatformType) => {
    if (!platformDrafts) {
      setPlatform(nextPlatform);
      return;
    }

    const nextDraft = platformDrafts.find((draft) => draft.platform === nextPlatform);
    if (!nextDraft) return;

    const currentRecord = buildCurrentRecord();
    setPlatformDrafts((currentDrafts) => currentDrafts
      ? currentDrafts.map((draft) => draft.platform === platform ? currentRecord : draft)
      : currentDrafts);
    setPlatform(nextPlatform);
    loadFields(nextDraft);
  };

  const handleTimeChange = (newStart: string, newEnd: string) => {
    setStartTime(newStart);
    setEndTime(newEnd);
    const calculated = calculateHoursBetween(newStart, newEnd);
    setTotalHours(calculated);
  };

  const occupancyRate = totalHours > 0 ? Math.min(100, Math.round((passengerHours / totalHours) * 100)) : 0;

  const universalCosts: UniversalShiftCosts = {
    fuelCost: Number(universalFuelCost),
    otherExpenses: Number(universalOtherExpenses),
    commissionPct: Number(commissionPct),
    taxPct: Number(taxPct),
  };
  const currentRecord = buildCurrentRecord();
  const previewRecords = platformDrafts
    ? applyUniversalShiftCosts(
        platformDrafts.map((draft) => draft.platform === platform ? currentRecord : draft),
        universalCosts
      )
    : applyUniversalShiftCosts([currentRecord], universalCosts);
  const previewRecord = previewRecords.find((record) => record.platform === platform) || currentRecord;
  const displayedFuelCost = platformDrafts ? universalFuelCost : fuelCost;
  const displayedOtherExpenses = platformDrafts ? universalOtherExpenses : otherExpenses;
  const calculatedNet = calculateNetEarnings(
    previewRecord.grossEarnings,
    previewRecord.tips,
    previewRecord.bonuses,
    previewRecord.fuelCost,
    previewRecord.commissionCost,
    previewRecord.otherExpenses,
    previewRecord.tollsReimbursed,
    previewRecord.taxCost
  );

  const calculatedPassengerHourly = passengerHours > 0
    ? (previewRecord.grossEarnings + previewRecord.tips + previewRecord.bonuses + previewRecord.tollsReimbursed) / passengerHours
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const currentRecordToSave = buildCurrentRecord();
    const recordsToSave = platformDrafts
      ? applyUniversalShiftCosts(platformDrafts.map((draft) => draft.platform === platform ? currentRecordToSave : {
          ...draft,
          date,
          startTime,
          endTime,
        }), universalCosts)
      : applyUniversalShiftCosts([currentRecordToSave], universalCosts);

    const structuredFuelTotalToSave = recordsToSave.reduce((sum, record) => sum + structuredFuelTotal(record.fuelExpenses), 0);
    if (universalFuelCost + 0.001 < structuredFuelTotalToSave) {
      setFormError('O combustível/energia não pode ser inferior ao total dos abastecimentos adicionados.');
      return;
    }

    for (const record of recordsToSave) {
      const numericValues: number[] = [
        record.totalHours,
        record.passengerHours,
        record.grossEarnings,
        record.tips,
        record.bonuses,
        record.tollsReimbursed,
        record.distanceKm,
        record.passengerDistanceKm ?? 0,
        record.emptyDistanceKm ?? 0,
        record.tripsCount,
        record.fuelCost,
        record.commissionCost,
        record.commissionPct ?? 0,
        record.taxCost ?? 0,
        record.taxPct ?? 0,
        record.otherExpenses,
      ];
      if (!record.date || !record.startTime || !record.endTime || numericValues.some((value) => !Number.isFinite(value) || value < 0)
        || (record.commissionPct ?? 0) > 100 || (record.taxPct ?? 0) > 100) {
        setFormError('Preencha a data, os horários e valores válidos antes de guardar.');
        return;
      }
      if (record.passengerHours > record.totalHours || (record.passengerDistanceKm ?? 0) + (record.emptyDistanceKm ?? 0) > record.distanceKm + 0.01) {
        setFormError('As horas ou quilómetros detalhados não podem exceder os totais do turno.');
        return;
      }
    }

    if (platformDrafts && onSaveMany) {
      onSaveMany(recordsToSave);
    } else {
      onSave(recordsToSave[0], initialData?.id || undefined);
    }

    onClose();
  };

  if (!isOpen) return null;

  const platforms: { id: PlatformType; name: string }[] = [
    { id: 'uber', name: 'Uber' },
    { id: 'bolt', name: 'Bolt' },
    { id: 'freenow', name: 'FreeNow' },
    { id: 'other', name: 'Outra' },
  ];

  const platTrips = initialData?.platformTripsCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div>
            <h3 className="text-base font-bold text-white">
              {initialData?.id ? 'Editar Registo de Turno' : platformDrafts ? 'Registar Turno por Plataforma' : 'Registar Turno Concluído'}
            </h3>
            <p className="text-xs text-slate-400">
              {platformDrafts
                ? `${platformDrafts.length} plataformas detetadas. Cada registo ficará separado no histórico.`
                : 'Confirme os valores apurados e detalhes do turno'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {formError && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{formError}</p>}
          {/* Seleção de Plataforma */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Plataforma do Registo
              </label>
              {platTrips && Object.values(platTrips).some((c) => (c || 0) > 0) && (
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  Viagens detetadas no turno
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {platforms.map((p) => {
                const draft = platformDrafts?.find((item) => item.platform === p.id);
                const count = draft?.tripsCount ?? platTrips?.[p.id] ?? 0;
                const available = !platformDrafts || Boolean(draft);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePlatformSelect(p.id)}
                    disabled={!available}
                    aria-pressed={platform === p.id}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all flex flex-col items-center justify-center gap-0.5 ${
                      platform === p.id
                        ? 'bg-slate-800 border-slate-600 text-white shadow-sm ring-1 ring-emerald-400/40'
                        : available
                          ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-slate-950/50 border-slate-900 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <span>{p.name}</span>
                    {count > 0 && (
                      <span className="text-[10px] text-emerald-400 font-mono">
                        ({count} viag.)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data e Horários */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Data do Turno</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-slate-600"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-sky-400" />
                Início / Fim
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleTimeChange(e.target.value, endTime)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-slate-600 text-center font-mono"
                  required
                />
                <span className="text-slate-500">:</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleTimeChange(startTime, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-slate-600 text-center font-mono"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-emerald-400" />
                Horas Úteis (c/ Passageiro)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max={totalHours}
                value={passengerHours}
                onChange={(e) => setPassengerHours(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-slate-600"
              />
            </div>
          </div>

          {/* Valores específicos da plataforma */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl space-y-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
                Valores desta plataforma
              </span>
              <span className="text-[10px] text-slate-500">
                Ganhos que pertencem exclusivamente à plataforma selecionada.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Faturação Bruta (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={grossEarnings}
                  onChange={(e) => setGrossEarnings(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-slate-600"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Gorjetas (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tips}
                  onChange={(e) => setTips(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Bónus / incentivos (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bonuses}
                  onChange={(e) => setBonuses(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Portagens reembolsadas (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tollsReimbursed}
                  onChange={(e) => setTollsReimbursed(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Custos universais do turno */}
          <div className="bg-slate-950/60 border border-amber-500/20 p-3.5 rounded-2xl space-y-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200 block">
                Custos universais do turno
              </span>
              <span className="text-[10px] text-slate-500">
                Estes valores são aplicados uma única vez e repartidos automaticamente entre todas as plataformas.
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Combustível / energia — total do turno (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={displayedFuelCost}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    setFuelCost(value);
                    setUniversalFuelCost(value);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-rose-400 focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Outras despesas — total do turno (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={displayedOtherExpenses}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    setOtherExpenses(value);
                    setUniversalOtherExpenses(value);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-rose-400 focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Comissão da plataforma (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-rose-400 focus:outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Impostos (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={taxPct}
                  onChange={(e) => setTaxPct(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-rose-400 focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Dedução estimada deste turno: comissão {formatCurrency(previewRecords.reduce((sum, record) => sum + record.commissionCost, 0))} + impostos {formatCurrency(previewRecords.reduce((sum, record) => sum + (record.taxCost ?? 0), 0))}.
              {platformDrafts ? ' Os totais serão repartidos entre as plataformas.' : ''}
            </p>
          </div>

          {/* Distância e Viagens */}
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Km Totais</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={distanceKm}
                onChange={(e) => {
                  const d = parseFloat(e.target.value) || 0;
                  setDistanceKm(d);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Km c/ Passageiro</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={passengerDistanceKm}
                onChange={(e) => setPassengerDistanceKm(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-slate-600"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">N.º Viagens</label>
              <input
                type="number"
                min="0"
                value={tripsCount}
                onChange={(e) => setTripsCount(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-slate-600"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Notas do Turno (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Turno concluído • 5 viagens Uber, 3 viagens Bolt..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-slate-600"
            />
          </div>

          {/* Resumo Dinâmico */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Líquido Previsto</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                {formatCurrency(calculatedNet)}
              </span>
            </div>
            <div className="text-right text-xs font-mono">
              <span className="text-slate-400 block">
                {formatCurrency(calculatedPassengerHourly)}/h útil
              </span>
              <span className="text-[10px] text-slate-500">
                Taxa de ocupação: {occupancyRate}%
              </span>
            </div>
          </div>

          {/* Ações (Descartar Turno / Cancelar / Guardar Registo) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
            {onDiscardShift && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Tem a certeza de que deseja descartar este turno? Todos os dados em tempo real serão zerados sem guardar.')) {
                    onDiscardShift();
                    onClose();
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Descartar Turno</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-all"
              >
                Fechar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{platformDrafts ? `Guardar Todos (${platformDrafts.length})` : 'Guardar Registo'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
