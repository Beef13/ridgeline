import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SRGB } from '../core/colour.js';
import { heightAt } from './terrain.js';
import { feel } from '../player/tuning.js';
import { rndWorld } from '../core/rng.js';

/**
 * Four things to dodge, each demanding a different answer:
 *
 *   crate    — low and wide. A normal jump.
 *   fence    — tall. Needs a full-height jump, mistimed ones clip it.
 *   sign     — a signpost cantilevered over the path. Must duck; jumping kills you.
 *   raptor   — a flyer. Low one you jump, high one you duck; deeper into a run
 *              they climb and dive between the two, so the answer is only
 *              settled when you get there.
 *
 * The last is the one that makes the game readable rather than reflexive: the
 * player has to identify which answer applies, not just react.
 */
/**
 * Obstacle tint, live.
 *
 * Everything you have to dodge is warm and nothing else in the scene is: the
 * ridge and its dressing are green and grey, so separating the obstacles by
 * HUE is the only axis with room left. Brightness has none — the grade runs
 * about 2.9x, so anything light enough to stand out on luminance alone clips
 * to a flat glowing slab and loses its shape. Warm and mid-toned reads.
 *
 * How far to push it is a judgement call against whatever art is scattered on
 * the ridge that day, so it is a slider in the LOOK panel rather than a
 * constant here. Each material carries both ends and `tintObstacles` dials
 * between them — in LINEAR space, because that is where SRGB() lands and
 * mixing sRGB values directly would darken the midpoint.
 *
 * Two timbers, not one: at ~31 screen pixels per world unit a crate is about
 * 30px tall, and plank lines in the same tone as the body vanish in the
 * palette snap. The frame has to be a different value from what it frames.
 */
const TONE = {
  plank:  { cool: '#33200f', warm: '#5c2b0b', coolSpec: '#5a3a1e', warmSpec: '#8a4a18' },
  timber: { cool: '#57381b', warm: '#8a4a12', coolSpec: '#7d4f2c', warmSpec: '#b06a20' },
  /* The crate's cargo. Modelled green, shown warm: the ridge and its dressing
     are green, so green cargo reads as scenery rather than as something to
     dodge — and at a 2.9x grade a saturated green clips to a flat glowing slab
     and loses its shape entirely. Pitched a step lighter than the timber so the
     fruit still separates from the box holding it. */
  fruit:  { cool: '#6e3a12', warm: '#a85a10', coolSpec: '#b07a3a', warmSpec: '#e09a40' },

  /* The vulture's own palette. It breaks the warm-obstacle rule on purpose, and
     gets away with it for a reason worth writing down: the rule exists so that
     what you must dodge separates from a green-and-grey ridge, and a BLACK body
     separates further than a brown one ever did — it reads as a hole punched in
     the scenery. What the rule really protects is legibility, and the bright
     head, beak and feet carry that here. A bird brown all over was obeying the
     letter of it and losing the point.
     
     `bird` is the body, `birdL` the head — the names are kept so the tint
     slider and everything that already referred to them still work. */
  bird:   { cool: '#101010', warm: '#1e1206', coolSpec: '#3a3a36', warmSpec: '#55402a' },
  birdL:  { cool: '#8a4a12', warm: '#b8580c', coolSpec: '#d08a3a', warmSpec: '#f0a040' },
  beak:   { cool: '#8a6a10', warm: '#c89a14', coolSpec: '#e8d060', warmSpec: '#ffe878' },
  beakTip:{ cool: '#8a2a0c', warm: '#c4380e', coolSpec: '#e08050', warmSpec: '#ff9060' },
  /* The bare head and neck. A pink authored as pink comes out white: red clips
     long before the 2.9x grade is done with it, so the only thing that can
     still say "pink" afterwards is how much BLUE survives — enough to lift it
     off the yellow beak, not so much it goes lilac. These are authored high
     because the grade works in LINEAR light, not in the sRGB the hex is
     written in: #80 is a fifth of the way up, not half. Landed by measuring —
     red pins at 1.0, green ~0.70, blue ~0.63, which is a pale warm pink. */
  skin:   { cool: '#c88780', warm: '#d8837a', coolSpec: '#d89890', warmSpec: '#e8a094' }
};

