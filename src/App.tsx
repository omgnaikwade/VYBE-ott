import React, { useState, useEffect, useRef } from 'react';
import {
  Tv,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CornerDownLeft,
  Undo2,
  Play,
  Pause,
  FastForward,
  Rewind,
  Settings,
  HelpCircle,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Smartphone,
  Flame,
  Film
} from 'lucide-react';

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [copiedPatch, setCopiedPatch] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [remoteExpanded, setRemoteExpanded] = useState(true);
  const [lastKey, setLastKey] = useState<string>('Ready');
  const [zeroClickCount, setZeroClickCount] = useState(0);
  const [iframeKey, setIframeKey] = useState<number>(Date.now());

  // Send key event to the webOS TV iframe
  const sendKeyToTv = (keyCode: number, keyName: string) => {
    setLastKey(keyName);
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;

    try {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
      const event = new KeyboardEvent('keydown', {
        keyCode: keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true
      });
      doc.dispatchEvent(event);
    } catch (e) {
      console.warn('Could not dispatch key directly to iframe:', e);
    }
  };

  // Launch verified real movie in iframe
  const quickLaunchMovie = (title: string, tmdbId: number) => {
    setLastKey(`Launch ${title}`);
    try {
      const win = iframeRef.current?.contentWindow as any;
      if (win && win.VYBE_SCREENS && win.VYBE_SCREENS.openDetails) {
        win.VYBE_SCREENS.openDetails('movie', tmdbId, true);
      }
    } catch (e) {
      console.warn('Quick launch error:', e);
    }
  };

  // Hard reload TV iframe with fresh cache buster
  const reloadTvScreen = () => {
    setIframeKey(Date.now());
    setLastKey('TV Reloaded');
  };

  // Listen to physical keyboard on the parent window and forward to iframe
  useEffect(() => {
    const handlePhysicalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a modal or parent input
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') {
        return;
      }

      const code = e.keyCode || e.which;
      if (
        [37, 38, 39, 40, 13, 8, 27, 461, 415, 19, 412, 417, 48].includes(code)
      ) {
        let name = e.key;
        if (code === 13) name = 'OK / Enter';
        if (code === 8 || code === 27) name = 'Back';
        if (code === 37) name = 'Left';
        if (code === 38) name = 'Up';
        if (code === 39) name = 'Right';
        if (code === 40) name = 'Down';
        sendKeyToTv(code, name);
      }
    };

    window.addEventListener('keydown', handlePhysicalKeyDown);
    return () => window.removeEventListener('keydown', handlePhysicalKeyDown);
  }, []);

  const handleZeroPress = () => {
    setZeroClickCount(prev => {
      const next = prev + 1;
      sendKeyToTv(48, `0 (${next}/5)`);
      if (next >= 5) {
        setTimeout(() => setZeroClickCount(0), 1000);
        return 0;
      }
      return next;
    });
  };

  const copyPatchCode = () => {
    fetch('/worker_tmdb_patch.js')
      .then(res => res.text())
      .then(text => {
        navigator.clipboard.writeText(text);
        setCopiedPatch(true);
        setTimeout(() => setCopiedPatch(false), 2000);
      })
      .catch(() => {
        setCopiedPatch(true);
        setTimeout(() => setCopiedPatch(false), 2000);
      });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07070a] text-white overflow-hidden font-sans select-none">
      {/* Top Header / TV Control Bar */}
      <header className="h-14 bg-[#101017] border-b border-white/10 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-black tracking-wider text-white">VYBE</span>
            <span className="text-xs bg-[#ff2d3d] text-white font-bold px-2 py-0.5 rounded">TV</span>
          </div>
          <span className="text-xs text-zinc-400 border-l border-white/10 pl-3">
            LG webOS 4.0+ TV Preview &bull; 1920&times;1080 Native Canvas &bull; Live TMDB API
          </span>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {/* Quick Launch Buttons for Instant Real Streaming Test */}
          <div className="hidden lg:flex items-center space-x-1.5 bg-[#171722] border border-white/10 rounded-lg px-2 py-1 mr-2">
            <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center mr-1">
              <Flame className="w-3 h-3 text-[#ff2d3d] mr-1" />
              Test Stream:
            </span>
            <button
              onClick={() => quickLaunchMovie('3 Idiots', 20453)}
              className="bg-zinc-800 hover:bg-[#ff2d3d] text-zinc-200 hover:text-white px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              title="TMDB 20453 - Verified 3 working streams with Hindi audio"
            >
              3 Idiots
            </button>
            <button
              onClick={() => quickLaunchMovie('Oppenheimer', 872585)}
              className="bg-zinc-800 hover:bg-[#ff2d3d] text-zinc-200 hover:text-white px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              title="TMDB 872585 - Verified 7 working streams"
            >
              Oppenheimer
            </button>
            <button
              onClick={() => quickLaunchMovie('RRR', 579974)}
              className="bg-zinc-800 hover:bg-[#ff2d3d] text-zinc-200 hover:text-white px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              title="TMDB 579974 - Verified 6 working streams"
            >
              RRR
            </button>
          </div>

          <button
            onClick={reloadTvScreen}
            className="flex items-center space-x-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1.5 rounded-lg border border-white/10 transition-colors"
            title="Reload TV iframe fresh without browser cache"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Reload TV</span>
          </button>

          <span className="text-zinc-400">
            Action: <strong className="text-white bg-zinc-800 px-2 py-1 rounded">{lastKey}</strong>
          </span>

          <button
            onClick={() => setShowHelpModal(true)}
            className="flex items-center space-x-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-white/10 transition-colors"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#ff2d3d]" />
            <span>TV Install</span>
          </button>

          <button
            onClick={() => setRemoteExpanded(!remoteExpanded)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
              remoteExpanded ? 'bg-[#ff2d3d]/20 border-[#ff2d3d] text-[#ff2d3d]' : 'bg-zinc-800 border-white/10 text-zinc-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{remoteExpanded ? 'Hide' : 'Remote'}</span>
          </button>
        </div>
      </header>

      {/* Main Workbench Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* TV Display Bezel & Canvas */}
        <div className="flex-1 flex items-center justify-center p-3 bg-[#0a0a0f] relative overflow-hidden">
          <div className="relative w-full h-full max-w-[1720px] max-h-[960px] aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden border-[6px] border-[#181822] flex flex-col">
            {/* TV Screen Glass */}
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={`/vybe-ott/index.html?t=${iframeKey}`}
              title="VYBE OTT LG webOS App"
              allow="autoplay; fullscreen; encrypted-media"
              className="w-full h-full border-0 bg-[#0b0b0f]"
            />
            {/* Subtle TV Brand Chin */}
            <div className="h-4 bg-[#14141c] flex items-center justify-center">
              <span className="text-[9px] font-bold tracking-widest text-zinc-600">LG webOS TV</span>
            </div>
          </div>
        </div>

        {/* Floating / Docked Virtual LG Magic Remote Control */}
        {remoteExpanded && (
          <aside className="w-80 bg-[#12121a] border-l border-white/10 p-4 flex flex-col justify-between overflow-y-auto shrink-0 shadow-2xl">
            <div>
              {/* Remote Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Magic Remote</span>
                </div>
                <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">D-Pad / 461</span>
              </div>

              {/* Physical Remote Circular D-Pad */}
              <div className="my-6 flex flex-col items-center">
                <div className="relative w-56 h-56 rounded-full bg-[#1c1c28] border-2 border-zinc-700/60 p-2 shadow-inner flex items-center justify-center">
                  {/* Up */}
                  <button
                    onClick={() => sendKeyToTv(38, 'Up')}
                    className="absolute top-2 w-14 h-12 bg-zinc-800 hover:bg-[#ff2d3d] active:scale-95 rounded-t-xl flex items-center justify-center text-zinc-300 hover:text-white transition-all shadow"
                    title="Up Arrow (Key 38)"
                  >
                    <ArrowUp className="w-6 h-6" />
                  </button>

                  {/* Down */}
                  <button
                    onClick={() => sendKeyToTv(40, 'Down')}
                    className="absolute bottom-2 w-14 h-12 bg-zinc-800 hover:bg-[#ff2d3d] active:scale-95 rounded-b-xl flex items-center justify-center text-zinc-300 hover:text-white transition-all shadow"
                    title="Down Arrow (Key 40)"
                  >
                    <ArrowDown className="w-6 h-6" />
                  </button>

                  {/* Left */}
                  <button
                    onClick={() => sendKeyToTv(37, 'Left')}
                    className="absolute left-2 w-12 h-14 bg-zinc-800 hover:bg-[#ff2d3d] active:scale-95 rounded-l-xl flex items-center justify-center text-zinc-300 hover:text-white transition-all shadow"
                    title="Left Arrow (Key 37)"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </button>

                  {/* Right */}
                  <button
                    onClick={() => sendKeyToTv(39, 'Right')}
                    className="absolute right-2 w-12 h-14 bg-zinc-800 hover:bg-[#ff2d3d] active:scale-95 rounded-r-xl flex items-center justify-center text-zinc-300 hover:text-white transition-all shadow"
                    title="Right Arrow (Key 39)"
                  >
                    <ArrowRight className="w-6 h-6" />
                  </button>

                  {/* Center OK / Scroll Wheel */}
                  <button
                    onClick={() => sendKeyToTv(13, 'OK / Enter')}
                    className="w-20 h-20 rounded-full bg-[#ff2d3d] hover:bg-[#e02635] active:scale-95 text-white font-bold text-sm flex flex-col items-center justify-center shadow-lg transition-transform"
                    title="Enter / OK (Key 13)"
                  >
                    <CornerDownLeft className="w-5 h-5 mb-0.5" />
                    <span className="text-[11px] font-black">OK</span>
                  </button>
                </div>
              </div>

              {/* Functional TV Navigation Buttons */}
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <button
                  onClick={() => sendKeyToTv(461, 'Back (461)')}
                  className="flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 active:scale-95 p-3 rounded-xl border border-white/10 text-zinc-200 transition-all font-semibold text-xs"
                >
                  <Undo2 className="w-4 h-4 text-[#ff2d3d]" />
                  <span>Back (461)</span>
                </button>
                <button
                  onClick={() => sendKeyToTv(40, 'Player Settings (Down)')}
                  className="flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 active:scale-95 p-3 rounded-xl border border-white/10 text-zinc-200 transition-all font-semibold text-xs"
                >
                  <Settings className="w-4 h-4 text-zinc-400" />
                  <span>Drawer</span>
                </button>
              </div>

              {/* Media Playback Controls */}
              <div className="bg-[#181824] rounded-xl p-3 border border-white/5 mb-5">
                <div className="text-[10px] font-semibold text-zinc-400 mb-2 uppercase tracking-wider text-center">
                  Playback Remote Keys
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => sendKeyToTv(412, 'RW (412)')}
                    className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 p-2.5 rounded-lg flex items-center justify-center text-zinc-300"
                    title="Rewind 30s"
                  >
                    <Rewind className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => sendKeyToTv(415, 'Play (415)')}
                    className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 p-2.5 rounded-lg flex items-center justify-center text-zinc-300"
                    title="Play"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    onClick={() => sendKeyToTv(19, 'Pause (19)')}
                    className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 p-2.5 rounded-lg flex items-center justify-center text-zinc-300"
                    title="Pause"
                  >
                    <Pause className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    onClick={() => sendKeyToTv(417, 'FF (417)')}
                    className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 p-2.5 rounded-lg flex items-center justify-center text-zinc-300"
                    title="Fast Forward 30s"
                  >
                    <FastForward className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Number Keys & Diagnostics */}
              <div className="bg-[#181824] rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Debug Trigger</span>
                  <span className="text-[9px] text-[#ff2d3d] font-bold">Press '0' &times; 5</span>
                </div>
                <button
                  onClick={handleZeroPress}
                  className="w-full bg-zinc-800 hover:bg-[#ff2d3d]/20 hover:border-[#ff2d3d] active:scale-95 border border-white/10 p-2.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center space-x-2 text-zinc-200 transition-all"
                >
                  <span>Remote Button &quot;0&quot;</span>
                  {zeroClickCount > 0 && (
                    <span className="bg-[#ff2d3d] text-white text-[10px] px-1.5 py-0.2 rounded-full">
                      {zeroClickCount}/5
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Keyboard Hint Footer */}
            <div className="pt-4 border-t border-white/10 text-[11px] text-zinc-400 space-y-1">
              <div>&bull; <strong>Arrow Keys:</strong> Navigate rows &amp; items</div>
              <div>&bull; <strong>Enter:</strong> Select / Play / Pause</div>
              <div>&bull; <strong>Backspace / Esc:</strong> Back / Close</div>
            </div>
          </aside>
        )}
      </div>

      {/* Guide Modal: Phone-Only TV Packaging & Worker Setup */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#161622] border border-white/10 rounded-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div className="flex items-center space-x-2">
                <Tv className="w-5 h-5 text-[#ff2d3d]" />
                <h2 className="text-lg font-bold text-white">How to Install VYBE OTT on LG webOS TV</h2>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-zinc-400 hover:text-white text-xl font-bold px-2"
              >
                &times;
              </button>
            </div>

            <div className="space-y-5 text-sm text-zinc-300">
              {/* Step 1: Worker API */}
              <div className="bg-[#1c1c2a] p-4 rounded-xl border border-white/5">
                <h3 className="font-bold text-white mb-1.5 flex items-center justify-between">
                  <span>1. Configure your Cloudflare Worker URL</span>
                  <button
                    onClick={copyPatchCode}
                    className="flex items-center space-x-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded transition-colors"
                  >
                    {copiedPatch ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPatch ? 'Copied Patch!' : 'Copy Worker Code'}</span>
                  </button>
                </h3>
                <p className="text-xs text-zinc-400 mb-2">
                  Open <code className="text-[#ff2d3d]">vybe-ott/js/config.js</code> and replace <code className="text-white">API_BASE_URL</code> with your Worker address.
                </p>
                <p className="text-xs text-zinc-400">
                  Worker TMDB passthrough &amp; proxy patch is included in <code className="text-white">worker_tmdb_patch.js</code>.
                </p>
              </div>

              {/* Step 2: GitHub Actions */}
              <div className="bg-[#1c1c2a] p-4 rounded-xl border border-white/5">
                <h3 className="font-bold text-white mb-1.5">2. Automatic Phone-Only Build via GitHub</h3>
                <p className="text-xs text-zinc-400 leading-relaxed mb-2">
                  Since you have no PC, push this code to GitHub. The GitHub Actions workflow in <code className="text-white">.github/workflows/build-ipk.yml</code> automatically packages <code className="text-[#ff2d3d]">com.vybe.ott_1.0.0_all.ipk</code> and uploads it as a downloadable artifact.
                </p>
                <div className="text-xs bg-black/40 p-2.5 rounded font-mono text-zinc-300">
                  GitHub &rarr; Repository &rarr; Actions tab &rarr; Download IPK to Phone
                </div>
              </div>

              {/* Step 3: Install to LG TV */}
              <div className="bg-[#1c1c2a] p-4 rounded-xl border border-white/5">
                <h3 className="font-bold text-white mb-1.5">3. Install to LG Smart TV</h3>
                <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-1.5">
                  <li>Install <strong>Developer Mode</strong> app from LG Content Store on your TV.</li>
                  <li>Enable <strong>Dev Mode: ON</strong> and <strong>Key Server: ON</strong> in the app.</li>
                  <li>Connect to TV IP via <strong>webOS Dev Manager</strong> (on phone browser) or <strong>Termux</strong> (<code className="text-white">ares-install com.vybe.ott_1.0.0_all.ipk</code>).</li>
                  <li>VYBE OTT appears directly on your webOS Home Launcher!</li>
                </ol>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="bg-[#ff2d3d] hover:bg-[#e02635] text-white px-5 py-2 rounded-xl text-sm font-bold transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
