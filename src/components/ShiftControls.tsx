import React from 'react';
import { ShiftSession } from '../types/session';
import { PlatformType } from '../types/earnings';
import { Play, Pause, Square, MapPin, Gamepad2, Users, Flag } from 'lucide-react';
import { formatSecondsToDigital } from '../utils/formatters';

interface ShiftControlsProps {
  session: ShiftSession;
  onStartShift: (platform: PlatformType | 'all') => void;
  onPauseShift: () => void;
  onResumeShift: () => void;
  onFinishShift: () => void;
  onTogglePassenger: () => void;
  onToggleTrackingMode: (mode: 'real_gps' | 'joystick') => void;
  onSelectPlatform: (platform: PlatformType | 'all') => void;
}

export const ShiftControls: React.FC<ShiftControlsProps> = ({
  session,
  onStartShift,
  onPauseShift,
  onResumeShift,
  onFinishShift,
  onTogglePassenger,
  onToggleTrackingMode,
  onSelectPlatform,
}) => {
  const isIdle = session.state === 'idle';
  const isActive = session.state === 'active';

  const platforms: Array<{ id: PlatformType | 'all'; name: string; badge: string }> = [
    { id: 'all', name: 'Todas', badge: 'Todas as Plataformas' },
    { id: 'uber', name: 'Uber', badge: 'Uber' },
    { id: 'bolt', name: 'Bolt', badge: 'Bolt' },
    { id: 'freenow', name: 'FreeNow', badge: 'FreeNow' },
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 shadow-xl space-y-4">
      {/* 1. Estado de Passageiro em Viagem (quando ativo) */}
      {!isIdle && (
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              Estado da Viagem
            </span>
            <span className="font-mono text-slate-400">
              {session.tripsCompletedCount} {session.tripsCompletedCount === 1 ? 'concluída' : 'concluídas'}
            </span>
          </div>

          {session.hasPassenger ? (
            <button
              type="button"
              onClick={() => onTogglePassenger()}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide flex items-center justify-between transition-all active:scale-[0.99] shadow-md shadow-emerald-500/20"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
                <span className="uppercase tracking-wider">🟢 Em Viagem com Passageiro</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-[11px] font-bold">{formatSecondsToDigital(session.passengerDurationSeconds)}</span>
                <span className="bg-slate-950/20 px-2 py-0.5 rounded text-[10px] uppercase font-semibold flex items-center gap-1">
                  <Flag className="w-2.5 h-2.5" /> Finalizar
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onTogglePassenger()}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 hover:border-slate-700 font-bold text-xs tracking-wide flex items-center justify-between transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-slate-300 font-medium">Sem Passageiro (À Espera)</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-slate-500">{formatSecondsToDigital(session.emptyDurationSeconds)}</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-emerald-400 text-[10px] uppercase font-bold">
                  + Iniciar
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* 2. Seleção de Plataforma & Modo de Captura */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Plataforma */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
            Plataforma
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {platforms.map((p) => {
              const isSelected = session.platform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectPlatform(p.id)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all text-center ${
                    isSelected
                      ? 'bg-slate-800 border-slate-600 text-white shadow-sm ring-1 ring-white/10'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Localização */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
            Localização
          </label>
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => onToggleTrackingMode('joystick')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                session.trackingMode === 'joystick'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Joystick</span>
            </button>
            <button
              onClick={() => onToggleTrackingMode('real_gps')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                session.trackingMode === 'real_gps'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>GPS Real</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Botões de Turno */}
      <div>
        {isIdle ? (
          <button
            onClick={() => onStartShift(session.platform)}
            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99]"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>INICIAR TURNO DE TRABALHO</span>
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            {isActive ? (
              <button
                onClick={onPauseShift}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar</span>
              </button>
            ) : (
              <button
                onClick={onResumeShift}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Retomar</span>
              </button>
            )}

            <button
              onClick={onFinishShift}
              className="flex-1 py-3 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Concluir Turno</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
