import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Radio,
  Video,
  Sparkles,
  Music,
  Clock,
  Gauge,
  Tv,
  Car,
} from 'lucide-react';
import { ShiftSession } from '../types/session';
import { formatSecondsToDigital } from '../utils/formatters';

interface RearEntertainmentScreenProps {
  session: ShiftSession;
  isLight?: boolean;
  onExitRearMode?: () => void;
}

interface ChannelItem {
  id: string;
  name: string;
  category: 'radio' | 'ambient' | 'visualizer' | 'youtube';
  streamUrl?: string;
  description: string;
  accentColor: string;
  iconName: string;
}

const PRESET_CHANNELS: ChannelItem[] = [
  {
    id: 'rfm',
    name: 'RFM Portugal',
    category: 'radio',
    streamUrl: 'https://stream-icarus.profusion.pt/RFM',
    description: 'Os maiores êxitos de música nacional e internacional',
    accentColor: '#f59e0b',
    iconName: 'radio',
  },
  {
    id: 'comercial',
    name: 'Rádio Comercial',
    category: 'radio',
    streamUrl: 'https://stream-icarus.profusion.pt/COMERCIAL',
    description: 'A rádio mais ouvida de Portugal em direto',
    accentColor: '#ef4444',
    iconName: 'radio',
  },
  {
    id: 'm80',
    name: 'M80 Portugal',
    category: 'radio',
    streamUrl: 'https://stream-icarus.profusion.pt/M80',
    description: 'Se a sua vida tem uma banda sonora, passa na M80',
    accentColor: '#3b82f6',
    iconName: 'radio',
  },
  {
    id: 'lofi',
    name: 'Lo-Fi Chill & Relax',
    category: 'radio',
    streamUrl: 'https://play.streamafrica.net/lofiradio',
    description: 'Batidas relaxantes e ambiente tranquilo de condução',
    accentColor: '#10b981',
    iconName: 'music',
  },
  {
    id: 'scenic_lisbon',
    name: 'Paisagens de Portugal 4K',
    category: 'ambient',
    description: 'Vistas aéreas de Lisboa, Porto, Sintra e Costa Vicentina',
    accentColor: '#06b6d4',
    iconName: 'video',
  },
  {
    id: 'cosmic_waves',
    name: 'Espectro & Ondas Sonoras',
    category: 'visualizer',
    description: 'Visualizador de frequências em tempo real a 20 FPS',
    accentColor: '#8b5cf6',
    iconName: 'sparkles',
  },
];

