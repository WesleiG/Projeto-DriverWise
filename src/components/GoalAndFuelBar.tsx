import React, { useState } from 'react';
import { Target, Sparkles, Edit2, Plus, Fuel, Zap } from 'lucide-react';
import { UserSettings, FuelExpense } from '../types/earnings';
import { QuickGoalModal } from './QuickGoalModal';
import { QuickFuelExpenseModal } from './QuickFuelExpenseModal';

interface GoalAndFuelBarProps {
  settings: UserSettings;
  currentEarnings: number;
  currentFuelCost: number;
  manualFuelCost: number;
  isInShift: boolean;
  isPrivacyMode?: boolean;
  isLight?: boolean;
  onUpdateSettings?: (settings: Partial<UserSettings>) => void;
  onAddFuelExpense?: (expense: Omit<FuelExpense, 'id' | 'createdAt'>) => void;
}

export const GoalAndFuelBar: React.FC<GoalAndFuelBarProps> = ({
  settings,
  currentEarnings,
  currentFuelCost,
  manualFuelCost,
  isInShift,
  isPrivacyMode = false,
  isLight = false,
  onUpdateSettings,
  onAddFuelExpense,
}) => {
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isFuelExpenseModalOpen, setIsFuelExpenseModalOpen] = useState(false);

  const effectiveEarnings = isInShift ? currentEarnings : 0;
  const dailyProgress =
    settings.dailyGoal > 0
      ? Math.min(100, Math.round((effectiveEarnings / settings.dailyGoal) * 100))
      : 0;
  const isGoalCompleted = settings.dailyGoal > 0 && effectiveEarnings >= settings.dailyGoal;

  const vehicleEnergy = settings.vehicleEnergy;
  const isElectric = vehicleEnergy?.vehicleType === 'electric';
  const vehicleLabel = isElectric
    ? 'Elétrico (EV)'
    : vehicleEnergy?.vehicleType === 'hybrid'
    ? 'Híbrido'
    : vehicleEnergy?.vehicleType === 'diesel'
    ? 'Gasóleo'
    : vehicleEnergy?.vehicleType === 'lpg'
    ? 'GPL'
    : 'Gasolina';
  const costPerKm = vehicleEnergy?.costPerKm ?? 0.08;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val);

  const formatExpense = (val: number) => val > 0 ? `-${formatCurrency(val)}` : formatCurrency(0);

  return (
    <>
      <div className="w-full flex flex-col sm:flex-row items-stretch justify-between gap-3">
        {/* Card 1: Meta Diária Expandido e Responsivo */}
        <button
          type="button"
          onClick={() => setIsGoalModalOpen(true)}
          className={`flex-1 flex flex-col justify-center border px-4 py-3 rounded-2xl space-y-1.5 transition-all active:scale-[0.99] group cursor-pointer shadow-md text-left ${
            isGoalCompleted
              ? 'bg-gradient-to-r from-amber-500/15 via-emerald-500/15 to-amber-500/15 border-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.2)] ring-1 ring-amber-400/60'
              : isLight
              ? 'bg-white hover:bg-slate-50 border-slate-200 hover:border-amber-400 shadow-slate-200/60'
              : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 hover:border-amber-500/50 shadow-black/40'
          }`}
          title="Clique para alterar a Meta Diária"
        >
          <div className="w-full flex items-center justify-between text-xs sm:text-sm whitespace-nowrap">
            <span
              className={`font-bold flex items-center gap-2 group-hover:text-amber-500 transition ${
                isLight ? 'text-slate-800' : 'text-slate-200'
              }`}
            >
              <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <span>
                Meta Diária: {isPrivacyMode ? '•••• €' : formatCurrency(settings.dailyGoal)}
              </span>
              <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 opacity-0 group-hover:opacity-100 transition shrink-0" />
            </span>
            <span
              className={`font-mono font-black text-sm shrink-0 flex items-center gap-1 ${
                isGoalCompleted ? 'text-amber-500' : 'text-emerald-500'
              }`}
            >
              {isGoalCompleted && <Sparkles className="w-4 h-4 text-amber-500" />}
              {dailyProgress}%
            </span>
          </div>

          {/* Barra de Progresso */}
          <div
            className={`w-full h-2 rounded-full overflow-hidden border ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isGoalCompleted
                  ? 'bg-gradient-to-r from-amber-400 to-emerald-400'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${dailyProgress}%` }}
            />
          </div>

          <div
            className={`w-full flex items-center justify-between text-[11px] font-mono whitespace-nowrap ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            <span className="text-amber-500 font-semibold group-hover:underline">
              {isGoalCompleted ? '🎉 100% ATINGIDA!' : '1-Toque para alterar'}
            </span>
            <span className={isGoalCompleted ? 'text-emerald-500 font-bold' : ''}>
              {isPrivacyMode
                ? '•••• €'
                : isGoalCompleted
                ? 'Objetivo Superado!'
                : `Faltam ${formatCurrency(Math.max(0, settings.dailyGoal - effectiveEarnings))}`}
            </span>
          </div>
        </button>

        {/* Card 2: Controlo de Combustível / Energia e Abastecimento */}
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border shadow-md sm:min-w-[280px] ${
            isLight
              ? 'bg-white border-slate-200 shadow-slate-200/60'
              : 'bg-slate-900/90 border-slate-800 shadow-black/40'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                isElectric
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
              }`}
            >
              {isElectric ? <Zap className="w-5 h-5" /> : <Fuel className="w-5 h-5" />}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`text-[10px] uppercase font-bold tracking-wide truncate ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {vehicleLabel} • {costPerKm.toFixed(3)}€/km
              </span>
              <span className="text-sm font-black font-mono text-rose-500">
                {formatExpense(isInShift ? currentFuelCost : 0)}
                {isInShift && manualFuelCost > 0 && (
                  <span className="text-[10px] text-slate-500 font-normal"> · manual</span>
                )}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsFuelExpenseModalOpen(true)}
            className={`shrink-0 px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition shadow-sm active:scale-95 ${
              isLight
                ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300'
            }`}
            title="Registar Abastecimento / Carregamento Elétrico"
          >
            <Plus className="w-4 h-4" />
            <span>Abastecer</span>
          </button>
        </div>
      </div>

      {/* Modal de Edição Rápida da Meta Diária */}
      <QuickGoalModal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        currentGoal={settings.dailyGoal}
        isLight={isLight}
        onSaveGoal={(newGoal) => {
          if (onUpdateSettings) {
            onUpdateSettings({ dailyGoal: newGoal });
          }
        }}
      />

      {/* Modal de Registo Rápido de Abastecimento / Carregamento Elétrico */}
      <QuickFuelExpenseModal
        isOpen={isFuelExpenseModalOpen}
        onClose={() => setIsFuelExpenseModalOpen(false)}
        settings={settings}
        isLight={isLight}
        onAddExpense={(input) => {
          if (onAddFuelExpense) {
            onAddFuelExpense(input);
          }
        }}
      />
    </>
  );
};
