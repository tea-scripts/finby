/* global console */
// Generates the cinematic announcement Lottie files (flame, bell, receipt)
// into public/lottie. Run: node apps/web/scripts/gen-announcement-lottie.mjs
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
const PAPER = rgb(248, 250, 252);
const INK_LINE = rgb(148, 163, 184);
const BEAM = rgb(52, 211, 153);
const CHECK_BG = rgb(16, 185, 129);
const WHITE = rgb(255, 255, 255);
const CHIP = rgb(255, 209, 102);
const BADGE = rgb(29, 110, 245);

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
// account-card face gradients (2 stops: deep -> bright), one per card "type"
const CARD_BLUE = [0, 0.11, 0.4, 0.92, 1, 0.3, 0.6, 1];
const CARD_GREEN = [0, 0.02, 0.55, 0.38, 1, 0.13, 0.8, 0.55];
const CARD_VIOLET = [0, 0.4, 0.25, 0.85, 1, 0.62, 0.45, 0.98];
// cool accent glow behind the stack (radial)
const ACCT_GLOW = [0, 0.16, 0.5, 1, 1, 0.04, 0.2, 0.45];

const trGroup = () => ({
  ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 }, o: { a: 0, k: 100 },
});
const ellipse = (size, pos = [0, 0]) => ({ ty: 'el', d: 1, s: { a: 0, k: size }, p: { a: 0, k: pos }, nm: 'el' });
const rect = (size, pos = [0, 0], r = 0) => ({
  ty: 'rc', d: 1, s: { a: 0, k: size }, p: { a: 0, k: pos }, r: { a: 0, k: r }, nm: 'rc',
});
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

// ── receipt-scan ─────────────────────────────────────────────────────────────
function receiptScan() {
  const layers = [];
  let ind = 1;

  // soft emerald glow behind the receipt, pulsing with each scan sweep
  const EMERALD_GLOW = [0, 0.2, 0.9, 0.6, 1, 0.04, 0.5, 0.35];
  layers.push(
    layer(ind++, 'glow', [group([ellipse([176, 184]), grad(EMERALD_GLOW, [0, 0], [0, 92], 2, 40)])], {
      p: { a: 0, k: [100, 104, 0] },
      o: { a: 1, k: [ease(0, [28]), ease(34, [55]), ease(70, [28]), ease(104, [55]), ease(140, [28]), hold(170, [28])] },
    }, 170),
  );

  // receipt paper — zigzag torn bottom edge, gentle bob + tilt
  const zero = (n) => Array.from({ length: n }, () => [0, 0]);
  const receiptShape = {
    c: true,
    v: [
      [-38, -52], [38, -52], [38, 44], [28.5, 52], [19, 44], [9.5, 52],
      [0, 44], [-9.5, 52], [-19, 44], [-28.5, 52], [-38, 44],
    ],
    i: zero(11),
    o: zero(11),
  };
  const bob = {
    p: { a: 1, k: [ease(0, [100, 104, 0]), ease(44, [100, 101, 0]), ease(96, [100, 106, 0]), ease(140, [100, 104, 0]), hold(170, [100, 104, 0])] },
    r: { a: 1, k: [ease(0, [-1.5]), ease(70, [1.5]), ease(140, [-1.5]), hold(170, [-1.5])] },
  };
  layers.push(layer(ind++, 'paper', [group([path(receiptShape), fill(PAPER)])], bob, 170));

  // printed lines (separate layer, same bob so they track the paper)
  layers.push(
    layer(ind++, 'lines', [
      group([rect([52, 5], [0, -36], 2.5), fill(INK_LINE, 70)], 'line-0'),
      group([rect([52, 5], [0, -22], 2.5), fill(INK_LINE, 55)], 'line-1'),
      group([rect([52, 5], [0, -8], 2.5), fill(INK_LINE, 55)], 'line-2'),
      group([rect([30, 5], [-11, 6], 2.5), fill(INK_LINE, 45)], 'line-3'),
      group([rect([24, 6], [14, 26], 3), fill(BEAM, 80)], 'total'),
    ], bob, 170),
  );

  // scan beam — bright bar with a soft halo, sweeping down the receipt twice
  [0, 76].forEach((start, i) => {
    layers.push(
      layer(ind++, `beam-${i}`, [
        group([ellipse([110, 26]), fill(BEAM, 28)], 'halo'),
        group([rect([88, 5], [0, 0], 2.5), fill(BEAM)], 'bar'),
      ], {
        p: { a: 1, k: [ease(start, [100, 56, 0]), hold(start + 58, [100, 152, 0])] },
        o: { a: 1, k: [hold(start, [0]), ease(start + 6, [95]), ease(start + 48, [95]), ease(start + 58, [0])] },
      }, 170),
    );
  });

  // check badge — pops in after the first sweep finishes (top-right, like the bell dot)
  const checkMark = {
    c: false,
    v: [[-6.5, 0.5], [-2, 5], [6.5, -5]],
    i: zero(3),
    o: zero(3),
  };
  layers.push(
    layer(ind++, 'check', [
      group([ellipse([32, 32]), fill(CHECK_BG)], 'badge'),
      group([path(checkMark), stroke(WHITE, 4)], 'tick'),
    ], {
      p: { a: 0, k: [138, 58, 0] },
      s: { a: 1, k: [hold(0, [0, 0, 100]), hold(58, [0, 0, 100]), ease(68, [120, 120, 100]), ease(80, [100, 100, 100])] },
    }, 170),
  );

  return comp('receipt-scan', layers, 170);
}

