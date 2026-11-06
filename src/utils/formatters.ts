/**
 * Formata um valor numérico para Moeda em Euros (€) no padrão português
 */
export function formatCurrency(amount: number): string {
  const safeAmount = Number.isFinite(amount) && !Object.is(amount, -0) ? amount : 0;
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

export function formatExpense(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return safeAmount > 0 ? `-${formatCurrency(safeAmount)}` : formatCurrency(0);
}

/**
 * Formata segundos para formato legível de horas e minutos (ex: "02h 45m" ou "00:45:12")
 */
export function formatSecondsToDigital(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formata horas decimais (ex: 7.5) para formato amigável (ex: "7h 30m")
 */
export function formatDecimalHours(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (wholeHours === 0) return `${minutes}m`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
}

/**
 * Formata distância em km (ex: "14.2 km")
 */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} km`;
}

/**
 * Formata velocidade em km/h (ex: "48 km/h")
 */
export function formatSpeed(speedKmh: number): string {
  return `${Math.round(speedKmh)} km/h`;
}

/**
 * Formata data no padrão português (ex: "26 de agosto de 2026" ou "26/08/2026")
 */
export function formatDatePT(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}
