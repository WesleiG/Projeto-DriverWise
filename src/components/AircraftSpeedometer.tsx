import React from 'react';
import { formatDistance } from '../utils/formatters';

interface AircraftSpeedometerProps {
  speedKmh: number;
  isMoving?: boolean;
  isShiftActive: boolean;
  isShiftPaused: boolean;
  hasPassenger: boolean;
  totalDistanceKm: number;
  heading?: number;
  isLight?: boolean;
}

const MAX_AIRCRAFT_SPEED = 180;
const TAKEOFF_SPEED = 22;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Velocímetro Cockpit do Avião:
 * - Física de Voo Ultra-Suave com Filtro Passa-Baixo (Anti-Ruído GPS) e LERP Contínuo a 60fps.
 * - Elimina qualquer salto ou oscilação brusca ("rasantes"), garantindo estabilidade aerodinâmica real.
 * - Inclinação de Asas (Banking) elegante (-18° a +18°) e Desvio Lateral Seguro (-26px a +26px).
 * - Transição fluida de altitude (54% a 16%) baseada na velocidade de cruzeiro.
 * - 100% acelerado por GPU com baixíssimo consumo de recursos para o ecrã do Tesla.
 */
export const AircraftSpeedometer: React.FC<AircraftSpeedometerProps> = React.memo(({
  speedKmh,
  isMoving = false,
  isShiftActive,
  isShiftPaused,
  totalDistanceKm,
  heading = 0,
  isLight = false,
}) => {
  const safeSpeed = Number.isFinite(speedKmh) ? clamp(speedKmh, 0, MAX_AIRCRAFT_SPEED) : 0;
  const effectiveSpeed = isShiftActive && !isShiftPaused ? safeSpeed : 0;
  const moving = isMoving && effectiveSpeed >= 1;
  const airborneLatchRef = React.useRef(false);

  // Estados de atitude de voo renderizados (interpolação suave)
  const [attitude, setAttitude] = React.useState({ roll: 0, yaw: 0, driftX: 0 });
  
  // Alvos da física de voo
  const targetAttitudeRef = React.useRef({ roll: 0, yaw: 0, driftX: 0 });
  const currentAttitudeRef = React.useRef({ roll: 0, yaw: 0, driftX: 0 });
  const prevHeadingRef = React.useRef<number | null>(null);
  const prevTimeRef = React.useRef<number>(Date.now());
  const smoothedTurnRateRef = React.useRef<number>(0);

  // Filtro de Passa-Baixo para a direção GPS (elimina o ruído do sensor)
  React.useEffect(() => {
    const now = Date.now();
    const dt = Math.max(0.1, (now - prevTimeRef.current) / 1000);
    prevTimeRef.current = now;

    if (!Number.isFinite(heading) || effectiveSpeed < 7) {
      targetAttitudeRef.current = { roll: 0, yaw: 0, driftX: 0 };
      smoothedTurnRateRef.current = 0;
      prevHeadingRef.current = Number.isFinite(heading) ? heading : null;
      return;
    }

    if (prevHeadingRef.current === null) {
      prevHeadingRef.current = heading;
      return;
    }

    let diff = heading - prevHeadingRef.current;
    prevHeadingRef.current = heading;

    // Normalizar a menor diferença angular (-180° a +180°)
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;

    // Ignorar micro-ruídos menores que 1.0 grau em linha reta
    if (Math.abs(diff) < 1.0) {
      diff = 0;
    }

    // Taxa instantânea de viragem (graus/segundo) limitada
    const instantTurnRate = clamp(diff / dt, -35, 35);
    
    // Média móvel exponencial (EMA) para amortecer qualquer oscilação
    const alpha = 0.22;
    smoothedTurnRateRef.current = smoothedTurnRateRef.current * (1 - alpha) + instantTurnRate * alpha;

    const rate = smoothedTurnRateRef.current;
    if (Math.abs(rate) > 0.4) {
      // Curva calculada com limites aeronáuticos estáveis
      const targetRoll = clamp(rate * 0.9, -18, 18);
      const targetYaw = clamp(rate * 0.3, -6, 6);
      const targetDrift = clamp(rate * 1.2, -26, 26);
      targetAttitudeRef.current = { roll: targetRoll, yaw: targetYaw, driftX: targetDrift };
    } else {
      targetAttitudeRef.current = { roll: 0, yaw: 0, driftX: 0 };
    }
  }, [heading, effectiveSpeed]);

  // Loop contínuo de interpolação linear (LERP) para movimento fluido como manteiga
  React.useEffect(() => {
    let animationFrameId: number;

    const updatePhysics = () => {
      const current = currentAttitudeRef.current;
      const target = targetAttitudeRef.current;

      // Fator de suavização (LERP)
      const ease = 0.085;
      current.roll += (target.roll - current.roll) * ease;
      current.yaw += (target.yaw - current.yaw) * ease;
      current.driftX += (target.driftX - current.driftX) * ease;

      // Se a diferença for insignificante, nivelar
      if (Math.abs(current.roll) < 0.05 && Math.abs(target.roll) === 0) current.roll = 0;
      if (Math.abs(current.yaw) < 0.05 && Math.abs(target.yaw) === 0) current.yaw = 0;
      if (Math.abs(current.driftX) < 0.05 && Math.abs(target.driftX) === 0) current.driftX = 0;

      setAttitude({
        roll: Number(current.roll.toFixed(2)),
        yaw: Number(current.yaw.toFixed(2)),
        driftX: Number(current.driftX.toFixed(2)),
      });

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    animationFrameId = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const wasAirborne = airborneLatchRef.current;
  const isLanding = wasAirborne && effectiveSpeed < TAKEOFF_SPEED && effectiveSpeed > 2;

  // Proporção de velocidade para altitude no céu (0 a 130 km/h)
  const speedRatio = isLanding
    ? clamp(effectiveSpeed / TAKEOFF_SPEED, 0, 1) * 0.65
    : clamp(effectiveSpeed / 130, 0, 1);

  const isAirborne = effectiveSpeed >= TAKEOFF_SPEED || isLanding;
  const isHighSpeed = effectiveSpeed >= 60;

  // Altitude do Voo Firme: de 54% (pousado) a 16% (voo alto estável)
  const planeY = 54 - speedRatio * 38;
  const planeScale = 1.05 - speedRatio * 0.32;

  // Velocidade do fluxo das faixas da estrada proporcional à velocidade
  const runwayDuration = `${clamp(1.15 - (effectiveSpeed / 160), 0.28, 1.15).toFixed(2)}s`;

  React.useEffect(() => {
    if (effectiveSpeed >= TAKEOFF_SPEED) {
      airborneLatchRef.current = true;
    } else if (!isShiftActive || isShiftPaused || effectiveSpeed <= 2) {
      airborneLatchRef.current = false;
    }
  }, [effectiveSpeed, isShiftActive, isShiftPaused]);

  const speedGlow = effectiveSpeed >= 90
    ? 'drop-shadow-[0_0_16px_rgba(56,189,248,0.60)]'
    : isAirborne
    ? 'drop-shadow-[0_0_10px_rgba(56,189,248,0.35)]'
    : isLight
    ? 'drop-shadow-[0_4px_6px_rgba(15,23,42,0.22)]'
    : 'drop-shadow-[0_4px_6px_rgba(2,6,23,0.50)]';

  return (
    <div
      className={`relative mx-auto aspect-[16/8] w-full max-w-[430px] select-none overflow-hidden rounded-2xl border transition-colors duration-500 ${isLight
        ? 'border-slate-200/90 bg-sky-100 shadow-sm'
        : 'border-slate-800 bg-[#07111f] shadow-2xl'
      }`}
      aria-label={`Velocímetro avião: ${Math.round(effectiveSpeed)} quilómetros por hora`}
    >
      {/* Céu Atmosférico & Gradiente de Horizonte */}
      <div className={`absolute inset-0 transition-colors duration-700 ${isLight
        ? 'bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,1),transparent_48%),linear-gradient(180deg,#38bdf8_0%,#bae6fd_48%,#e2e8f0_51%,#64748b_52%,#334155_100%)]'
        : 'bg-[radial-gradient(circle_at_50%_14%,rgba(37,99,235,0.34),transparent_40%),linear-gradient(180deg,#07172c_0%,#12304a_50%,#334155_51%,#151f2e_52%,#050912_100%)]'
      }`} />

      {/* Linha Fina de Horizonte */}
      <div
        className={`absolute inset-x-0 top-[51%] h-px transition-transform duration-700 ${
          isLight ? 'bg-white/60' : 'bg-cyan-200/30'
        }`}
        style={{ transform: `translateY(${speedRatio * 5}px) rotateZ(${-attitude.roll * 0.10}deg)` }}
      />

      {/* Pista de Asfalto com Faixas Centrais Animadas */}
      <div
        className={`absolute bottom-0 left-1/2 h-[49%] w-[76%] -translate-x-1/2 transition-[opacity,transform] duration-500 ${isLight
          ? 'bg-gradient-to-b from-slate-500/85 via-slate-600/90 to-slate-800'
          : 'bg-gradient-to-b from-slate-800/90 via-slate-900/95 to-[#0b1322]'
        }`}
        style={{
          clipPath: 'polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)',
          opacity: isAirborne ? 0.35 : 1,
          transform: `translateX(-50%) rotateZ(${-attitude.roll * 0.15}deg)`,
          transformOrigin: '50% 0%',
        }}
      >
        {/* Faixas Centrais Amarelas Animadas com Fluxo de Condução */}
        <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col items-center justify-between py-1 overflow-hidden pointer-events-none">
          <div
            className={`w-1.5 h-full flex flex-col justify-around ${moving ? 'aircraft-runway-flow' : ''}`}
            style={{
              animationDuration: runwayDuration,
            }}
          >
            <span className="w-1.5 h-4 bg-amber-400 rounded-sm shadow-sm" />
            <span className="w-1.5 h-6 bg-amber-400 rounded-sm shadow-sm" />
            <span className="w-1.5 h-8 bg-amber-400 rounded-sm shadow-sm" />
            <span className="w-1.5 h-10 bg-amber-400 rounded-sm shadow-sm" />
          </div>
        </div>

        {/* Linhas de Borda da Pista */}
        <div className="absolute inset-0 flex justify-between px-[18%] pointer-events-none">
          <div className="w-[1.5px] h-full bg-white/40" />
          <div className="w-[1.5px] h-full bg-white/40" />
        </div>
      </div>

      {/* Linhas de Vento Suaves em Alta Velocidade */}
      <div
        className={`pointer-events-none absolute left-1/2 top-[10%] h-[72%] transition-opacity duration-700 ${
          isHighSpeed && isShiftActive ? 'opacity-85' : 'opacity-0'
        }`}
        style={{
          transform: 'translateX(-50%)',
          width: '44%',
        }}
      >
        <span className="absolute left-[6%] top-0 h-12 w-[1.5px] rounded-full bg-gradient-to-b from-white/90 via-cyan-200/40 to-transparent" />
        <span className="absolute right-[6%] top-0 h-12 w-[1.5px] rounded-full bg-gradient-to-b from-white/90 via-cyan-200/40 to-transparent" />
      </div>

      {/* Avião Vetorial: Movimento Estável, Suave e Firme no Ar */}
      <div
        className={`absolute left-1/2 z-10 w-[42%] min-w-[146px] max-w-[204px] origin-center ${speedGlow}`}
        style={{
          top: `${planeY}%`,
          transform: `translateX(calc(-50% + ${attitude.driftX}px)) rotateZ(${attitude.roll}deg) rotateY(${attitude.yaw}deg) scale(${planeScale})`,
          transformOrigin: '50% 50%',
          willChange: 'transform, top',
        }}
      >
        <svg viewBox="0 0 320 180" className="h-auto w-full" role="img" aria-label="Avião em voo">
          <defs>
            <linearGradient id="planeFuselage" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="planeWings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <linearGradient id="planeWindshield" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a5f3fc" />
              <stop offset="45%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0369a1" />
            </linearGradient>
            <linearGradient id="planeEngine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="50%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>

          {/* Turbinas sob as asas */}
          <g>
            <ellipse cx="106" cy="126" rx="11" ry="4" fill="#020617" opacity="0.35" />
            <ellipse cx="214" cy="126" rx="11" ry="4" fill="#020617" opacity="0.35" />
            <path d="M96 90 Q106 82 116 90 L114 122 Q106 130 98 122 Z" fill="url(#planeEngine)" stroke="#cbd5e1" strokeWidth="1.2" />
            <path d="M204 90 Q214 82 224 90 L222 122 Q214 130 206 122 Z" fill="url(#planeEngine)" stroke="#cbd5e1" strokeWidth="1.2" />
            <path d="M101 112 Q106 116 111 112 L110 123 Q106 127 102 123 Z" fill="#1e293b" opacity="0.8" />
            <path d="M209 112 Q214 116 219 112 L218 123 Q214 127 210 123 Z" fill="#1e293b" opacity="0.8" />
          </g>

          {/* Asas Principais */}
          <path d="M148 58 L30 108 Q22 113 32 120 L147 95 Z" fill="url(#planeWings)" stroke="#f8fafc" strokeWidth="1.5" />
          <path d="M172 58 L290 108 Q298 113 288 120 L173 95 Z" fill="url(#planeWings)" stroke="#f8fafc" strokeWidth="1.5" />

          {/* Estabilizadores Traseiros */}
          <path d="M146 120 L84 150 Q78 154 86 158 L151 143 Z" fill="#cbd5e1" stroke="#f8fafc" strokeWidth="1.2" />
          <path d="M174 120 L236 150 Q242 154 234 158 L169 143 Z" fill="#cbd5e1" stroke="#f8fafc" strokeWidth="1.2" />

          {/* Fuselagem Central */}
          <path
            d="M160 8 C175 8 182 30 182 54 L181 128 C181 149 172 163 160 170 C148 163 139 149 139 128 L138 54 C138 30 145 8 160 8 Z"
            fill="url(#planeFuselage)"
            stroke="#ffffff"
            strokeWidth="1.6"
          />

          {/* Para-brisas Mini Compacto e Delicado no Bico do Nariz */}
          <path
            d="M154 12 Q160 9 166 12 L168 22 Q160 25 152 22 Z"
            fill="url(#planeWindshield)"
            stroke="#0284c7"
            strokeWidth="0.9"
          />
          {/* Pilar Central do Mini Cockpit */}
          <line x1="160" y1="10" x2="160" y2="24" stroke="#ffffff" strokeWidth="0.8" opacity="0.85" />

          {/* Cauda Vertical Superior */}
          <path d="M160 110 L176 146 L160 162 L144 146 Z" fill="#94a3b8" stroke="#e2e8f0" strokeWidth="1.2" opacity="0.9" />

          {/* Luzes de Navegação nas Asas */}
          <circle cx="30" cy="114" r="3.5" fill="#ef4444" opacity={moving ? 1 : 0.6} />
          <circle cx="290" cy="114" r="3.5" fill="#22c55e" opacity={moving ? 1 : 0.6} />

          {/* Faróis de Aterragem */}
          <circle cx="151" cy="66" r="3.2" fill="#fef3c7" opacity={!isAirborne ? 1 : 0.35} />
          <circle cx="169" cy="66" r="3.2" fill="#fef3c7" opacity={!isAirborne ? 1 : 0.35} />
        </svg>
      </div>

      {/* INSTRUMENTOS DE VELOCIDADE NO CANTO INFERIOR DIREITO */}
      <div className="absolute bottom-3 right-3 z-30 flex w-[82px] flex-col items-stretch gap-1.5">
        <div className={`rounded-xl border px-2 py-1 text-right backdrop-blur-md transition-colors ${isLight
          ? 'border-slate-200/90 bg-white/90 shadow-sm'
          : 'border-slate-700/80 bg-slate-950/90 shadow-lg'
        }`}>
          <span className={`block text-[7px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Km totais
          </span>
          <span className={`block font-mono text-[11px] font-black ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
            {formatDistance(totalDistanceKm)}
          </span>
        </div>

        <div className={`rounded-xl border px-2 py-1.5 text-center backdrop-blur-md transition-colors ${isLight
          ? 'border-slate-200/90 bg-white/95 shadow-sm'
          : 'border-slate-700/80 bg-slate-950/95 shadow-lg'
        }`}>
          <div className={`font-speed text-3xl font-black leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {Math.round(effectiveSpeed)}
          </div>
          <div className={`text-[8px] font-black uppercase tracking-[0.18em] ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
            km/h
          </div>
        </div>
      </div>
    </div>
  );
});

export default AircraftSpeedometer;
