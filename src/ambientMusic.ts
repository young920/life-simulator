export type AmbientMusicController = { stop: () => void };

export async function startAmbientMusic(): Promise<AmbientMusicController> {
  const audio = new Audio("/assets/music/forget-me-not-loop.mp3");
  audio.loop = true;
  audio.preload = "auto";

  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("Web Audio is unavailable.");

  const context = new AudioContextConstructor();
  const source = context.createMediaElementSource(audio);
  const volume = context.createGain();
  volume.gain.value = 0;
  source.connect(volume);
  volume.connect(context.destination);

  try {
    await context.resume();
    await audio.play();
  } catch (error) {
    audio.pause();
    await context.close();
    throw error;
  }

  volume.gain.setTargetAtTime(0.2, context.currentTime, 0.65);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      volume.gain.cancelScheduledValues(context.currentTime);
      volume.gain.setTargetAtTime(0, context.currentTime, 0.22);
      window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
        void context.close();
      }, 950);
    },
  };
}