// ── account-cards ────────────────────────────────────────────────────────────
function accountCards() {
  const layers = [];
  let ind = 1;

  // cool accent glow behind the stack, gently breathing
  layers.push(
    layer(ind++, 'glow', [group([ellipse([182, 182]), grad(ACCT_GLOW, [0, 0], [0, 90], 2, 45)])], {
      p: { a: 0, k: [100, 104, 0] },
      o: { a: 1, k: [ease(0, [28]), ease(40, [52]), ease(90, [28]), ease(150, [28])] },
      s: { a: 1, k: [ease(0, [100, 100, 100]), ease(55, [112, 112, 100]), ease(150, [100, 100, 100])] },
    }),
  );

  // one card = gradient body + chip + two stripes, sharing the layer transform
  const cardShapes = (gradStops) => [
    group([rect([98, 62], [0, 0], 12), grad(gradStops, [-49, -31], [49, 31])], 'body'),
    group([rect([16, 12], [-28, -10], 3), fill(CHIP)], 'chip'),
    group([rect([44, 5], [6, 12], 2.5), fill(WHITE, 55)], 'stripe-0'),
    group([rect([30, 5], [-1, 22], 2.5), fill(WHITE, 32)], 'stripe-1'),
  ];

  // three cards slide up and settle into a fanned stack, back-to-front stagger
  const cards = [
    { grad: CARD_BLUE, rest: [100, 92, 0], rot: -11, start: 0 },
    { grad: CARD_GREEN, rest: [100, 104, 0], rot: 0, start: 12 },
    { grad: CARD_VIOLET, rest: [100, 116, 0], rot: 11, start: 24 },
  ];
  cards.forEach((c, i) => {
    const settle = c.start + 26;
    layers.push(
      layer(ind++, `card-${i}`, cardShapes(c.grad), {
        p: { a: 1, k: [ease(c.start, [c.rest[0], c.rest[1] + 34, 0]), hold(settle, c.rest)] },
        r: { a: 1, k: [ease(c.start, [c.rot * 0.3]), hold(settle, [c.rot])] },
        o: { a: 1, k: [hold(c.start, [0]), ease(c.start + 8, [100])] },
        s: { a: 1, k: [ease(c.start, [86, 86, 100]), hold(settle, [100, 100, 100])] },
      }),
    );
  });

  // "+" badge pops once the stack has settled (top-right success beat)
  const plusH = { c: false, v: [[-7, 0], [7, 0]], i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]] };
  const plusV = { c: false, v: [[0, -7], [0, 7]], i: [[0, 0], [0, 0]], o: [[0, 0], [0, 0]] };
  layers.push(
    layer(ind++, 'badge', [
      group([ellipse([34, 34]), fill(BADGE)], 'circle'),
      group([path(plusH), stroke(WHITE, 4)], 'plus-h'),
      group([path(plusV), stroke(WHITE, 4)], 'plus-v'),
    ], {
      p: { a: 0, k: [142, 82, 0] },
      s: { a: 1, k: [hold(0, [0, 0, 100]), hold(54, [0, 0, 100]), ease(64, [120, 120, 100]), ease(76, [100, 100, 100])] },
    }),
  );

  return comp('account-cards', layers);
}

writeFileSync(join(OUT, 'streak-flame.json'), JSON.stringify(streakFlame()));
writeFileSync(join(OUT, 'notif-bell.json'), JSON.stringify(notifBell()));
writeFileSync(join(OUT, 'receipt-scan.json'), JSON.stringify(receiptScan()));
writeFileSync(join(OUT, 'account-cards.json'), JSON.stringify(accountCards()));
console.log('wrote streak-flame, notif-bell, receipt-scan and account-cards to', OUT);
