import React, { useState } from 'react';
import { Fuel, Zap, X, Check, Euro } from 'lucide-react';
import { FuelExpense, UserSettings } from '../types/earnings';

interface QuickFuelExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  isLight?: boolean;
  onAddExpense: (input: Omit<FuelExpense, 'id' | 'createdAt'>) => void;
}

export const QuickFuelExpenseModal: React.FC<QuickFuelExpenseModalProps> = ({
  isOpen,
  onClose,
  settings,
  isLight = false,
  onAddExpense,
}) => {
  const isElectric = settings.vehicleEnergy?.vehicleType === 'electric';
  const parseLocaleNumber = (value: string) => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const [amount, setAmount] = useState<string>('');
  const [litersOrKwh, setLitersOrKwh] = useState<string>('');
  const [stationName, setStationName] = useState<string>('');

  if (!isOpen) return null;

  const quickAmounts = isElectric ? [10, 15, 20, 25, 35] : [20, 30, 40, 50, 70];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseLocaleNumber(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) return;

    const parsedQty = litersOrKwh ? parseLocaleNumber(litersOrKwh) : undefined;
    if (parsedQty !== undefined && (!Number.isFinite(parsedQty) || parsedQty <= 0 || parsedQty > 10000)) return;
    const note = stationName.trim()
      ? `${isElectric ? 'Carregamento EV' : 'Abastecimento'} (${stationName.trim()})`
      : isElectric
      ? 'Carregamento EV Rápido'
      : 'Abastecimento de Combustível';

    onAddExpense({
      amount: parsedAmount,
      notes: note,
      quantity: parsedQty,
      unit: isElectric ? 'kwh' : 'liters',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-md rounded-3xl p-6 shadow-2xl border transition-all animate-in zoom-in-95 duration-150 ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-white'
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isElectric
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
              }`}
            >
              {isElectric ? <Zap className="w-5 h-5" /> : <Fuel className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold">
                {isElectric ? 'Registar Carregamento' : 'Registar Abastecimento'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deduzido automaticamente no lucro líquido do turno
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Seleção de Valor Rápido */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              Valores Rápidos:
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q.toString())}
                  className={`py-2 rounded-xl text-xs font-bold font-mono transition border ${
                    amount === q.toString()
                      ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/20'
                      : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  {q}€
                </button>
              ))}
            </div>
          </div>

          {/* Campo de Valor Personalizado */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Valor da Despesa (€):
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Euro className="w-4 h-4" />
              </div>
              <input
                type="number"
                step="0.01"
                min="0.5"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="20.00"
                className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-600'
                }`}
              />
            </div>
          </div>

          {/* Quantidade (L ou kWh) e Nome do Posto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                {isElectric ? 'Energia (kWh):' : 'Volume (Litros):'}
              </label>
              <input
                type="number"
                step="0.1"
                value={litersOrKwh}
                onChange={(e) => setLitersOrKwh(e.target.value)}
                placeholder={isElectric ? 'Ex: 28.5' : 'Ex: 22.0'}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-600'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Posto / Rede:
              </label>
              <input
                type="text"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder={isElectric ? 'Mobi.e / Tesla' : 'Galp / BP / Prio'}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-600'
                }`}
              />
            </div>
          </div>

          {/* Análise Dinâmica de Eficiência Energética (Sugestão 1) */}
          {parseLocaleNumber(amount) > 0 && parseLocaleNumber(litersOrKwh) > 0 && (
            <div className={`p-3 rounded-2xl border text-xs space-y-1 font-mono transition-all animate-in fade-in ${
              isLight
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span>Preço Unitário Real:</span>
                <span className="text-emerald-500">
                  {(parseLocaleNumber(amount) / parseLocaleNumber(litersOrKwh)).toFixed(3)} €/{isElectric ? 'kWh' : 'L'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span>Eficiência Calculada:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {isElectric
                    ? `~${((parseLocaleNumber(amount) / parseLocaleNumber(litersOrKwh)) * (settings.vehicleEnergy?.consumptionPer100Km ?? 0) / 100).toFixed(3)} €/km`
                    : `~${((parseLocaleNumber(amount) / parseLocaleNumber(litersOrKwh)) * (settings.vehicleEnergy?.consumptionPer100Km ?? 0) / 100).toFixed(3)} €/km`}
                </span>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Registar Despesa</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
