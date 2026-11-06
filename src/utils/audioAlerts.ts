/**
 * Sintetizador Web Audio API e Alertas Vocais em Português de Portugal
 */

class AudioAlertSystem {
  private ctx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Toca acordes sonoros elegantes ao atingir marcos da meta diária
   */
  public playMilestoneSound(milestone: 50 | 75 | 100) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Frequências para acordes maiores relaxantes (C Major / E / G / C)
    const freqs =
      milestone === 100
        ? [523.25, 659.25, 783.99, 1046.50] // Sucesso total
        : milestone === 75
        ? [440.00, 554.37, 659.25] // 75%
        : [392.00, 493.88, 587.33]; // 50%

    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);

      gain.gain.setValueAtTime(0.001, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.2, now + index * 0.08 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + 0.85);
    });
  }

  /**
   * Emite um sinal sonoro de aviso de segurança TVDE
   */
  public playWarningChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [587.33, 440.00].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.15);

      gain.gain.setValueAtTime(0.001, now + index * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.25, now + index * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.15 + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.15);
      osc.stop(now + index * 0.15 + 0.65);
    });
  }

  /**
   * Fala uma mensagem em Português de Portugal através da Web Speech API
   */
  public speakVoiceAlert(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Cancelar mensagens pendentes
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-PT';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Procurar voz em Português de Portugal ou padrão
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find((v) => v.lang === 'pt-PT' || v.lang.startsWith('pt'));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Erro na síntese vocal:', e);
    }
  }
}

export const audioAlertSystem = new AudioAlertSystem();