const M = {
  plank:  new THREE.MeshPhongMaterial({ shininess: 8,  flatShading: true }),
  timber: new THREE.MeshPhongMaterial({ shininess: 14, flatShading: true }),
  bird:   new THREE.MeshPhongMaterial({ shininess: 30, flatShading: true }),
  birdL:  new THREE.MeshPhongMaterial({ shininess: 30, flatShading: true }),
  fruit:  new THREE.MeshPhongMaterial({ shininess: 24, flatShading: true }),
  beak:   new THREE.MeshPhongMaterial({ shininess: 40, flatShading: true }),
  beakTip:new THREE.MeshPhongMaterial({ shininess: 40, flatShading: true }),
  skin:   new THREE.MeshPhongMaterial({ shininess: 18, flatShading: true }),
  /* UNLIT, for the same reason the underwing is: an eye that dims when the bird
     banks away from the sun blinks out at exactly the moment the player is
     trying to read which way it is going. Black stays black whichever way the
     head turns. */
  pupil:  new THREE.MeshBasicMaterial({ color: 0x000000 }),
  /* UNLIT, and deliberately so.
     The underside of a wing faces away from the key light, so a white Phong
     surface down there renders as murky grey — which is how a "white" underwing
     ended up reading as a second, wrong shade of dark. A basic material ignores
     lighting entirely and stays the colour it was given whichever way the wing
     is pointing, which is the whole job: the stripe has to be BRIGHT at the
     moment the wing turns over, not merely pale in principle. */
  wingUnder: new THREE.MeshBasicMaterial({ color: SRGB('#efe9da') })
};

/** 0 keeps the authored browns, 1 pushes every obstacle to full orange. */
export function tintObstacles(warm) {
  const w = Math.max(0, Math.min(1, warm));
  for (const [k, t] of Object.entries(TONE)) {
    M[k].color.copy(SRGB(t.cool)).lerp(SRGB(t.warm), w);
    M[k].specular.copy(SRGB(t.coolSpec)).lerp(SRGB(t.warmSpec), w);
  }
}
tintObstacles(0.55);        // a starting point, not a decision — see the panel

/* The wing, feather by feather: width, THICKNESS, depth, and where it sits.
   Lengths fall and each one is swept further back, so the trailing edge steps
   rather than running straight.

   Exported because the thickness is the one number here that can be wrong in a
   way nobody sees coming. Each feather is split through it — dark top, white
   underside — and a half thinner than a screen pixel does not render dimmer, it
   renders intermittently. One screen pixel is 1/31 of a unit. */
/* How steeply the neck climbs from the shoulders to the head, in radians.
   Taken off a line drawn over a screenshot — about 21 degrees. The number
   matters more than it looks: a neck that climbs reads as a vulture craning
   forward, and the same neck level or drooping reads as a hunched pigeon. */
export const NECK_RISE = 0.36;

/* Where a wing hinges, in the bird's own space.
   It used to be the origin, which was fine until the body was shrunk and moved
   back to make room for the neck — the origin then sat at the body's FRONT
   edge, and the wings beat in front of the bird like a man swimming. A hinge
   belongs on the shoulder, so it is measured from the body rather than assumed
   to be at zero. */
export const WING_ROOT = [-0.13, 0.03, 0];

/* Where the neck hinges, in the bird's own space — the back end of the first
   neck segment, which is where it actually leaves the shoulders. Everything
   from here forward (neck, head, eye, brow, beak) hangs off this pivot so a
   stomped bird can throw its head back in one rotation. Same lesson as
   WING_ROOT: a pivot at the origin swings the head around the belly. */
export const NECK_PIVOT = [0.02, 0.07, 0];

/* How far back the neck is thrown when the bird is stomped, in radians.
   The head sits forward of the pivot, so a POSITIVE z rotation lifts it up and
   back — the arch of something recoiling, not a nod. Deliberately past
   vertical: at 29 pixels across, a subtle flinch is no flinch at all. */
export const STOMP_ARCH = 1.15;

export const WING_FEATHERS = [
  [0.34, 0.086, 0.21, -0.02, 0.000, 0.20],
  [0.27, 0.082, 0.17, -0.07, 0.005, 0.38],
  [0.19, 0.078, 0.13, -0.14, 0.010, 0.51]
];

/* The world stream. Everything here decides where the player can go, and the
   cosmetic details (a post's lean, a crate's spin) are drawn in lockstep with
   the obstacle that owns them, so they belong to the same sequence. */
const rnd = rndWorld;

/* Filled in by `useModel` once a .glb has loaded. Empty is the normal state
   for the first second of a session, and a permanent one if the file is
   missing — every kind still has its built-in shape to fall back on. */
