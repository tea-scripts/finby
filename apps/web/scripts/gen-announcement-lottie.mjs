/* global console */
// Generates the cinematic announcement Lottie files into public/lottie.
// Run: node apps/web/scripts/gen-announcement-lottie.mjs
// The emitted JSON is the committed artifact; this generator keeps it tunable.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'lottie');
mkdirSync(OUT, { recursive: true });

const ease = (t, s) => ({ i: { x: [0.42], y: [0] }, o: { x: [0.58], y: [1] }, t, s });
const hold = (t, s) => ({ t, s });

// ── colour helpers (0..1 rgba) ───────────────────────────────────────────────
const rgb = (r, g, b, a = 1) => [r / 255, g / 255, b / 255, a];
const BELL = rgb(255, 209, 102);
const BELL_DK = rgb(214, 158, 46);
const RED = rgb(239, 68, 68);
const WAVE = rgb(255, 209, 102);
const SPARK = rgb(255, 196, 90);

const fill = (c, o = 100) => ({ ty: 'fl', c: { a: 0, k: c }, o: { a: 0, k: o }, r: 1, nm: 'fill' });
const stroke = (c, w, o = 100) => ({
  ty: 'st', c: { a: 0, k: c }, o: { a: 0, k: o }, w: { a: 0, k: w }, lc: 2, lj: 2, nm: 'stroke',
});

// Gradient fill. `stops` = [pos, r,g,b, ...] (0..1). t: 1 linear, 2 radial.
const grad = (stops, s, e, t = 1, o = 100) => ({
  ty: 'gf', o: { a: 0, k: o }, r: 1, bm: 0,
  g: { p: stops.length / 4, k: { a: 0, k: stops } },
  s: { a: 0, k: s }, e: { a: 0, k: e }, t, nm: 'gf',
});

// fire gradient: deep red base -> orange -> amber -> pale tip
const FIRE = [0, 0.80, 0.11, 0.11, 0.4, 1, 0.35, 0, 0.74, 1, 0.62, 0.17, 1, 1, 0.91, 0.66];
// inner: orange -> gold -> white-hot
const INNER = [0, 1, 0.45, 0, 0.5, 1, 0.8, 0.3, 1, 1, 0.98, 0.85];
// glow: warm centre fading out (radial)
const GLOW = [0, 1, 0.42, 0, 1, 1, 0.25, 0, 1];

const trGroup = () => ({
  ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 }, o: { a: 0, k: 100 },
});
const ellipse = (size, pos = [0, 0]) => ({ ty: 'el', d: 1, s: { a: 0, k: size }, p: { a: 0, k: pos }, nm: 'el' });
const group = (items, nm = 'grp') => ({ ty: 'gr', nm, it: [...items, trGroup()] });

// A flame silhouette (6 vertices). `lean` shifts the tip + body sideways and
// `tip` raises/lowers the point, so morphing between variants reads as licking.
function flameShape(lean = 0, tip = 0) {
  return {
    c: true,
    v: [
      [lean * 1.4, -60 - tip], [24 + lean, -6], [19, 34], [0, 42], [-19, 34], [-24 + lean, -6],
    ],
    i: [[10, -10], [-6, -18], [8, -14], [16, 0], [4, 8], [-6, 18]],
    o: [[-10, -10], [6, 18], [-4, 8], [-16, 0], [-8, -14], [6, -18]],
  };
}

// An animated path that cycles through licking silhouettes over the loop.
function lickingPath(variants, times) {
  return {
    ty: 'sh', ind: 0, nm: 'path',
    ks: { a: 1, k: times.map((t, i) => ease(t, [variants[i % variants.length]])) },
  };
}

function path(shape) {
  return { ty: 'sh', ind: 0, ks: { a: 0, k: shape }, nm: 'path' };
}

function layer(ind, nm, shapes, ks, op = 150) {
  return {
    ddd: 0, ind, ty: 4, nm, sr: 1,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [100, 110, 0] },
      a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] }, ...ks },
    ao: 0, shapes, ip: 0, op, st: 0, bm: 0,
  };
}

function comp(nm, layers, op = 150, size = 200) {
  return { v: '5.7.4', fr: 60, ip: 0, op, w: size, h: size, nm, ddd: 0, assets: [], layers };
}

