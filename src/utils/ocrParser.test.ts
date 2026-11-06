import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './ocrParser';

describe('parser OCR', () => {
  it('extrai valores identificados sem inventar campos em falta', () => {
    const parsed = parseReceiptText(
      'UBER\nGanhos: 123,45 €\nGorjetas: 4,00 €\nBónus: 2,50 €\nHoras online: 5h 30\nViagens: 7\nDistância: 88,5 km\n27/08/2026'
    );

    expect(parsed.platform).toBe('uber');
    expect(parsed.grossEarnings).toBe(123.45);
    expect(parsed.tips).toBe(4);
    expect(parsed.bonuses).toBe(2.5);
    expect(parsed.totalHours).toBe(5.5);
    expect(parsed.tripsCount).toBe(7);
    expect(parsed.distanceKm).toBe(88.5);
    expect(parsed.date).toBe('2026-08-27');
  });

  it('não transforma números sem contexto numa faturação fictícia', () => {
    const parsed = parseReceiptText('Relatório sem valores monetários\n27/08/2026\n2 viagens\n3 km');

    expect(parsed.platform).toBe('other');
    expect(parsed.grossEarnings).toBe(0);
    expect(parsed.confidence).toBe(0);
    expect(parsed.date).toBe('2026-08-27');
  });
});