const MODEL = Object.create(null);

/* How wide a signpost should end up. The model is normalised to a height of 1,
   so this is what sets its real size — chosen over matching its height because
   the horizontal footprint is what the spacing and the difficulty were tuned
   against. */
const SIGN_WIDTH = 1.5;

export function useModel(name, proto) {
  if (!proto) return;
  if (name === 'fence') {
    // one number: how wide the fence is per unit of height, straight off the art
    const a = proto.userData.aspect;
    proto.userData.fit = { wPerHeight: a && a.w > 1e-6 ? a.w : 0.36 };
  }
  if (name === 'sign') {
    /* Work out the real size and the resulting hitbox ONCE, here, rather than
       per spawn. `overhang` is the part the player ducks under, in units of the
       normalised height; scaled up it becomes the box. */
    const a = proto.userData.aspect, o = proto.userData.overhang;
    const scale = a && a.w > 1e-6 ? SIGN_WIDTH / a.w : 1;
    proto.userData.fit = o
      ? { w: SIGN_WIDTH, yOff: o.y0 * scale, h: (o.y1 - o.y0) * scale, scale }
      : { w: SIGN_WIDTH, yOff: 1.12, h: 1.35, scale };
    /* A sign you cannot duck is not a sign, it is a wall. Ducked height is
       0.82 and standing is 1.62, so the underside has to sit between them —
       worth failing loudly on, because a model that breaks this looks fine and
       plays as an unavoidable death. */
    const f = proto.userData.fit;
    if (f.yOff <= 0.9 || f.yOff >= 1.6) {
      console.warn('[models] sign underside at', f.yOff.toFixed(2),
        '— must be between 0.9 (ducked) and 1.6 (standing); using the built-in sign');
      return;
    }
  }
  MODEL[name] = proto;
}
export { M as OBSTACLE_MATERIALS };

/* The two altitudes a bird can occupy. The player stands 1.62 and ducks to
   0.82, so LOW cannot be ducked and has to be jumped, and HIGH cannot be
   jumped cleanly and has to be ducked. Everything between the two has at
   least one answer available, which is what makes a roaming bird a decision
   rather than a coin toss. */
const LOW = 0.70, HIGH = 1.72;

const ROAM_FROM = 320, ROAM_ALL_BY = 1400;

/** How likely a bird is to roam, given how far the player has come. */
export function roamChance(distance) {
  const t = (distance - ROAM_FROM) / (ROAM_ALL_BY - ROAM_FROM);
  return Math.max(0, Math.min(0.8, t));       // never all of them: variety reads better
}

/**
 * Where a flyer is right now — ONE function, used by both the mesh and the
 * hitbox. The old bob moved the art and left the box behind, so a bird could
 * kill you from a place it visibly was not. Anything that moves has to answer
 * this question once.
 */
function flyerYOff(it, t) {
  const b = it.box;
  if (!b.roam) return b.yOff + Math.sin(t * 2.2 + it.phase) * 0.12;
  const s = (Math.sin(t * b.rate + it.phase) + 1) / 2;
  return LOW + (HIGH - LOW) * s;
}