// ── streak-flame ─────────────────────────────────────────────────────────────
function streakFlame() {
  const layers = [];
  let ind = 1;

  // rising embers (behind the flame, peeking through the edges)
  const sparkStarts = [0, 30, 60, 90, 120];
  const sparkX = [-13, 11, -5, 16, -18];
  sparkStarts.forEach((start, i) => {
    const end = start + 40;
    const baseY = 152;
    layers.push(
      layer(ind++, `spark-${i}`, [group([ellipse([6, 6]), fill(SPARK)])], {
        p: { a: 1, k: [ease(start, [100 + sparkX[i], baseY, 0]), hold(end, [100 + sparkX[i] * 1.7, baseY - 86, 0])] },
        o: { a: 1, k: [hold(start, [0]), ease(start + 7, [90]), ease(end, [0])] },
        s: { a: 1, k: [ease(start, [100, 100, 100]), hold(end, [30, 30, 100])] },
      }),
    );
  });

  // heat glow (radial gradient, pulsing)
  layers.push(
    layer(ind++, 'glow', [group([ellipse([170, 180]), grad(GLOW, [0, 0], [0, 90], 2, 55)])], {
      p: { a: 0, k: [100, 118, 0] },
      o: { a: 1, k: [ease(0, [45]), ease(40, [70]), ease(88, [45]), ease(150, [45])] },
      s: { a: 1, k: [ease(0, [100, 100, 100]), ease(55, [116, 116, 100]), ease(150, [100, 100, 100])] },
    }),
  );

  // main flame — fire gradient + licking path morph + flicker
  const mainVariants = [flameShape(0, 0), flameShape(7, 4), flameShape(-6, -3), flameShape(4, 6), flameShape(-8, 1), flameShape(0, 0)];
  const mainTimes = [0, 26, 52, 80, 110, 150];
  layers.push(
    layer(ind++, 'flame-main', [group([lickingPath(mainVariants, mainTimes), grad(FIRE, [0, 42], [0, -58])])], {
      p: { a: 0, k: [100, 130, 0] },
      s: { a: 1, k: [ease(0, [100, 100, 100]), ease(22, [106, 96, 100]), ease(58, [96, 107, 100]), ease(96, [104, 98, 100]), ease(150, [100, 100, 100])] },
    }),
  );

  // inner flame — brighter gradient, faster + opposite-phase licking
  const innerVariants = [flameShape(0, 0), flameShape(-6, 5), flameShape(6, -2), flameShape(-4, 4), flameShape(5, 1), flameShape(0, 0)];
  const innerTimes = [0, 20, 42, 70, 104, 150];
  layers.push(
    layer(ind++, 'flame-inner', [group([lickingPath(innerVariants, innerTimes), grad(INNER, [0, 36], [0, -40])])], {
      p: { a: 0, k: [100, 134, 0] },
      s: { a: 1, k: [ease(0, [60, 60, 100]), ease(18, [56, 66, 100]), ease(46, [64, 58, 100]), ease(82, [58, 64, 100]), ease(150, [60, 60, 100])] },
    }),
  );

  // white-hot core — shimmering ellipse
  layers.push(
    layer(ind++, 'core', [group([ellipse([22, 34]), grad(INNER, [0, 14], [0, -16], 2)])], {
      p: { a: 0, k: [100, 148, 0] },
      o: { a: 1, k: [ease(0, [80]), ease(24, [100]), ease(60, [76]), ease(104, [100]), ease(150, [80])] },
      s: { a: 1, k: [ease(0, [100, 100, 100]), ease(38, [116, 90, 100]), ease(88, [92, 112, 100]), ease(150, [100, 100, 100])] },
    }),
  );

  return comp('streak-flame', layers);
}

// ── notif-bell (unchanged — already looks good) ──────────────────────────────
function notifBell() {
  const layers = [];
  let ind = 1;
  const bellShape = {
    c: true,
    v: [[-7, 6], [-28, 50], [-32, 60], [32, 60], [28, 50], [7, 6]],
    i: [[-2, -14], [2, -12], [4, 0], [-4, 0], [-2, 12], [10, 0]],
    o: [[-10, 0], [-2, 12], [-4, 0], [4, 0], [2, -12], [4, -14]],
  };

  [0, 50, 100].forEach((start, i) => {
    const end = start + 70;
    layers.push(
      layer(ind++, `wave-${i}`, [group([ellipse([70, 70]), stroke(WAVE, 5)])], {
        p: { a: 0, k: [100, 92, 0] },
        o: { a: 1, k: [hold(start, [0]), ease(start + 6, [55]), ease(end, [0])] },
        s: { a: 1, k: [ease(start, [55, 55, 100]), hold(end, [165, 165, 100])] },
      }, 170),
    );
  });

  layers.push(
    layer(ind++, 'bell', [
      group([path(bellShape), fill(BELL)], 'body'),
      group([ellipse([10, 10], [0, 70]), fill(BELL_DK)], 'clapper'),
    ], {
      p: { a: 0, k: [100, 70, 0] }, a: { a: 0, k: [0, 0, 0] },
      r: { a: 1, k: [ease(0, [0]), ease(20, [13]), ease(55, [-13]), ease(90, [9]), ease(120, [-6]), ease(150, [0]), hold(170, [0])] },
    }, 170),
  );

  layers.push(
    layer(ind++, 'dot', [group([ellipse([18, 18]), fill(RED)])], {
      p: { a: 0, k: [128, 60, 0] },
      s: { a: 1, k: [hold(0, [0, 0, 100]), ease(10, [120, 120, 100]), ease(22, [100, 100, 100])] },
    }, 170),
  );

  return comp('notif-bell', layers, 170);
}

writeFileSync(join(OUT, 'streak-flame.json'), JSON.stringify(streakFlame()));
writeFileSync(join(OUT, 'notif-bell.json'), JSON.stringify(notifBell()));
console.log('wrote streak-flame.json and notif-bell.json to', OUT);
