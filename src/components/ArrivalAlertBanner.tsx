import React from 'react';
import { Flag, X, Navigation, Clock } from 'lucide-react';
import { formatSecondsToDigital } from '../utils/formatters';

interface ArrivalAlertBannerProps {
  isOpen: boolean;
  tripDurationSeconds: number;
  onConfirmFinishTrip: () => void;
  onDismiss: () => void;
}

export const ArrivalAlertBanner: React.FC<ArrivalAlertBannerProps> = ({
  isOpen,
  tripDurationSeconds,
  onConfirmFinishTrip,
  onDismiss,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl shadow-black/80 ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white">Chegou ao Destino?</h4>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-semibold">
                  0 km/h
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-sky-400" />
                Viagem: <span className="font-bold text-white">{formatSecondsToDigital(tripDurationSeconds)}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
          Veículo imobilizado. Deseja concluir esta corrida e contabilizá-la?
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all text-center"
          >
            Continuar Viagem
          </button>

          <button
            type="button"
            onClick={onConfirmFinishTrip}
            className="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
          >
            <Flag className="w-3.5 h-3.5 fill-current" />
            <span>Finalizar Corrida</span>
          </button>
        </div>
      </div>
    </div>
  );
};