export const KINDS = {
  /* A timber crate. Every detail sits on the FRONT face — at this resolution
     the sides are two pixels of nothing, and detail spent there is detail the
     player never sees. The silhouette stays a clean rectangle, which is what
     makes it read instantly as "jump this" against a noisy ridge. */
  crate: {
    weight: 4,
    box: () => ({ w: 0.95 + rnd() * 0.4, h: 0.8 + rnd() * 0.25, yOff: 0 }),
    build(b) {
      /* The modelled crate if it has arrived, the built-in one if not.
         Checked per spawn rather than once at startup: the .glb lands a moment
         after the first frame, and a game that refuses to start until its art
         is ready is a worse trade than a few early crates in primitives. */
      if (MODEL.crate) {
        const g = MODEL.crate.clone();
        /* The prototype is a unit crate — centred on x and z, sitting on y=0,
           exactly 1 tall — so this IS the collision box, not an approximation
           of it. Depth follows height, so a wide spawn does not also get deep. */
        g.scale.set(b.w, b.h, b.h);
        return g;
      }
      const g = new THREE.Group();
      const d = 0.78;                       // deep enough to catch the key light
      const t = 0.1;                        // batten thickness: ~3px, the floor
      const face = d / 2 + 0.03;            // battens ride just proud of the body

      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, d), M.plank);
      body.position.y = b.h / 2;
      g.add(body);

      const batten = (w, h, x, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), M.timber);
        m.position.set(x, y, face);
        return m;
      };
      g.add(batten(t, b.h, -b.w / 2 + t / 2, b.h / 2));
      g.add(batten(t, b.h,  b.w / 2 - t / 2, b.h / 2));
      g.add(batten(b.w, t, 0, t / 2));
      g.add(batten(b.w, t, 0, b.h - t / 2));

      // one diagonal brace — the single mark that says crate rather than box
      const diag = new THREE.Mesh(
        new THREE.BoxGeometry(Math.hypot(b.w, b.h) * 0.94, t * 0.85, 0.04), M.timber);
      diag.position.set(0, b.h / 2, face - 0.01);
      diag.rotation.z = Math.atan2(b.h, b.w) * (rnd() > 0.5 ? 1 : -1);
      g.add(diag);
      return g;
    }
  },
  /* A length of timber fence. Tall and narrow, same as the spire it replaces —
     the read is "too tall to clear casually", and the rails give the eye a
     height to judge against, which the smooth spire never did. */
  fence: {
    weight: 2,
    /* Height is the only thing that varies, so unlike the crate this one is
       scaled UNIFORMLY and the box width follows the art. Nothing is lost by
       it: with one free axis there is no reason to squash the posts, and the
       hitbox stays exactly the shape of the thing you can see. */
    box: () => {
      const h = 1.55 + rnd() * 0.35;
      const m = MODEL.fence;
      if (m && m.userData.fit) return { w: m.userData.fit.wPerHeight * h, h, yOff: 0 };
      return { w: 0.62, h, yOff: 0 };
    },
    build(b) {
      if (MODEL.fence) {
        const g = MODEL.fence.clone();
        g.scale.setScalar(b.h);     // the model is 1 tall, so this IS its height
        return g;
      }
      const g = new THREE.Group();
      const postW = 0.15, d = 0.16;
      const px = b.w / 2 - postW / 2;

      /* The pointed caps are built INSIDE the stated height, not stacked on
         top of it. A silhouette that rises above its own hitbox is the worst
         kind of unfair-in-reverse: you clip the tip, survive, and learn that
         the picture is lying to you. */
      const capH = 0.18, shaft = b.h - capH;
      for (const x of [-px, px]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, shaft, d), M.timber);
        post.position.set(x, shaft / 2, 0);
        post.rotation.z = (rnd() - 0.5) * 0.05;    // never quite plumb
        g.add(post);
        // left unrotated: a 4-sided cone turned 45° puts its base corners on the
        // x axis and pushes the post's footprint out by a factor of root two
        const cap = new THREE.Mesh(new THREE.ConeGeometry(postW * 0.6, capH, 4), M.timber);
        cap.position.set(x, shaft + capH / 2, 0);
        g.add(cap);
      }

      /* Three rails is the most that survives the palette snap on a 1.6-unit
         post — a fourth turns the gaps into single pixels and the whole panel
         fills in solid. */
      for (let i = 0; i < 3; i++) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.04, 0.13, 0.09), M.plank);
        rail.position.set(0, b.h * (0.22 + i * 0.3), 0.05);
        rail.rotation.z = (rnd() - 0.5) * 0.04;
        g.add(rail);
      }
      return g;
    }
  },
  /* A trail signpost, cantilevered over the path — clear air beneath, so you
     duck it. Collision covers the BOARDS only; the mast is not in the hitbox,
     which is why it stands back in z rather than on the running line. The arch
     this replaces put its post right where the runner passes and let them walk
     through it, and that is the sort of thing a player notices once and then
     stops trusting the art. */
  sign: {
    weight: 2,
    /* With a model loaded the hitbox is READ OFF THE ART rather than authored
       here, because the two must be the same shape and only one of them can be
       the source of truth. The modelled boards hang lower and shallower than
       these numbers assumed, and keeping the authored box would have killed the
       player in 30cm of clear air below the sign — exactly the thing the
       comment above says a player notices once and then stops trusting.

       The authored numbers stay as the fallback, for the seconds before the
       file lands and for good if it never does. */
    box: () => {
      const m = MODEL.sign;
      if (m && m.userData.fit) return { ...m.userData.fit };
      return { w: 1.5, h: 1.35, yOff: 1.12 };
    },
    build(b) {
      if (MODEL.sign) {
        const g = MODEL.sign.clone();
        // one uniform factor: a signpost is a fixed shape, and stretching the
        // board to a box would take the mast with it
        g.scale.setScalar(MODEL.sign.userData.fit.scale);
        return g;
      }
      const g = new THREE.Group();
      const right = b.w / 2 - 0.09;         // where the mast stands
      const boardZ = 0.05, mastZ = -0.42;

      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.16, b.yOff + b.h - 0.06, 0.16), M.timber);
      mast.position.set(right, (b.yOff + b.h - 0.06) / 2, mastZ);
      g.add(mast);

      /* A board plus a batten along each long edge. One flat slab of plank at
         14 screen pixels is a brown smear; the value step at top and bottom is
         the whole reason it reads as a sign at all. */
      const board = (w, h, y) => {
        const p = new THREE.Group();
        const face = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), M.plank);
        p.add(face);
        for (const s of [-1, 1]) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.09), M.timber);
          edge.position.set(0, s * (h / 2 - 0.03), 0);
          p.add(edge);
        }
        p.position.set(right + 0.08 - w / 2, y, boardZ);
        return p;
      };

      const bigW = b.w * 0.8, bigH = 0.44, bigY = b.yOff + b.h * 0.66;
      const big = board(bigW, bigH, bigY);
      // a pointed end, so it reads as pointing somewhere rather than just hanging
      const tip = new THREE.Mesh(new THREE.BoxGeometry(bigH * 0.7, bigH * 0.7, 0.07), M.plank);
      tip.position.set(-bigW / 2, 0, 0);
      tip.rotation.z = Math.PI / 4;
      big.add(tip);
      g.add(big);

      g.add(board(b.w * 0.62, 0.3, b.yOff + b.h * 0.24));

      // brackets back to the mast, so the boards are not floating in mid air
      for (const y of [bigY, b.yOff + b.h * 0.24]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, boardZ - mastZ), M.timber);
        arm.position.set(right, y, (boardZ + mastZ) / 2);
        g.add(arm);
      }
      return g;
    }
  },
  raptor: {
    weight: 2,
    flying: true,
    box: (distance = 0) => {
      /* Early on a bird holds one altitude and the answer is fixed the moment
         you see it. Later they climb and dive between the two, so the answer is
         only settled when you get there — the same obstacle asking a harder
         question rather than a new obstacle to learn. */
      if (rnd() < roamChance(distance)) {
        return {
          w: 0.95, h: 0.62, yOff: LOW, roam: true,
          /* Slow enough to read. The player commits about half a second out, and
             a sine spends most of its time near the ends, so the common case is
             a bird that is clearly high or clearly low with a visible drift —
             not a coin toss. */
          rate: (2 * Math.PI) / (2.0 + rnd() * 0.8)
        };
      }
      const high = rnd() > 0.5;                 // high: duck. low: jump.
      return { w: 0.95, h: 0.62, yOff: high ? HIGH : LOW, high };
    },
    build(b) {
      /* A vulture, at 29 pixels across.
       *
       * The old bird was a stretched sphere with a smaller sphere for a head,
       * and it read as a blob — which is fatal for the one obstacle whose whole
       * job is to be IDENTIFIED before it is reacted to. Everything here is
       * bought with silhouette: a hooked beak, hunched shoulders, a ragged
       * trailing edge and dangling talons. Nothing under about 0.09 units
       * survives the palette snap, so there is no interior detail at all —
       * every shape below either breaks the outline or is not there.
       *
       * Dark body, light head. Vultures read that way, and it also keeps the
       * brightest part of the bird up at the end the player has to judge. */
      const g = new THREE.Group();

      const add = (mesh, x, y, z, rz = 0) => {
        mesh.position.set(x, y, z);
        if (rz) mesh.rotation.z = rz;
        g.add(mesh);
        return mesh;
      };
      /* Everything from the shoulders forward hangs off its own pivot, so the
         whole head-and-neck assembly can be thrown back in one rotation when
         the bird is stomped. The pivot sits where the neck LEAVES the
         shoulders — put it at the origin instead and the head swings round the
         belly, which reads as the head detaching rather than the neck arching.
         Parts are authored in the bird's own coordinates as before and shifted
         into the pivot's space here, so the numbers above stay comparable. */
      const neck = new THREE.Group();
      neck.position.set(NECK_PIVOT[0], NECK_PIVOT[1], NECK_PIVOT[2]);
      g.add(neck);
      g.userData.neck = neck;
      const addNeck = (mesh, x, y, z, rz = 0) => {
        mesh.position.set(x - NECK_PIVOT[0], y - NECK_PIVOT[1], z - NECK_PIVOT[2]);
        if (rz) mesh.rotation.z = rz;
        neck.add(mesh);
        return mesh;
      };
      const ball = (r, mat, sx, sy, sz) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
        m.scale.set(sx, sy, sz);
        return m;
      };
      const slab = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

      /* Body and shoulders are both a size down from where they started, and
         sit further back. There is no room in a 0.95-wide box to ADD a neck —
         the bird already filled 0.91 of it — so the neck is reclaimed from the
         mass behind it rather than bolted on the front. */
      add(ball(0.20, M.bird, 1.18, 0.96, 0.95), -0.16, -0.05, 0);
      // the hunch, pulled back to leave daylight between it and the head, and
      // dropped so the neck has somewhere to climb FROM
      add(ball(0.12, M.bird, 1.1, 0.95, 1.1), -0.06, 0.075, 0);
      /* The neck.
         The old bird's shoulders and head overlapped, so they merged into one
         lump and it read as a gull — a vulture is a small head held out on a
         bare neck, and without the gap between the two there is nothing to
         recognise. Two tapering segments angling up and forward, because a
         single straight tube reads as a stick. */
      /* NECK_RISE is the angle the whole assembly climbs at, and the segments
         are rotated to match it rather than against it. The first version had
         them tilted the other way — nose-down while the centres crept up — and
         the two cancelled into the hunched, shrugging look of a bird bracing
         for impact. A vulture's neck leaves the shoulders and goes UP. */
      // the same yellow as the feet — a bare neck and bare legs are the same
      // skin on a real vulture, and matching them ties the two ends together
      addNeck(slab(0.135, 0.105, 0.105, M.skin), 0.090, 0.104, 0, NECK_RISE + 0.04);
      addNeck(slab(0.125, 0.095, 0.095, M.skin), 0.165, 0.132, 0, NECK_RISE - 0.04);
      // tail, tipped up and cut square — a ragged back end reads at distance
      // where a tapered one turns to mush
      add(slab(0.23, 0.12, 0.17, M.bird), -0.33, 0.02, 0, 0.30);

      // a smaller head, held further forward: the proportions of a vulture are
      // a big beak and a small skull, which is lucky, because the beak is what
      // survives at this size
      addNeck(ball(0.115, M.skin, 1.1, 1.05, 1.0), 0.245, 0.162, 0);
      /* A bare black dot on the yellow head, set proud of it so it survives
         being seen edge-on. No white around it: on a head this size the white
         was most of the eye and the dot was a speck inside it, which read as a
         pale patch rather than as an eye. Yellow does the work the white was
         doing, and the dot gets to be the whole of it.
         
         It still has to clear a screen pixel. Anything smaller is not a small
         eye, it is an intermittent one — present or absent depending on where
         the sampling grid falls that frame. */
      for (const sd of [1, -1]) addNeck(ball(0.023, M.pupil, 1, 1, 0.9), 0.280, 0.186, sd * 0.106);
      /* Brow. Two pixels of it, and worth every one: an angled bar over the eye
         is the difference between a bird and an angry bird, and the top edge of
         the head is part of the outline. */
      addNeck(slab(0.15, 0.065, 0.13, M.birdL), 0.255, 0.246, 0, -0.32);
      /* The beak stops short of the hitbox edge on purpose. Art that reaches
         outside the box kills from somewhere it visibly is not, and a beak is
         exactly the part a player judges the gap by. */
      // the beak, in two parts — a straight upper and a hook. One tapered cone
      // would vanish; the step between the two is what the eye catches.
      addNeck(slab(0.21, 0.095, 0.105, M.beak), 0.345, 0.132, 0, 0.10);
      addNeck(slab(0.08, 0.13, 0.095, M.beakTip), 0.418, 0.052, 0, 0.16);

      // talons, trailing under the body: the lowest thing on the bird and the
      // first thing a player sees when it passes overhead
      for (const s of [1, -1]) add(slab(0.06, 0.11, 0.055, M.beak), 0.04, -0.21, s * 0.07);

      /* Wings pivot on x, so they rise and fall while reaching out in z —
         edge-on at rest, broad at the top of the beat. Three feathers of
         falling length, each swept further back, so the trailing edge is
         stepped rather than straight. */
      const wing = (s) => {
        const p = new THREE.Group();
        p.position.set(WING_ROOT[0], WING_ROOT[1], WING_ROOT[2]);
        /* Three feathers, but only TWO meshes — one for the dark tops merged
           together and one for the pale undersides.
           
           Painting the underside as the box's own -y face is the tidy-looking
           answer and the expensive one: a material ARRAY makes three.js honour
           BoxGeometry's six per-face groups and issue a draw call for each, so
           six feathers would cost 36 calls instead of six. Merging by colour
           instead costs four for the whole pair of wings — fewer than the
           single-colour version this replaced. */
        /* The wing is split through its THICKNESS: dark top half, white bottom
           half, nothing hanging below.
           
           The first attempt hung a thin pale strip under each feather and it
           shimmered — at 0.012 units it was about a THIRD of a screen pixel, so
           whether it existed at all came down to where the sampling grid
           happened to fall that frame. Anything thinner than a pixel does not
           get dimmer, it gets intermittent. Halving a feather that is thick
           enough to survive gives a white underside with no sub-pixel geometry
           anywhere in it. */
        /* Dark on top, white underneath, and nothing in between.
           
           An earlier version inset a bright stripe along each feather and left
           the body's dark either side of it. On paper that is a vulture's
           underwing; on a 10-pixel wing it is a white patch cut through by dark
           lines, which reads as damage rather than as plumage. At this size the
           underside gets ONE colour or it gets noise. */
        const dark = [], pale = [];
        for (const [w, h, d, x, y, z] of WING_FEATHERS) {
          const half = h / 2;
          const top = new THREE.BoxGeometry(w, half, d);
          top.translate(x, y + half / 2, s * z);
          dark.push(top);
          const under = new THREE.BoxGeometry(w, half, d);
          under.translate(x, y - half / 2, s * z);
          pale.push(under);
        }
        p.add(new THREE.Mesh(mergeGeometries(dark), M.bird));
        p.add(new THREE.Mesh(mergeGeometries(pale), M.wingUnder));
        return p;
      };
      const wl = wing(1), wr = wing(-1);
      g.add(wl, wr);
      g.userData.wings = [wl, wr];
      g.position.y = b.yOff + b.h / 2;
      /* Turned to face back down the ridge — the runner comes from -x, so a
         bird built nose-forward is showing them its tail. The flap is
         symmetric, so mirroring costs nothing. */
      g.rotation.y = Math.PI;
      return g;
    }
  }
};

