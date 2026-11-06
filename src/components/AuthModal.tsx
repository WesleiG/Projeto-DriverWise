import React, { useState } from 'react';
import {
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  logoutUser,
  resetUserPassword,
} from '../services/firebase';
import { User } from 'firebase/auth';
import {
  X,
  Lock,
  Mail,
  User as UserIcon,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (tab === 'login') {
        await loginWithEmail(email.trim(), password);
        setSuccessMsg('Sessão iniciada com sucesso!');
        setTimeout(() => onClose(), 800);
      } else if (tab === 'register') {
        if (password.length < 6) {
          setErrorMsg('A palavra-passe deve conter pelo menos 6 caracteres.');
          setLoading(false);
          return;
        }
        await registerWithEmail(email.trim(), password, displayName.trim());
        setSuccessMsg('Conta de motorista criada com sucesso!');
        setTimeout(() => onClose(), 800);
      } else if (tab === 'forgot') {
        await resetUserPassword(email.trim());
        setSuccessMsg('Email de recuperação enviado! Verifique a sua caixa de entrada.');
      }
    } catch (err: unknown) {
      console.warn('Erro de autenticação:', err);
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMsg('Email ou palavra-passe incorretos.');
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg('Este endereço de email já se encontra registado.');
      } else if (code === 'auth/invalid-email') {
        setErrorMsg('Introduza um formato de email válido.');
      } else if (code === 'auth/weak-password') {
        setErrorMsg('A palavra-passe é demasiado fraca (mínimo 6 caracteres).');
      } else {
        setErrorMsg('Ocorreu um erro ao processar a autenticação. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await loginWithGoogle();
      setSuccessMsg('Autenticado com a Conta Google com sucesso!');
      setTimeout(() => onClose(), 800);
    } catch (err: unknown) {
      console.warn('Erro Google Sign-In:', err);
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
      if (code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Não foi possível concluir o login com o Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logoutUser();
      setSuccessMsg('Sessão terminada.');
      setTimeout(() => onClose(), 600);
    } catch {
      setErrorMsg('Erro ao terminar sessão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden text-slate-100">
        {/* Glow de Fundo */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Botão Fechar */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* SE O UTILIZADOR JÁ ESTIVER AUTENTICADO */}
        {currentUser ? (
          <div className="space-y-6 pt-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="Perfil"
                    className="w-full h-full rounded-2xl object-cover"
                  />
                ) : (
                  <ShieldCheck className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">Perfil do Motorista</h3>
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Sessão Ativa & Protegida
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Nome / Identificador</span>
                <p className="text-sm font-medium text-slate-200">
                  {currentUser.displayName || 'Motorista TVDE'}
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Email Registado</span>
                <p className="text-sm font-mono text-slate-300">{currentUser.email || 'Não configurado'}</p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500">Sincronização Cloud</span>
                <p className="text-xs text-slate-400">
                  Os seus turnos e métricas estão vinculados a esta conta na Firebase Cloud Firestore.
                </p>
              </div>
            </div>

            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-sm transition"
              >
                Voltar à App
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="py-3 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-semibold text-sm flex items-center justify-center gap-2 transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Terminar Sessão
              </button>
            </div>
          </div>
        ) : (
          /* SE O UTILIZADOR NÃO ESTIVER AUTENTICADO */
          <div className="space-y-5 pt-2">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                {tab === 'login' && 'Entrar no DriverWise'}
                {tab === 'register' && 'Criar Conta de Motorista'}
                {tab === 'forgot' && 'Recuperar Acesso'}
              </h2>
              <p className="text-xs text-slate-400">
                {tab === 'login' && 'Aceda ao seu histórico e sincronize os seus turnos na nuvem'}
                {tab === 'register' && 'Guarde os seus ganhos em segurança e aceda em qualquer dispositivo'}
                {tab === 'forgot' && 'Introduza o seu email para redefinir a palavra-passe'}
              </p>
            </div>

            {/* Alternador de Separador */}
            {tab !== 'forgot' && (
              <div className="flex p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                    tab === 'login'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setErrorMsg(null);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                    tab === 'register'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Criar Conta
                </button>
              </div>
            )}

            {/* Botão Oficial Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 font-medium text-xs flex items-center justify-center gap-3 text-slate-200 transition shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2c0 2.8.7 5.5 1.9 7.9l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
                />
              </svg>
              <span>Continuar com o Google</span>
            </button>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[11px] text-slate-500 font-medium">ou com email</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Mensagens de Estado */}
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Formulário */}
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {tab === 'register' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">Nome do Motorista</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex: João Silva"
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-400">Endereço de Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="motorista@email.com"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {tab !== 'forgot' && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-medium text-slate-400">Palavra-passe</label>
                    {tab === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTab('forgot');
                          setErrorMsg(null);
                        }}
                        className="text-[11px] text-emerald-400 hover:underline"
                      >
                        Esqueceu-se?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tab === 'login' && 'Entrar na Conta'}
                {tab === 'register' && 'Criar Conta de Motorista'}
                {tab === 'forgot' && 'Enviar Email de Redefinição'}
              </button>
            </form>

            {tab === 'forgot' && (
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setErrorMsg(null);
                }}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-200 py-1"
              >
                ← Voltar ao Ecrã de Login
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
