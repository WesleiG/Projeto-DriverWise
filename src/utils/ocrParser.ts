import { PlatformType } from '../types/earnings';

export interface ParsedReceiptData {
  platform: PlatformType;
  date: string;
  totalHours: number;
  grossEarnings: number;
  tips: number;
  bonuses: number;
  tripsCount: number;
  distanceKm: number;
  rawText: string;
  confidence: number;
}

/**
 * Parser inteligente de texto OCR para extração de dados de faturas/relatórios TVDE
 */
export function parseReceiptText(text: string): ParsedReceiptData {
  const lower = text.toLowerCase();

  // 1. Deteção da Plataforma
  let platform: PlatformType = 'other';
  if (lower.includes('bolt') || lower.includes('taxify')) {
    platform = 'bolt';
  } else if (lower.includes('freenow') || lower.includes('free now') || lower.includes('mytaxi')) {
    platform = 'freenow';
  } else if (lower.includes('uber')) {
    platform = 'uber';
  }

  // 2. Extração de Valores Monetários em Euros (€)
  // Expressões comuns: "154,20 €", "€154.20", "Ganhos: 154.20", "Total: 154,20"
  const moneyRegex = /(?:ganhos?|total|faturação|bruto|saldo|recebido|líquido)?\s*(?:[:=]?)\s*(?:€\s*)?([0-9]+[.,][0-9]{2})(?:\s*€)?/gi;
  const numbersFound: number[] = [];

  let match;
  while ((match = moneyRegex.exec(text)) !== null) {
    const rawVal = match[1].replace(',', '.');
    const val = parseFloat(rawVal);
    if (!isNaN(val) && val > 0 && val < 5000) {
      numbersFound.push(val);
    }
  }

  const labeledGross = text.match(/(?:ganhos?|faturação|faturacao|bruto|recebido|total recebido)\s*[:=]?\s*(?:€\s*)?([0-9]+[.,][0-9]{2})/i);
  // Só usar um valor sem etiqueta quando existe uma única quantia monetária;
  // escolher o maior número inventava faturação a partir de despesas/totais.
  let grossEarnings = labeledGross
    ? parseFloat(labeledGross[1].replace(',', '.'))
    : numbersFound.length === 1 ? numbersFound[0] : 0;

  // Se o regex específico falhar, procura qualquer padrão numérico monetário
  if (grossEarnings === 0 && numbersFound.length === 0) {
    const fallbackMoney = /([0-9]{1,4}[.,][0-9]{2})\s*€/g;
    while ((match = fallbackMoney.exec(text)) !== null) {
      const val = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(val) && val > grossEarnings) {
        grossEarnings = val;
      }
    }
  }

  // 3. Extração de Gorjetas
  let tips = 0;
  const tipsMatch = text.match(/(?:gorjetas?|gratificações?|tips?)\s*[:=]?\s*(?:€\s*)?([0-9]+[.,][0-9]{2})/i);
  if (tipsMatch) {
    tips = parseFloat(tipsMatch[1].replace(',', '.')) || 0;
  }

  // 4. Extração de Bónus / Incentivos
  let bonuses = 0;
  const bonusMatch = text.match(/(?:bónus|bonus|incentivos?|promoções?)\s*[:=]?\s*(?:€\s*)?([0-9]+[.,][0-9]{2})/i);
  if (bonusMatch) {
    bonuses = parseFloat(bonusMatch[1].replace(',', '.')) || 0;
  }

  // 5. Extração de Horas Online
  let totalHours = 0;
  const hoursMatch = text.match(/(?:horas?\s+online|horas?|tempo online|duração)\s*[:=]?\s*([0-9]+)\s*(?:h|:)\s*([0-9]{1,2})?/i);
  if (hoursMatch) {
    const h = parseInt(hoursMatch[1], 10) || 0;
    const m = parseInt(hoursMatch[2] || '0', 10) || 0;
    totalHours = Number((h + m / 60).toFixed(2));
  }

  // 6. Extração do Número de Viagens
  let tripsCount = 0;
  const tripsMatch = text.match(/(?:viagens|corridas|pedidos|trips)\s*[:=]?\s*([0-9]{1,3})/i);
  if (tripsMatch) {
    tripsCount = parseInt(tripsMatch[1], 10) || 0;
  }

  // 7. Extração de Quilómetros
  let distanceKm = 0;
  const kmMatch = text.match(/([0-9]+[.,]?[0-9]*)\s*(?:km|quilómetros|quilometros)/i);
  if (kmMatch) {
    distanceKm = parseFloat(kmMatch[1].replace(',', '.')) || 0;
  }

  // 8. Deteção de Data
  let date = '';
  const dateMatch = text.match(/([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2,4})/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    let year = dateMatch[3];
    if (year.length === 2) year = '20' + year;
    const candidate = `${year}-${month}-${day}`;
    const parsedDate = new Date(`${candidate}T12:00:00`);
    if (parsedDate.getFullYear() === Number(year) && parsedDate.getMonth() + 1 === Number(month) && parsedDate.getDate() === Number(day)) {
      date = candidate;
    }
  }

  return {
    platform,
    date,
    totalHours,
    grossEarnings: Number(grossEarnings.toFixed(2)),
    tips: Number(tips.toFixed(2)),
    bonuses: Number(bonuses.toFixed(2)),
    tripsCount,
    distanceKm: Number(distanceKm.toFixed(1)),
    rawText: text,
    confidence: grossEarnings > 0 ? (labeledGross ? 0.85 : 0.55) : 0,
  };
}