export const RearEntertainmentScreen: React.FC<RearEntertainmentScreenProps> = ({
  session,
  isLight = false,
  onExitRearMode,
}) => {
  const [activeChannel, setActiveChannel] = useState<ChannelItem>(PRESET_CHANNELS[0]);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [customYoutubeUrl, setCustomYoutubeUrl] = useState<string>('');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeChannelRef = useRef(activeChannel);
  const isPlayingRef = useRef(isPlaying);
  const speedRef = useRef(session.currentSpeedKmh);
  const isLightRef = useRef(isLight);
  const wakeCanvasRef = useRef<(() => void) | null>(null);
  activeChannelRef.current = activeChannel;
  isPlayingRef.current = isPlaying;
  speedRef.current = session.currentSpeedKmh;
  isLightRef.current = isLight;

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = 'anonymous';
    }

    const audio = audioRef.current;
    audio.volume = isMuted ? 0 : volume;

    if (activeChannel.streamUrl) {
      audio.src = activeChannel.streamUrl;
      if (isPlaying) {
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }

    return () => {
      audio.pause();
    };
  }, [activeChannel, isMuted, volume]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : val;
    }
    if (val > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Canvas limitado e suspenso fora do ecrã. A versão anterior recriava este
  // motor a cada atualização de velocidade e renderizava a 60 FPS, causando
  // picos de CPU/GPU e pressão de memória no browser do Tesla.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let tick = 0;
    let lastFrameAt = 0;
    let isVisible = document.visibilityState !== 'hidden';
    let particles: { x: number; y: number; vx: number; vy: number; size: number; hue: number }[] = [];
    const frameInterval = 1000 / 20;

    const initParticles = () => {
      particles = [];
      for (let i = 0; i < 16; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          size: Math.random() * 3 + 1,
          hue: Math.random() * 60 + 140,
        });
      }
    };

    const resizeCanvas = () => {
      if (canvas && canvas.parentElement) {
        // Renderizar a uma resolução limitada e escalar por CSS reduz muito a
        // memória do framebuffer sem alterar o layout no ecrã grande.
        canvas.width = Math.min(canvas.parentElement.clientWidth || 800, 960);
        canvas.height = Math.min(canvas.parentElement.clientHeight || 450, 540);
        initParticles();
      }
      wakeCanvasRef.current?.();
    };
    window.addEventListener('resize', resizeCanvas);

    const render = (now: number) => {
      animationFrameRef.current = null;
      if (!isVisible) return;
      if (lastFrameAt > 0 && now - lastFrameAt < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameAt = now;
      tick++;
      const width = canvas.width;
      const height = canvas.height;
      const channel = activeChannelRef.current;
      const playing = isPlayingRef.current;
      const light = isLightRef.current;

      // 1. Fundo Dinâmico Gradiente
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      if (channel.category === 'visualizer') {
        bgGrad.addColorStop(0, '#090514');
        bgGrad.addColorStop(0.5, '#1e0b36');
        bgGrad.addColorStop(1, '#05020a');
      } else if (channel.category === 'ambient') {
        bgGrad.addColorStop(0, '#031b26');
        bgGrad.addColorStop(0.5, '#0b3948');
        bgGrad.addColorStop(1, '#021017');
      } else {
        bgGrad.addColorStop(0, light ? '#f1f5f9' : '#030712');
        bgGrad.addColorStop(1, light ? '#e2e8f0' : '#0b1120');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Modo Visualizador de Ondas e Frequências
      if (channel.category === 'visualizer' || playing) {
        const barCount = 44;
        const barWidth = width / barCount;
        const speedMultiplier = (speedRef.current || 0) / 40;

        for (let i = 0; i < barCount; i++) {
          const t = tick * 0.04 + i * 0.16;
          const amp = playing ? Math.sin(t) * 0.5 + Math.cos(t * 1.3) * 0.3 + 0.5 : 0.1;
          const barHeight = Math.max(10, amp * (height * 0.38) * (1 + speedMultiplier * 0.15));

          const x = i * barWidth + barWidth * 0.15;
          const y = height / 2 - barHeight / 2;

          const barGrad = ctx.createLinearGradient(x, y, x, y + barHeight);
          barGrad.addColorStop(0, '#10b981');
          barGrad.addColorStop(0.5, '#38bdf8');
          barGrad.addColorStop(1, '#a855f7');

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth * 0.7, barHeight, 4);
          ctx.fill();
        }
      }

      // 3. Modo Paisagens e Partículas
      if (channel.category === 'ambient') {
        for (let layer = 1; layer <= 3; layer++) {
          ctx.beginPath();
          ctx.moveTo(0, height);
          for (let x = 0; x <= width; x += 20) {
            const waveY =
              height * 0.65 +
              Math.sin(x * 0.005 * layer + tick * 0.01 * layer) * (25 * layer) +
              layer * 20;
            ctx.lineTo(x, waveY);
          }
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fillStyle = `rgba(16, 185, 129, ${0.08 * layer})`;
          ctx.fill();
        }
      }

      // 4. Partículas
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, 0.6)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 5. Título da Rádio / Canal
      if (channel.category === 'radio') {
        ctx.save();
        ctx.fillStyle = light ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
        ctx.font = 'bold 22px Space Grotesk, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(channel.name, width / 2, height / 2 - 15);

        ctx.fillStyle = light ? '#64748b' : '#94a3b8';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText(playing ? '● Transmissão em Direto' : 'Em Pausa', width / 2, height / 2 + 15);
        ctx.restore();
      }

      const needsAnimation = channel.category !== 'radio' || playing;
      if (needsAnimation) animationFrameRef.current = requestAnimationFrame(render);
    };

    wakeCanvasRef.current = () => {
      if (!isVisible && document.visibilityState === 'visible') isVisible = true;
      if (isVisible && animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(render);
      }
    };
    resizeCanvas();
    wakeCanvasRef.current();

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState !== 'hidden';
      if (isVisible) {
        lastFrameAt = 0;
        wakeCanvasRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      wakeCanvasRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useEffect(() => {
    wakeCanvasRef.current?.();
  }, [activeChannel, isPlaying, isLight]);

  const handleCustomYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customYoutubeUrl.trim()) return;

    let videoId = customYoutubeUrl.trim();
    if (videoId.includes('v=')) {
      videoId = videoId.split('v=')[1]?.split('&')[0] || videoId;
    } else if (videoId.includes('youtu.be/')) {
      videoId = videoId.split('youtu.be/')[1]?.split('?')[0] || videoId;
    }

    const newChan: ChannelItem = {
      id: 'custom-' + Date.now(),
      name: `Vídeo: ${videoId.substring(0, 14)}`,
      category: 'youtube',
      description: 'Vídeo reproduzido via motor de quadros Canvas no Tesla',
      accentColor: '#ef4444',
      iconName: 'video',
    };

    setActiveChannel(newChan);
  };

  return (
    <div
      ref={containerRef}
      className={`min-h-screen w-full flex flex-col justify-between select-none transition-colors duration-300 ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-white'
      }`}
    >
      <header
        className={`px-4 sm:px-6 py-3.5 border-b flex items-center justify-between gap-4 backdrop-blur-md sticky top-0 z-30 ${
          isLight ? 'bg-white/90 border-slate-200 shadow-sm' : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-sm">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight">DriverWise Entertainment</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                Tesla Rear Screen
              </span>
            </div>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Central de Entretenimento & Viagem para Passageiros
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 font-mono text-xs">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-800'
                : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}
          >
            <Gauge className="w-4 h-4 text-emerald-500" />
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold leading-none">
                Velocidade
              </span>
              <span className="font-bold text-sm">{session.currentSpeedKmh || 0} km/h</span>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-800'
                : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-sky-500" />
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold leading-none">
                Tempo Viagem
              </span>
              <span className="font-bold text-sm">
                {formatSecondsToDigital(session.passengerDurationSeconds || session.activeDurationSeconds)}
              </span>
            </div>
          </div>

          <div
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-800'
                : 'bg-slate-950 border-slate-800 text-slate-200'
            }`}
          >
            <span className="text-sm font-bold">{currentTimeStr}</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl border transition ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
            }`}
            title="Ecrã Inteiro"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onExitRearMode && (
            <button
              type="button"
              onClick={onExitRearMode}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Voltar ao Cockpit
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center max-w-6xl w-full mx-auto space-y-4">
        <div className="relative w-full aspect-video max-h-[58vh] rounded-3xl overflow-hidden shadow-2xl border border-slate-700/60 bg-black flex items-center justify-center group">
          <canvas ref={canvasRef} className="w-full h-full object-cover block" />

          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between gap-4 transition-opacity duration-300 opacity-90 group-hover:opacity-100">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="w-12 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition shadow-lg shadow-emerald-500/30 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <div className="text-white">
                <span className="font-bold text-sm sm:text-base block drop-shadow-md">
                  {activeChannel.name}
                </span>
                <span className="text-xs text-slate-300 font-mono drop-shadow-sm">
                  {activeChannel.description}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-black/50 backdrop-blur-md px-3 py-2 rounded-2xl border border-white/10">
              <button
                type="button"
                onClick={toggleMute}
                className="text-slate-300 hover:text-white transition"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 sm:w-28 accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="w-full space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={`text-xs uppercase font-bold tracking-wider ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Canais & Rádios para a Viagem
            </span>

            <form onSubmit={handleCustomYoutubeSubmit} className="flex items-center gap-1.5 max-w-sm w-full">
              <input
                type="text"
                value={customYoutubeUrl}
                onChange={(e) => setCustomYoutubeUrl(e.target.value)}
                placeholder="Colar link ou ID do YouTube..."
                className={`w-full px-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:border-emerald-500 ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-900 border-slate-800 text-white'
                }`}
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition whitespace-nowrap"
              >
                Tocar
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            {PRESET_CHANNELS.map((chan) => {
              const isActive = activeChannel.id === chan.id;
              return (
                <button
                  key={chan.id}
                  type="button"
                  onClick={() => {
                    setActiveChannel(chan);
                    setIsPlaying(true);
                  }}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between space-y-2 transition active:scale-95 ${
                    isActive
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500 ring-1 ring-emerald-400 shadow-md shadow-emerald-500/10'
                      : isLight
                      ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center border"
                      style={{
                        backgroundColor: `${chan.accentColor}15`,
                        borderColor: `${chan.accentColor}40`,
                        color: chan.accentColor,
                      }}
                    >
                      {chan.iconName === 'radio' && <Radio className="w-4 h-4" />}
                      {chan.iconName === 'music' && <Music className="w-4 h-4" />}
                      {chan.iconName === 'video' && <Video className="w-4 h-4" />}
                      {chan.iconName === 'sparkles' && <Sparkles className="w-4 h-4" />}
                    </div>
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-xs block truncate">{chan.name}</span>
                    <span className={`text-[10px] block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {chan.category.toUpperCase()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <footer
        className={`py-3 px-6 text-center text-xs border-t font-mono flex items-center justify-between ${
          isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-950 border-slate-800/80 text-slate-500'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Car className="w-3.5 h-3.5 text-emerald-500" />
          <span>Viatura em Serviço TVDE • Conforto & Entretenimento a Bordo</span>
        </span>
        <span>DriverWise Rear Screen Engine © 2026</span>
      </footer>
    </div>
  );
};
