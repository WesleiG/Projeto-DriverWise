import React, { useState } from 'react';
import type * as Tesseract from 'tesseract.js';
import { parseReceiptText, ParsedReceiptData } from '../utils/ocrParser';
import { EarningRecord } from '../types/earnings';
import { formatCurrency } from '../utils/formatters';
import { UploadCloud, CheckCircle2, AlertCircle, X, Loader2, Sparkles } from 'lucide-react';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyParsedData: (data: Partial<EarningRecord>) => void;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  onApplyParsedData,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [parsedResult, setParsedResult] = useState<ParsedReceiptData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImageFile = async (file: File) => {
    setErrorMsg(null);
    setParsedResult(null);

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Selecione um ficheiro de imagem válido.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('A imagem não pode exceder 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setErrorMsg('Não foi possível ler o ficheiro selecionado.');
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        setErrorMsg('O ficheiro não contém uma imagem legível.');
        return;
      }
      setImageSrc(dataUrl);
      await processImageWithOCR(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const processImageWithOCR = async (image: string) => {
    setIsProcessing(true);
    setProgressPercent(10);
    setProgressStatus('A carregar imagem...');

    let worker: Awaited<ReturnType<typeof Tesseract.createWorker>> | null = null;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('por');
      setProgressPercent(40);
      setProgressStatus('A ler valores e datas...');

      const ret = await worker.recognize(image);
      setProgressPercent(90);
      setProgressStatus('A estruturar dados...');

      const parsed = parseReceiptText(ret.data.text);
      setParsedResult(parsed);
      setProgressPercent(100);
      setProgressStatus('Concluído com sucesso!');

    } catch (err) {
      console.error('Erro no OCR:', err);
      setErrorMsg('Não foi possível ler a imagem automaticamente. Pode preencher manualmente.');
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (!parsedResult) return;

    onApplyParsedData({
      platform: parsedResult.platform,
      date: parsedResult.date,
      totalHours: parsedResult.totalHours,
      grossEarnings: parsedResult.grossEarnings,
      tips: parsedResult.tips,
      bonuses: parsedResult.bonuses,
      distanceKm: parsedResult.distanceKm,
      tripsCount: parsedResult.tripsCount,
      notes: `Importado via OCR (${parsedResult.platform.toUpperCase()})`,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Leitor de Faturas / Recibos (OCR)</h3>
              <p className="text-xs text-slate-400">
                Extração automática de relatórios da Uber ou Bolt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {/* Zona de Upload */}
          <div className="border border-dashed border-slate-700/80 rounded-2xl p-6 text-center bg-slate-950/50 hover:bg-slate-950 transition-all">
            <input
              type="file"
              accept="image/*"
              id="receipt-file-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleImageFile(e.target.files[0]);
                }
              }}
            />
            <label
              htmlFor="receipt-file-input"
              className="cursor-pointer flex flex-col items-center justify-center space-y-2.5"
            >
              {imageSrc ? (
                <div className="relative max-h-32 overflow-hidden rounded-xl border border-slate-700">
                  <img src={imageSrc} alt="Recibo carregado" className="max-h-32 object-contain" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-300">
                  <UploadCloud className="w-6 h-6" />
                </div>
              )}
              <div>
                <span className="font-bold text-white block">
                  {imageSrc ? 'Alterar captura de ecrã' : 'Clique para carregar captura de ecrã'}
                </span>
                <span className="text-[11px] text-slate-400">PNG, JPG ou foto do telemóvel</span>
              </div>
            </label>
          </div>

          {/* Estado de Processamento */}
          {isProcessing && (
            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-300 font-medium">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                  {progressStatus}
                </span>
                <span className="font-mono text-emerald-400 font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Erro */}
          {errorMsg && (
            <div className="bg-rose-950/40 border border-rose-800/60 p-3 rounded-xl flex items-center gap-2 text-rose-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Resultado Detetado */}
          {parsedResult && !isProcessing && (
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Dados Reconhecidos
                </span>
                <span className="px-2 py-0.5 rounded uppercase font-bold bg-slate-800 text-slate-200 text-[10px]">
                  {parsedResult.platform}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                <div className="bg-slate-900/60 p-2 rounded-xl">
                  <span className="text-[10px] text-slate-500 block">Faturação</span>
                  <span className="font-bold text-emerald-400 text-sm">{formatCurrency(parsedResult.grossEarnings)}</span>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-xl">
                  <span className="text-[10px] text-slate-500 block">Horas</span>
                  <span className="font-bold text-white text-sm">{parsedResult.totalHours}h</span>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-xl">
                  <span className="text-[10px] text-slate-500 block">Distância</span>
                  <span className="font-bold text-white text-sm">{parsedResult.distanceKm} km</span>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-xl">
                  <span className="text-[10px] text-slate-500 block">Viagens</span>
                  <span className="font-bold text-white text-sm">{parsedResult.tripsCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
            >
              Fechar
            </button>
            {parsedResult && (
              <button
                type="button"
                onClick={handleApply}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <span>Aplicar ao Registo</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
