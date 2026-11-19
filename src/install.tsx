// Suggests putting Virtual Midrash on the home screen, from the second visit on, until answered.
import { useEffect, useState } from 'react';
import { usePrefs, setPrefs } from './store';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let saved: InstallEvent | null = null;
const listeners = new Set<() => void>();
// Android/Chrome hands over an install prompt we can show later.
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); saved = e as InstallEvent; listeners.forEach((f) => f()); });

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function InstallPrompt() {
  const prefs = usePrefs();
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  if (prefs.installAsked || prefs.visits < 2 || standalone() || (!saved && !isIos())) return null;
  const done = () => setPrefs({ installAsked: true });
  const add = async () => { if (saved) { await saved.prompt(); await saved.userChoice.catch(() => null); saved = null; } done(); };
  return (
    <div className="install" role="region" aria-label="Add to home screen">
      <img src="./brand/icon-192.png" alt="" />
      <span><b>Keep Virtual Midrash on your home screen</b>
        <small>{saved ? 'One tap to open, like an app.' : 'Tap the Share button below, then “Add to Home Screen”.'}</small></span>
      {saved && <button className="btn small" onClick={add}>Add</button>}
      <button className="install-x" onClick={done} aria-label="Dismiss">×</button>
    </div>
  );
}
