class RingtonePlayer {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playToneBurst(freqs: number[], durationSec: number, gainPeak: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    gain.connect(ctx.destination);

    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + durationSec);
    }
  }

  startIncoming() {
    this.stop();
    const ring = () => {
      this.playToneBurst([523.25, 659.25], 0.35, 0.1);
      window.setTimeout(() => {
        if (this.timer !== null) {
          this.playToneBurst([659.25, 783.99], 0.4, 0.1);
        }
      }, 380);
    };
    ring();
    this.timer = window.setInterval(ring, 2400);
  }

  startOutgoing() {
    this.stop();
    const ringback = () => {
      this.playToneBurst([440, 480], 0.8, 0.045);
    };
    ringback();
    this.timer = window.setInterval(ringback, 3200);
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const ringtone = new RingtonePlayer();
