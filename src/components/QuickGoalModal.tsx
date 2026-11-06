import React, { useState, useEffect } from 'react';
import { Target, X, Check } from 'lucide-react';

interface QuickGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGoal: number;
  isLight?: boolean;
  onSaveGoal: (newGoal: number) => void;
}

const PRESET_GOALS = [100, 120, 140, 150, 180, 200, 220, 250];

export const QuickGoalModal: React.FC<QuickGoalModalProps> = ({
  isOpen,
  onClose,
  currentGoal,
  isLight = false,
  onSaveGoal,
}) => {
  const [goal, setGoal] = useState<number>(currentGoal);

  useEffect(() => {
    setGoal(currentGoal);
  }, [currentGoal, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (goal > 0) {
      onSaveGoal(goal);
      onClose();
    }
  };

  const handleSelectPreset = (value: number) => {
    setGoal(value);
    onSaveGoal(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className={`relative w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 border transition-all ${
        isLight
          ? 'bg-white border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Cabeçalho */}
        <div className={`flex items-center justify-between border-b pb-3 ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Alterar Meta Diária</h3>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Ajuste o objetivo de faturação bruta</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'
                : 'hover:bg-slate-800 border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Atalhos Rápidos (1-Toque) */}
        <div className="space-y-1.5">
          <span className={`text-[10px] uppercase font-bold tracking-wider block ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            Atalhos Rápidos de 1-Toque
          </span>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_GOALS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`py-2 rounded-xl font-mono font-bold text-xs border transition active:scale-95 ${
                  goal === preset
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                {preset} €
              </button>
            ))}
          </div>
        </div>

        {/* Campo Personalizado */}
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div>
            <label className={`block text-[10px] mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Ou digite um valor personalizado (€):
            </label>
            <div className="relative">
              <input
                type="number"
                min="10"
                max="1000"
                step="10"
                value={goal}
                onChange={(e) => setGoal(parseFloat(e.target.value) || 0)}
                className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-mono border focus:outline-none focus:border-amber-500 ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-white'
                }`}
                placeholder="Ex: 160"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-xs text-slate-500">
                EUR (€)
              </span>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold transition ${
                isLight
                  ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Guardar Meta</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
