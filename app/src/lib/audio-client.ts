export function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
const audioListeners = new Set<() => void>();

function notifyAudio() {
  for (const fn of audioListeners) fn();
}

export function subscribeAudioPlayback(onChange: () => void): () => void {
  audioListeners.add(onChange);
  return () => audioListeners.delete(onChange);
}

export function playingAudioUrl(): string | null {
  if (!current || current.paused) return null;
  return currentUrl;
}

export async function playAudioUrl(url: string) {
  if (current && currentUrl === url && !current.paused) {
    current.pause();
    current = null;
    currentUrl = null;
    notifyAudio();
    return;
  }
  current?.pause();
  const audio = new Audio(url);
  current = audio;
  currentUrl = url;
  audio.onended = () => {
    if (current === audio) {
      current = null;
      currentUrl = null;
      notifyAudio();
    }
  };
  audio.onpause = () => notifyAudio();
  audio.onplay = () => notifyAudio();
  notifyAudio();
  try {
    await audio.play();
  } catch {
    current = null;
    currentUrl = null;
    notifyAudio();
  }
}

export function stopAudio() {
  current?.pause();
  current = null;
  currentUrl = null;
  notifyAudio();
}
