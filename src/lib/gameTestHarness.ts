// src/lib/gameTestHarness.ts
//
// Lets the AI "play-test" a student-generated game without any server-side
// execution: buildHarnessedHtml() injects a small script into the generated
// HTML that simulates trackpad/mouse input against the game's <canvas> and
// reports back (errors caught, whether the canvas actually changed) via
// postMessage. useGameSmokeTest() is the parent-side listener/timeout.
//
// canvasChanged is a soft signal, not a hard pass/fail: most canvas games
// redraw via requestAnimationFrame, which browsers fully suspend for a
// hidden/backgrounded document — so a real student briefly switching tabs
// mid-test (or any other reason the preview tab loses visibility) can make
// a perfectly working game report canvasChanged:false with zero errors.
// The AI verdict step is instructed to weigh actual errors far more than
// this flag for exactly that reason.

import { useCallback, useEffect, useRef, useState } from 'react';
import { injectEarly, STORAGE_SHIM_SCRIPT } from './sandboxSafety';

export interface GameTestReport {
  hadCanvas: boolean;
  canvasChanged: boolean | 'unknown';
  errors: string[];
}

export type GameTestStatus = 'idle' | 'running' | 'done' | 'timeout';

const HARNESS_TIMEOUT_MS = 8000;

// Registers error capture as early as possible — injected right after
// <head> (or right after <html>, or at the very top as a last resort) so it
// runs BEFORE the game's own <script> tags. A synchronous top-level throw
// in the generated game happens before any script injected at the end of
// <body> would even exist, so window.onerror has to be wired up ahead of
// the game's own code, not alongside the mouse-simulation script below.
function errorCaptureScript(): string {
  return `
<script>
window.__gameTestErrors = [];
window.onerror = function (msg, src, line) {
  window.__gameTestErrors.push(String(msg) + (line ? (' (line ' + line + ')') : ''));
  return false;
};
window.addEventListener('unhandledrejection', function (e) {
  window.__gameTestErrors.push('Unhandled promise rejection: ' + (e && e.reason ? String(e.reason) : 'unknown'));
});
</script>`;
}

// Injected before </body>, once the game's own markup/scripts exist. Runs
// mouse-only (mousemove/mousedown/mouseup/click) against the first <canvas>
// it finds — matches the mouse-only control constraint the game itself is
// required to honor. Samples the canvas repeatedly through the whole
// window (not just before/after) since a mouse path that happens to end
// back near its starting point would otherwise make "after" look identical
// to "before" even for a game that responded the whole time. getImageData
// is wrapped in try/catch: an external image drawn to canvas without CORS
// headers taints it and throws SecurityError — reported as 'unknown'
// rather than losing the whole test (the generation prompt also forbids
// external image/audio URLs so this shouldn't normally trigger).
function mouseTestScript(): string {
  return `
<script>
(function () {
  try {
    var errors = window.__gameTestErrors || [];

    function runTest() {
      var canvas = document.querySelector('canvas');
      var hadCanvas = !!canvas;
      var ctx = canvas ? canvas.getContext('2d') : null;

      var samples = [];
      var canvasReadFailed = false;
      function sample() {
        if (!canvas || !ctx || canvasReadFailed) return;
        try {
          samples.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data.join(','));
        } catch (e) { canvasReadFailed = true; }
      }

      if (canvas) {
        var rect = canvas.getBoundingClientRect();
        // Four distinct corners, no repeats — a mouse path that returns to
        // its starting point would otherwise mask real movement.
        var points = [
          [rect.left + rect.width * 0.2, rect.top + rect.height * 0.2],
          [rect.left + rect.width * 0.8, rect.top + rect.height * 0.2],
          [rect.left + rect.width * 0.8, rect.top + rect.height * 0.8],
          [rect.left + rect.width * 0.2, rect.top + rect.height * 0.8],
        ];

        function fire(type, x, y) {
          var evt = new MouseEvent(type, {
            bubbles: true, cancelable: true, view: window,
            clientX: x, clientY: y, button: 0,
          });
          canvas.dispatchEvent(evt);
        }

        sample(); // t=0, before any interaction
        var i = 0;
        var mover = setInterval(function () {
          if (i >= points.length) { clearInterval(mover); return; }
          fire('mousemove', points[i][0], points[i][1]);
          sample();
          i++;
        }, 250);

        setTimeout(function () { fire('mousedown', points[2][0], points[2][1]); sample(); }, 1100);
        setTimeout(function () { fire('mouseup',   points[2][0], points[2][1]); sample(); }, 1200);
        setTimeout(function () { fire('click',     points[2][0], points[2][1]); sample(); }, 1300);
      }

      setTimeout(function () {
        sample();
        var canvasChanged = 'unknown';
        if (canvas && ctx && !canvasReadFailed && samples.length > 1) {
          canvasChanged = samples.some(function (s) { return s !== samples[0]; });
        }
        try {
          window.parent.postMessage({
            source: 'game-test-harness',
            hadCanvas: hadCanvas,
            canvasChanged: canvasChanged,
            errors: errors,
          }, '*');
        } catch (e) {}
      }, 2000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runTest);
    } else {
      runTest();
    }
  } catch (e) {
    try {
      window.parent.postMessage({
        source: 'game-test-harness',
        hadCanvas: false,
        canvasChanged: 'unknown',
        errors: ['Test harness failed to start: ' + (e && e.message ? e.message : String(e))],
      }, '*');
    } catch (e2) {}
  }
})();
</script>`;
}

export function buildHarnessedHtml(rawHtml: string): string {
  // Storage shim first, then error capture — both need to run before the
  // game's own <script> tags, order between the two doesn't matter.
  const withEarlyScripts = injectEarly(injectEarly(rawHtml, STORAGE_SHIM_SCRIPT), errorCaptureScript());
  const closeBodyIdx = withEarlyScripts.search(/<\/body>/i);
  const tailScript = mouseTestScript();
  if (closeBodyIdx === -1) return withEarlyScripts + tailScript;
  return withEarlyScripts.slice(0, closeBodyIdx) + tailScript + withEarlyScripts.slice(closeBodyIdx);
}

export function useGameSmokeTest(iframeRef: React.RefObject<HTMLIFrameElement>) {
  const [status, setStatus] = useState<GameTestStatus>('idle');
  const [report, setReport] = useState<GameTestReport | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus('idle');
    setReport(null);
  }, []);

  const start = useCallback(() => {
    setStatus('running');
    setReport(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus(prev => (prev === 'running' ? 'timeout' : prev));
    }, HARNESS_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.data || event.data.source !== 'game-test-harness') return;
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setReport({
        hadCanvas: !!event.data.hadCanvas,
        canvasChanged: event.data.canvasChanged,
        errors: Array.isArray(event.data.errors) ? event.data.errors : [],
      });
      setStatus('done');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeRef]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return { status, report, start, reset };
}
