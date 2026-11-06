import React, { useRef, useState, useCallback, useEffect } from 'react';
import { JoystickVector } from '../types/location';
import { Gamepad2, Navigation2 } from 'lucide-react';

interface VirtualJoystickProps {
  onVectorChange: (vector: JoystickVector) => void;
  currentSpeedKmh: number;
  heading: number;
  disabled?: boolean;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onVectorChange,
  currentSpeedKmh,
  heading,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [activeForce, setActiveForce] = useState(0);

  const RADIUS = 48; // Raio máximo de movimento do manípulo

  const processCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current || disabled) return;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;

      const distance = Math.sqrt(dx * dx + dy * dy);
      const force = Math.min(1, distance / RADIUS);

      if (distance > RADIUS) {
        dx = (dx / distance) * RADIUS;
        dy = (dy / distance) * RADIUS;
      }

      setKnobPos({ x: dx, y: dy });
      setActiveForce(force);

      const rad = Math.atan2(dx, -dy);
      let degrees = (rad * 180) / Math.PI;
      if (degrees < 0) degrees += 360;

      onVectorChange({
        x: dx / RADIUS,
        y: -dy / RADIUS,
        angleDegrees: Math.round(degrees),
        force: Number(force.toFixed(2)),
      });
    },
    [RADIUS, disabled, onVectorChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    processCoordinates(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || disabled) return;
    processCoordinates(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    setKnobPos({ x: 0, y: 0 });
    setActiveForce(0);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignorar se já libertado
    }
    onVectorChange({
      x: 0,
      y: 0,
      angleDegrees: heading,
      force: 0,
    });
  };

  // Suporte a teclas do teclado (WASD / Setas)
  useEffect(() => {
    if (disabled) return;

    const pressedKeys = new Set<string>();

    const updateKeyboardVector = () => {
      let dx = 0;
      let dy = 0;

      if (pressedKeys.has('ArrowUp') || pressedKeys.has('w') || pressedKeys.has('W')) dy += 1;
      if (pressedKeys.has('ArrowDown') || pressedKeys.has('s') || pressedKeys.has('S')) dy -= 1;
      if (pressedKeys.has('ArrowLeft') || pressedKeys.has('a') || pressedKeys.has('A')) dx -= 1;
      if (pressedKeys.has('ArrowRight') || pressedKeys.has('d') || pressedKeys.has('D')) dx += 1;

      if (dx === 0 && dy === 0) {
        setKnobPos({ x: 0, y: 0 });
        setActiveForce(0);
        onVectorChange({ x: 0, y: 0, angleDegrees: heading, force: 0 });
        return;
      }

      const rad = Math.atan2(dx, dy);
      let deg = (rad * 180) / Math.PI;
      if (deg < 0) deg += 360;

      const normX = dx * 0.85 * RADIUS;
      const normY = -dy * 0.85 * RADIUS;

      setKnobPos({ x: normX, y: normY });
      setActiveForce(0.9);

      onVectorChange({
        x: dx,
        y: dy,
        angleDegrees: Math.round(deg),
        force: 0.9,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        pressedKeys.add(e.key);
        updateKeyboardVector();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (pressedKeys.has(e.key)) {
        pressedKeys.delete(e.key);
        updateKeyboardVector();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, heading, onVectorChange, RADIUS]);

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 shadow-xl flex flex-col items-center justify-between">
      {/* Cabeçalho */}
      <div className="w-full flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-slate-300">
          <Gamepad2 className="w-4 h-4 text-emerald-400" />
          <span>Simulador de Deslocação</span>
        </div>
        <span className="text-[11px] font-mono text-slate-500">
          {disabled ? 'GPS Ativo' : 'WASD / Setas'}
        </span>
      </div>

      <div className="w-full flex items-center justify-around gap-4 py-1">
        {/* Rumo */}
        <div className="flex flex-col items-center gap-0.5 min-w-[70px]">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Rumo</span>
          <div className="text-sm font-bold font-mono text-white flex items-center gap-1">
            <Navigation2
              className="w-3.5 h-3.5 text-emerald-400 transition-transform duration-200"
              style={{ transform: `rotate(${heading}deg)` }}
            />
            {heading}°
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            {activeForce > 0.05 ? `${Math.round(activeForce * 100)}% força` : 'Neutro'}
          </span>
        </div>

        {/* Base Analógica */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative w-32 h-32 rounded-full border transition-all flex items-center justify-center select-none touch-none ${
            disabled
              ? 'opacity-30 cursor-not-allowed border-slate-800 bg-slate-950'
              : 'cursor-grab active:cursor-grabbing border-slate-700/80 bg-slate-950/80 hover:border-emerald-500/50 shadow-inner'
          }`}
        >
          {/* Guias direcionais discretas */}
          <div className="absolute top-1 text-[8px] font-mono text-slate-600">N</div>
          <div className="absolute right-1.5 text-[8px] font-mono text-slate-600">E</div>
          <div className="absolute bottom-1 text-[8px] font-mono text-slate-600">S</div>
          <div className="absolute left-1.5 text-[8px] font-mono text-slate-600">O</div>

          {/* Círculo guia interior */}
          <div className="w-16 h-16 rounded-full border border-slate-800/80 pointer-events-none" />

          {/* Manípulo */}
          <div
            className={`absolute w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-75 shadow-xl pointer-events-none ${
              isDragging
                ? 'bg-emerald-500 text-slate-950 scale-105 shadow-emerald-500/30 ring-2 ring-emerald-400'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          >
            <div className={`w-2 h-2 rounded-full ${isDragging ? 'bg-slate-950' : 'bg-emerald-400'}`} />
          </div>
        </div>

        {/* Velocidade */}
        <div className="flex flex-col items-center gap-0.5 min-w-[70px]">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Velocidade</span>
          <div className="text-base font-bold font-mono text-emerald-400">
            {Math.round(currentSpeedKmh)} <span className="text-[10px] text-slate-500 font-normal">km/h</span>
          </div>
          <span className="text-[10px] text-slate-500">
            {currentSpeedKmh > 4 ? 'Em curso' : 'Parado'}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-slate-500 text-center font-mono">
        Arraste o manípulo ou utilize as teclas W, A, S, D / Setas
      </p>
    </div>
  );
};