const TABLE = Object.entries(KINDS).flatMap(([k, v]) => Array(v.weight).fill(k));

export class ObstacleField {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.nextX = 26;          // first obstacle is far enough to read the scene
    this.lastKind = null;
    this.time = 0;            // the field's own clock, so flight is not tied to frame rate
    this.nextId = 1;          // stable handle for "that one", since items shuffle
  }

  reset() {
    for (const it of this.items) this.root.remove(it.group);
    this.items.length = 0;
    this.nextX = 26;
    this.lastKind = null;
    this.time = 0;
  }

  /** Difficulty is spacing, not speed — speed ramps on its own. */
  gapFor(speed, distance) {
    const f = feel;
    const t = Math.min(1, distance / f.difficultyAt);
    const reaction = f.reactionTime * (1.0 - 0.35 * t);
    const base = speed * reaction;
    const slack = (2.4 - 1.6 * t) * (0.6 + rnd() * 0.9);
    return base + slack;
  }

  pickKind() {
    let k = TABLE[Math.floor(rnd() * TABLE.length)];
    // Never two ducks back to back — the player would still be standing up.
    if (k === this.lastKind && (k === 'sign' || k === 'fence')) {
      k = 'crate';
    }
    this.lastKind = k;
    return k;
  }

  update(player, running, dt = 0) {
    this.time += dt;
    if (running) {
      while (this.nextX < player.x + feel.spawnAhead) {
        const name = this.pickKind();
        const kind = KINDS[name];
        const b = kind.box(player.distance);
        const g = kind.build(b);
        const gy = heightAt(this.nextX);
        g.position.set(this.nextX, gy, 0);
        this.root.add(g);
        const it = { name, kind, box: b, group: g, x: this.nextX, gy,
                     phase: rnd() * 6.28, yOff: b.yOff, id: this.nextId++,
                     stomped: -1 };
        this.items.push(it);
        this.nextX += this.gapFor(player.speed, player.distance) + b.w;
      }
    }

    /* Altitude is settled HERE, before collision reads it — not in animate(),
       which runs after. A flyer resolved on the render side would be judged
       against where it was a frame ago. */
    for (const it of this.items) {
      if (!it.kind.flying) continue;
      /* A stomped bird stops flying and starts FALLING. It keeps its yOff — the
         same number the art reads — so nothing needs a second position to go
         stale against, and it simply drops out of the bottom of the frame. */
      if (it.stomped >= 0) {
        it.stomped += dt;
        it.fallV += feel.fallGravity * dt;
        it.yOff += it.fallV * dt;
      } else {
        it.yOff = flyerYOff(it, this.time);
      }
    }
    // Cull well behind, so nothing pops out while still on screen.
    for (let i = this.items.length - 1; i >= 0; i--) {
      const fallen = this.items[i].stomped >= 0 && this.items[i].gy + this.items[i].yOff < -14;
      if (this.items[i].x < player.x - 30 || fallen) {
        this.root.remove(this.items[i].group);
        this.items.splice(i, 1);
      }
    }
  }

  /**
   * Land on a bird and it is finished: it stops being a hazard on the same
   * frame, arches its neck back, and falls.
   *
   * Returns false if that one is already falling. The caller needs to know,
   * because a player straddling two overlapping boxes must not get two bounces
   * out of one landing.
   */
  stomp(id) {
    const it = this.items.find((i) => i.id === id);
    if (!it || !it.kind.flying || it.stomped >= 0) return false;
    it.stomped = 0;
    /* A small upward kick before gravity takes it, so the bird is knocked off
       its line rather than simply switched off. Under fallGravity it is back
       past its starting height in under a fifth of a second. */
    it.fallV = 2.4;
    it.spin = (rnd() < 0.5 ? -1 : 1) * (1.8 + rnd() * 1.2);
    return true;
  }

  animate(t) {
    for (const it of this.items) {
      if (!it.kind.flying) continue;
      if (it.stomped >= 0) {
        /* Anguish, in the only two channels that read at 29 pixels across:
           the neck thrown back, and the whole bird tumbling. The arch snaps on
           fast — it is the moment of impact, not a slump — while the tumble
           builds, so the first thing the eye catches is the head going back. */
        const arch = Math.min(1, it.stomped / 0.09);
        const neck = it.group.userData.neck;
        if (neck) neck.rotation.z = STOMP_ARCH * arch;
        // wings stop beating and fall open: nothing is flying this thing now
        const [dl, dr] = it.group.userData.wings;
        const droop = -0.9 * arch;
        dl.rotation.x = droop; dr.rotation.x = -droop;
        /* Driven from the bird's own elapsed time rather than accumulated per
           frame, so the tumble looks the same at 60fps and at 144 — and so a
           test can ask where it will be at t without simulating every frame. */
        it.group.rotation.z = it.spin * Math.max(0, it.stomped - 0.06);
        it.group.position.y = it.gy + it.yOff + it.box.h / 2;
        continue;
      }
      /* Beat DEEPER on the climb, never faster.
         The rate used to ride on the climb too (11 +- 5 rad/s), which read as
         two different birds: a roaming one looked panicked next to a hovering
         one holding a steady beat. Worse, a frequency that changes over time
         drags the phase with it, so the wings also jumped position whenever
         the climb turned over. Amplitude alone still says "going up" and
         leaves every vulture on the same clock. */
      const climb = it.box.roam ? Math.cos(this.time * it.box.rate + it.phase) : 0;
      const flap = Math.sin(t * 11 + it.phase);
      const [wl, wr] = it.group.userData.wings;
      wl.rotation.x = flap * (0.7 + climb * 0.25);
      wr.rotation.x = -flap * (0.7 + climb * 0.25);
      // the same yOff collision used this step — one number, two consumers
      it.group.position.y = it.gy + it.yOff + it.box.h / 2;
    }
  }

  /** World-space AABBs for collision. */
  boxes() {
    /* A stomped bird is scenery. It is still on screen, still falling through
       the lane the player is running down, and it must not be able to kill
       them on the way out. */
    return this.items.filter((it) => !(it.stomped >= 0)).map((it) => ({
      x0: it.x - it.box.w / 2, x1: it.x + it.box.w / 2,
      y0: it.gy + it.yOff, y1: it.gy + it.yOff + it.box.h,
      name: it.name, id: it.id, flying: !!it.kind.flying
    }));
  }
}
