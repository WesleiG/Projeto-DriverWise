import React from 'react';
import { LayoutDashboard, History, BarChart3, Settings, Car } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'history' | 'analytics';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenSettings: () => void;
  isShiftActive: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
  isShiftActive,
}) => {
  const navItems = [
    { id: 'dashboard' as ActiveTab, label: 'Início & Condução', icon: LayoutDashboard },
    { id: 'history' as ActiveTab, label: 'Histórico de Ganhos', icon: History },
    { id: 'analytics' as ActiveTab, label: 'Estatísticas', icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logótipo & Marca */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black tracking-tight text-white">DriverWise</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  TVDE
                </span>
              </div>
              <p className="text-[10px] text-slate-400 -mt-0.5">Calculador de Ganhos em Direto</p>
            </div>
          </div>

          {/* Navegação Desktop */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-2xl border border-slate-800">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.id === 'dashboard' && isShiftActive && (
                    <span className="w-2 h-2 rounded-full bg-emerald-950 animate-ping" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Botão de Definições */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              title="Definições da Aplicação"
              className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all shadow-sm flex items-center gap-2"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline text-xs font-semibold">Definições</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Navegação Móvel (Em baixo nos ecrãs pequenos) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-4 py-2 flex items-center justify-around shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
