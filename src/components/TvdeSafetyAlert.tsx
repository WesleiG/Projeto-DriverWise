import React from 'react';
import { ShieldAlert, AlertTriangle, Coffee, Info, X } from 'lucide-react';
import { formatSecondsToDigital } from '../utils/formatters';

interface TvdeSafetyAlertProps {
  activeDurationSeconds: number;
  onPauseShift?: () => void;
}

export const TvdeSafetyAlert: React.FC<TvdeSafetyAlertProps> = ({
  activeDurationSeconds,
  onPauseShift,
}) => {
  const [isDismissed, setIsDismissed] = React.useState(false);
  const hours = activeDurationSeconds / 3600;

  if (hours < 6 || isDismissed) return null;

  const isCritical = hours >= 10;
  const isWarning = hours >= 8 && hours < 10;

  return (
    <div
      className={`rounded-2xl p-4 border shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 transition-all ${
        isCritical
          ? 'bg-rose-950/80 border-rose-600/70 text-rose-200'
          : isWarning
          ? 'bg-amber-950/80 border-amber-500/60 text-amber-200'
          : 'bg-sky-950/70 border-sky-600/50 text-sky-200'
      }`}
    >
      <div className="flex items-start sm:items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isCritical
              ? 'bg-rose-600 text-white animate-bounce'
              : isWarning
              ? 'bg-amber-500 text-slate-950'
              : 'bg-sky-500 text-slate-950'
          }`}
        >
          {isCritical ? (
            <ShieldAlert className="w-6 h-6" />
          ) : isWarning ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <Info className="w-5 h-5" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider">
              {isCritical
                ? 'LIMITE LEGAL TVDE ATINGIDO (10 HORAS)'
                : isWarning
                ? 'Aviso de Condução Prolongada (Lei TVDE)'
                : 'Pausa Recomendada'}
            </h4>
            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-black/40">
              {formatSecondsToDigital(activeDurationSeconds)}
            </span>
          </div>
          <p className="text-[11px] opacity-90 mt-0.5 max-w-xl">
            {isCritical
              ? 'A Lei n.º 45/2018 estabelece o limite máximo de 10 horas de condução em 24h. Encerre o turno para cumprir o descanso obrigatório.'
              : isWarning
              ? 'Já completou mais de 8 horas de condução. Planeie o término do seu turno para não exceder as 10 horas máximas legais.'
              : 'Conduzir mais de 6 horas reduz os reflexos. Considere fazer uma pausa de 15 minutos.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        {onPauseShift && (
          <button
            onClick={onPauseShift}
            className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-1.5 transition-all whitespace-nowrap"
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>Fazer Pausa</span>
          </button>
        )}
        <button
          onClick={() => setIsDismissed(true)}
          className="p-1.5 rounded-lg opacity-70 hover:opacity-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
