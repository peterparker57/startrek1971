// Mike Mayfield's STAR TREK (STTR1) - JavaScript port from the
// authentic HP BASIC listing (REV B, 10/73). Original by Mike Mayfield,
// Centerline Engineering, 20 Oct 1972. Verbatim text strings preserved
// from BASIC source where the player will see them (typos and all).

import { INSTRUCTIONS } from './instructions.js';
import { savePref } from './prefs.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Course direction vectors C[c][0]=dRow, C[c][1]=dCol for course c (1..9).
// Course 1 points right (+col), 3 points up (-row), 5 points left (-col),
// 7 points down (+row). 9 wraps to 1 for interpolation purposes.
//   4   3   2
//    \ ^ /
//   5 ----- 1
//    / v \
//   6   7   8
const C = [
  [ 0,  0],   // 0 (unused; BASIC C[1..9])
  [ 0,  1],   // 1
  [-1,  1],   // 2
  [-1,  0],   // 3
  [-1, -1],   // 4
  [ 0, -1],   // 5
  [ 1, -1],   // 6
  [ 1,  0],   // 7
  [ 1,  1],   // 8
  [ 0,  1],   // 9 (wraps to 1)
];

const DEVICE_NAMES = [
  null,                  // 0 unused
  'WARP ENGINES',        // 1
  'S.R. SENSORS',        // 2
  'L.R. SENSORS',        // 3
  'PHASER CNTRL',        // 4
  'PHOTON TUBES',        // 5
  'DAMAGE CNTRL',        // 6
  'SHIELD CNTRL',        // 7
  'COMPUTER',            // 8
];

// Glyphs placed in the 8x8 sector grid
const G_EMPTY    = '   ';
const G_SHIP     = '<*>';
const G_KLINGON  = '+++';
const G_STARBASE = '>!<';
const G_STAR     = ' * ';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rnd = () => Math.random();
const rnd1to8 = () => Math.floor(rnd() * 8) + 1;
const intHalf = (x) => Math.floor(x + 0.5);

function fmtNumD(n, width) {
  return String(Math.trunc(n)).padStart(width, ' ');
}

function makeQuadrant() {
  // 1-indexed [1..8][1..8]
  const q = Array.from({ length: 9 }, () => new Array(9).fill(G_EMPTY));
  return q;
}

function findEmpty(quad) {
  while (true) {
    const r = rnd1to8();
    const c = rnd1to8();
    if (quad[r][c] === G_EMPTY) return [r, c];
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function newGame() {
  // Galaxy: G[r][c] = klingons*100 + starbases*10 + stars (1..8)
  // Z[r][c] = scanned/known galaxy (zeros until LRS reveals)
  const G = Array.from({ length: 9 }, () => new Array(9).fill(0));
  const Z = Array.from({ length: 9 }, () => new Array(9).fill(0));

  let totalKlingons, totalStarbases;
  do {
    totalKlingons = 0;
    totalStarbases = 0;
    for (let i = 1; i <= 8; i++) {
      for (let j = 1; j <= 8; j++) {
        const r1 = rnd();
        let k3;
        if (r1 > 0.98)      { k3 = 3; totalKlingons += 3; }
        else if (r1 > 0.95) { k3 = 2; totalKlingons += 2; }
        else if (r1 > 0.80) { k3 = 1; totalKlingons += 1; }
        else                { k3 = 0; }
        const b3 = rnd() > 0.96 ? 1 : 0;
        if (b3) totalStarbases += 1;
        const s3 = rnd1to8();
        G[i][j] = k3 * 100 + b3 * 10 + s3;
        Z[i][j] = 0;
      }
    }
  } while (totalStarbases <= 0 || totalKlingons <= 0);

  return {
    // Stardate / mission timer
    T0: Math.floor(rnd() * 20 + 20) * 100,   // initial stardate
    T:  null,                                // current stardate (set below)
    T9: 30,                                  // mission length

    // Ship resources
    E0: 3000,                                // baseline energy
    E:  3000,
    P0: 10,
    P:  10,
    S:  0,                                   // shields
    S9: 200,                                 // initial klingon energy
    D:  [0, 0, 0, 0, 0, 0, 0, 0, 0],         // device damage 1..8

    // Position (1..8)
    Q1: rnd1to8(), Q2: rnd1to8(),            // current quadrant
    S1: rnd1to8(), S2: rnd1to8(),            // current sector

    // Galaxy
    G, Z,

    // Quadrant inhabitants (set per-quadrant via enterQuadrant)
    K3: 0, B3: 0, S3: 0,                     // counts in current quadrant
    K: [[0,0,0],[0,0,0],[0,0,0],[0,0,0]],    // klingons[1..3]: [row,col,energy]
    quadrant: makeQuadrant(),

    // Totals
    K9: totalKlingons,                       // klingons left
    K7: totalKlingons,                       // initial klingons (for scoring)
    B9: totalStarbases,                      // starbases left

    // Status
    condition: 'GREEN',
    docked: false,

    // Game flow
    over: false,
  };
}

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------

export class Game {
  constructor(tt) {
    this.tt = tt;
    this.s = null;
  }

  async print(line) { await this.tt.print(line); }
  async println(line = '') { await this.tt.println(line); }
  async ask(prompt) { return this.tt.ask(prompt); }

  // Inline-help wrappers: typing '?' at any prompt invokes helpFn() then re-prompts.
  async askWith(prompt, helpFn) {
    while (true) {
      const raw = (await this.ask(prompt)).trim();
      if (raw === '?' && helpFn) { await helpFn(); continue; }
      return raw;
    }
  }
  async askNumberWith(prompt, helpFn) {
    while (true) {
      const raw = (await this.ask(prompt)).trim();
      if (raw === '?' && helpFn) { await helpFn(); continue; }
      if (raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  async askNumber(prompt) { return this.askNumberWith(prompt, null); }

  async run() {
    const s = this.s = newGame();
    s.T = s.T0;
    await this.println();
    await this.println(`YOU MUST DESTROY ${s.K9} KLINGONS IN`);
    await this.println(`${s.T9} STARDATES WITH ${s.B9} STARBASES`);
    await this.enterQuadrant();
    while (!s.over) {
      await this.commandLoop();
    }
  }

  // ---- Quadrant entry (BASIC line 810) ------------------------------------

  async enterQuadrant() {
    const s = this.s;
    s.K3 = 0; s.B3 = 0; s.S3 = 0;
    if (s.Q1 < 1 || s.Q1 > 8 || s.Q2 < 1 || s.Q2 > 8) {
      // out of bounds; recover (BASIC line 920)
      s.quadrant = makeQuadrant();
      this.placeShip();
      return this.shortRangeScan();
    }
    const cell = s.G[s.Q1][s.Q2];
    s.K3 = Math.floor(cell / 100);
    s.B3 = Math.floor((cell - s.K3 * 100) / 10);
    s.S3 = cell - s.K3 * 100 - s.B3 * 10;

    if (s.K3 > 0 && s.S <= 200) {
      await this.println();
      await this.println('COMBAT AREA      CONDITION RED');
      await this.println('   SHIELDS DANGEROUSLY LOW');
    }

    // Reset klingon table (energies)
    for (let i = 1; i <= 3; i++) s.K[i] = [0, 0, 0];

    // Build the quadrant grid
    s.quadrant = makeQuadrant();

    // Place enterprise
    s.quadrant[s.S1][s.S2] = G_SHIP;

    // Place klingons
    for (let i = 1; i <= s.K3; i++) {
      const [r, c] = findEmpty(s.quadrant);
      s.quadrant[r][c] = G_KLINGON;
      s.K[i] = [r, c, s.S9];
    }

    // Place starbases
    for (let i = 1; i <= s.B3; i++) {
      const [r, c] = findEmpty(s.quadrant);
      s.quadrant[r][c] = G_STARBASE;
    }

    // Place stars
    for (let i = 1; i <= s.S3; i++) {
      const [r, c] = findEmpty(s.quadrant);
      s.quadrant[r][c] = G_STAR;
    }

    await this.shortRangeScan();
  }

  placeShip() {
    this.s.quadrant[this.s.S1][this.s.S2] = G_SHIP;
  }

  // ---- Short range scan / dock check / status (BASIC line 4120) -----------

  async shortRangeScan() {
    const s = this.s;
    // Dock check: starbase adjacent (incl. diagonal) to ship
    let docked = false;
    for (let i = s.S1 - 1; i <= s.S1 + 1 && !docked; i++) {
      for (let j = s.S2 - 1; j <= s.S2 + 1 && !docked; j++) {
        if (i < 1 || i > 8 || j < 1 || j > 8) continue;
        if (s.quadrant[i][j] === G_STARBASE) docked = true;
      }
    }

    if (docked) {
      s.docked = true;
      s.condition = 'DOCKED';
      s.E = s.E0;
      s.P = s.P0;
      await this.println('SHIELDS DROPPED FOR DOCKING PURPOSES');
      s.S = 0;
    } else {
      s.docked = false;
      if (s.K3 > 0)              s.condition = 'RED';
      else if (s.E < s.E0 * 0.1) s.condition = 'YELLOW';
      else                       s.condition = 'GREEN';
    }

    if (s.D[2] < 0) {
      await this.println();
      await this.println('*** SHORT RANGE SENSORS ARE OUT ***');
      await this.println();
      return;
    }

    const border = '-=-'.repeat(8);
    const gridRows = [];
    for (let r = 1; r <= 8; r++) {
      let line = '';
      for (let c = 1; c <= 8; c++) line += s.quadrant[r][c];
      gridRows.push(line);
    }

    // Status fields align with grid rows 2-8 (row 1 of the grid stands alone).
    const fmt = (label, val) => label.padEnd(10) + val;
    const statusByRow = [
      null,                                                   // grid row 1
      fmt('STARDATE',  String(s.T)),                          // row 2
      fmt('CONDITION', s.condition),                          // row 3
      fmt('QUADRANT',  `${s.Q1},${s.Q2}`),                    // row 4
      fmt('SECTOR',    `${s.S1},${s.S2}`),                    // row 5
      fmt('ENERGY',    String(s.E)),                          // row 6
      fmt('SHIELDS',   String(s.S)),                          // row 7
      `PHOTON TORPEDOES ${s.P}`,                              // row 8
    ];

    const STATUS_GAP = '   ';
    const lines = [border];
    for (let i = 0; i < 8; i++) {
      let line = gridRows[i];
      if (statusByRow[i]) line += STATUS_GAP + statusByRow[i];
      lines.push(line);
    }
    lines.push(border);

    const block = document.createElement('pre');
    block.className = 'srs-frame';
    this.tt.appendBlock(block);
    await this.tt.typeInto(block, lines.join('\n'));
  }

  // ---- Main command loop (BASIC line 1270) --------------------------------

  async commandLoop() {
    const raw = (await this.ask('COMMAND? ')).trim();
    const upper = raw.toUpperCase();
    if (upper === 'D') return this.cmdSetDelay();
    if (upper === 'S') return this.cmdSetSound();
    if (upper === 'I') return this.cmdInstructions();
    if (raw === '' || raw === '?' || !/^-?\d+(\.\d+)?$/.test(raw)) {
      return this.printCommandHelp();
    }
    const a = Number(raw);
    switch (a) {
      case 0: return this.cmdWarp();
      case 1: return this.shortRangeScan();
      case 2: return this.cmdLongRange();
      case 3: return this.cmdPhasers();
      case 4: return this.cmdTorpedoes();
      case 5: return this.cmdShields();
      case 6: return this.cmdDamage();
      case 7: return this.cmdComputer();
      default: return this.printCommandHelp();
    }
  }

  async printCommandHelp() {
    await this.println();
    await this.println('   0 = SET COURSE');
    await this.println('   1 = SHORT RANGE SENSOR SCAN');
    await this.println('   2 = LONG RANGE SENSOR SCAN');
    await this.println('   3 = FIRE PHASERS');
    await this.println('   4 = FIRE PHOTON TORPEDOES');
    await this.println('   5 = SHIELD CONTROL');
    await this.println('   6 = DAMAGE CONTROL REPORT');
    await this.println('   7 = CALL ON LIBRARY COMPUTER');
    await this.println('   D = SET CHARACTER DELAY (TELETYPE SPEED)');
    await this.println('   S = SET SOUND (CLACK/TEXT/OFF)');
    await this.println('   I = SHOW GAME INSTRUCTIONS');
    await this.println();
  }

  async cmdInstructions() {
    for (const line of INSTRUCTIONS) await this.println(line);
  }

  async cmdSetSound() {
    const sound = this.tt.sound;
    const labels = ['OFF', 'TELETYPE', 'MOVIE TEXT', 'TELETYPE LINE (FSK)'];
    const current = sound ? labels[sound.mode] || 'OFF' : 'OFF';
    await this.println(`SOUND (CURRENT=${current}, ENTER=KEEP):`);
    await this.println('  0=NONE  1=TELETYPE');
    await this.println('  2=MOVIE TEXT  3=TELETYPE LINE FSK');
    const raw = await this.askWith(
      'SOUND? ',
      () => this.helpSound(),
    );
    if (raw === '') return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 3) {
      await this.println('INVALID SOUND MODE');
      return;
    }
    if (sound) {
      sound.setMode(n);
      sound.preview();
    }
    savePref('soundMode', n);
    await this.println(`SOUND SET TO ${labels[n]}`);
  }

  async cmdSetDelay() {
    const current = this.tt.charDelayMs;
    await this.println(`CHARACTER DELAY (MS), CURRENT=${current}`);
    await this.println('(ENTER=KEEP, 0=INSTANT)');
    const raw = await this.askWith(
      'DELAY? ',
      () => this.helpDelay(),
    );
    if (raw === '') return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      await this.println('INVALID DELAY');
      return;
    }
    this.tt.setDelayMs(n);
    savePref('charDelayMs', n);
    await this.println(`CHARACTER DELAY SET TO ${n} MS`);
  }

  // ---- Command 0: warp engines (BASIC 1410) -------------------------------

  async cmdWarp() {
    const s = this.s;
    let c1, w1;
    while (true) {
      c1 = await this.askNumberWith('COURSE (1-9)? ', () => this.helpCourse());
      if (c1 === 0) return;
      if (c1 < 1 || c1 >= 9) continue;
      w1 = await this.askNumberWith('WARP FACTOR (0-8)? ', () => this.helpWarpFactor());
      if (w1 < 0 || w1 > 8) continue;
      if (s.D[1] < 0 && w1 > 0.2) {
        await this.println('WARP ENGINES DAMAGED, MAX SPEED .2');
        continue;
      }
      break;
    }

    // Klingon attack while ship is committing to warp (BASIC 1510-1600)
    if (s.K3 > 0) {
      await this.klingonAttack();
      if (s.over) return;
    }
    if (s.K3 <= 0 && s.E <= 0) {
      if (s.S < 1) return this.gameOverDeadInSpace();
      await this.println(`YOU HAVE ${s.E} UNITS OF ENERGY`);
      await this.println('SUGGEST YOU PULL ENERGY FROM');
      await this.println(`SHIELDS (${s.S} UNITS LEFT)`);
      return;
    }

    // Repair / damage tick (BASIC 1610)
    for (let i = 1; i <= 8; i++) {
      if (s.D[i] < 0) s.D[i] += 1;
    }
    if (rnd() <= 0.2) {
      const r1 = rnd1to8();
      if (rnd() < 0.5) {
        s.D[r1] -= rnd() * 5 + 1;
        await this.println();
        await this.println('DAMAGE CONTROL REPORT:');
        await this.println(`${DEVICE_NAMES[r1]} DAMAGED`);
        await this.println();
      } else {
        s.D[r1] += rnd() * 5 + 1;
        await this.println();
        await this.println('DAMAGE CONTROL REPORT:');
        await this.println(`${DEVICE_NAMES[r1]} STATE OF REPAIR IMPROVED`);
        await this.println();
      }
    }

    // Move (BASIC 1810)
    const N = Math.floor(w1 * 8);
    s.quadrant[s.S1][s.S2] = G_EMPTY;
    let X = s.S1, Y = s.S2;
    const c2 = Math.floor(c1);
    const X1 = C[c2][0] + (C[c2 + 1][0] - C[c2][0]) * (c1 - c2);
    const X2 = C[c2][1] + (C[c2 + 1][1] - C[c2][1]) * (c1 - c2);

    let leftQuadrant = false;
    let stoppedInside = false;
    let lastX1 = X1, lastX2 = X2;
    for (let i = 1; i <= N; i++) {
      s.S1 += X1;
      s.S2 += X2;
      if (s.S1 < 0.5 || s.S1 >= 8.5 || s.S2 < 0.5 || s.S2 >= 8.5) {
        leftQuadrant = true;
        break;
      }
      // collision check
      const r = intHalf(s.S1), c = intHalf(s.S2);
      if (s.quadrant[r][c] !== G_EMPTY) {
        await this.println(` WARP ENGINES SHUTDOWN AT ${r},${c}`);
        await this.println(' DUE TO BAD NAVIGATION');
        s.S1 -= X1;
        s.S2 -= X2;
        stoppedInside = true;
        break;
      }
    }

    if (!leftQuadrant) {
      // Stay in quadrant
      s.S1 = intHalf(s.S1);
      s.S2 = intHalf(s.S2);
      s.quadrant[s.S1][s.S2] = G_SHIP;
      s.E -= N + 5;
      if (w1 >= 1) s.T += 1;
      if (s.T > s.T0 + s.T9) return this.gameOverOutOfTime();
      await this.shortRangeScan();
      return;
    }

    // Left quadrant: compute new quadrant + sector (BASIC 2170)
    let absX = s.Q1 * 8 + X + X1 * N;
    let absY = s.Q2 * 8 + Y + X2 * N;
    s.Q1 = Math.floor(absX / 8);
    s.Q2 = Math.floor(absY / 8);
    s.S1 = intHalf(absX - s.Q1 * 8);
    s.S2 = intHalf(absY - s.Q2 * 8);
    if (s.S1 === 0) { s.Q1 -= 1; s.S1 = 8; }
    if (s.S2 === 0) { s.Q2 -= 1; s.S2 = 8; }
    s.T += 1;
    s.E -= N + 5;
    if (s.T > s.T0 + s.T9) return this.gameOverOutOfTime();
    await this.enterQuadrant();
  }

  // ---- Command 2: long range scan (BASIC 2330) ----------------------------

  async cmdLongRange() {
    const s = this.s;
    if (s.D[3] < 0) {
      await this.println('LONG RANGE SENSORS ARE INOPERABLE');
      return;
    }
    await this.println(`LONG RANGE SENSOR SCAN FOR QUADRANT ${s.Q1},${s.Q2}`);
    const sep = '-----------------';
    await this.println(sep);
    for (let i = s.Q1 - 1; i <= s.Q1 + 1; i++) {
      const cells = [];
      for (let j = s.Q2 - 1; j <= s.Q2 + 1; j++) {
        if (i < 1 || i > 8 || j < 1 || j > 8) {
          cells.push('   ');
        } else {
          cells.push(fmtNumD(s.G[i][j], 3));
          if (s.D[7] >= 0) s.Z[i][j] = s.G[i][j];
        }
      }
      await this.println(`: ${cells[0]} : ${cells[1]} : ${cells[2]} :`);
      await this.println(sep);
    }
  }

  // ---- Command 3: phasers (BASIC 2530) ------------------------------------

  async cmdPhasers() {
    const s = this.s;
    if (s.K3 <= 0) {
      await this.println('SHORT RANGE SENSORS REPORT NO');
      await this.println('KLINGONS IN THIS QUADRANT');
      return;
    }
    if (s.D[4] < 0) {
      await this.println('PHASER CONTROL IS DISABLED');
      return;
    }
    if (s.D[7] < 0) await this.println(' COMPUTER FAILURE HAMPERS ACCURACY');
    let x;
    while (true) {
      await this.println('PHASERS LOCKED ON TARGET.');
      await this.println(`ENERGY AVAILABLE=${s.E}`);
      x = await this.askNumberWith('NUMBER OF UNITS TO FIRE? ', () => this.helpPhasers());
      if (x <= 0) return;
      if (s.E - x >= 0) break;
    }
    s.E -= x;
    await this.klingonAttack();
    if (s.over) return;

    const accuracy = s.D[7] >= 0 ? x : x * rnd();
    for (let i = 1; i <= 3; i++) {
      const k = s.K[i];
      if (k[2] <= 0) continue;
      const dist = Math.sqrt((k[0] - s.S1) ** 2 + (k[1] - s.S2) ** 2);
      const h = (accuracy / s.K3 / dist) * (2 * rnd());
      k[2] -= h;
      await this.println(
        `${fmtNumD(h, 4)} UNIT HIT ON KLINGON`
      );
      await this.println(
        `AT SECTOR ${k[0]},${k[1]}  (${fmtNumD(Math.max(k[2], 0), 3)} LEFT)`
      );
      if (k[2] <= 0) {
        await this.killKlingon(i);
        if (s.K9 <= 0) return this.gameOverWin();
      }
    }
    if (s.E < 0) return this.gameOverDestroyed();
  }

  // ---- Command 4: photon torpedoes (BASIC 2800) ---------------------------

  async cmdTorpedoes() {
    const s = this.s;
    if (s.D[5] < 0) {
      await this.println('PHOTON TUBES ARE NOT OPERATIONAL');
      return;
    }
    if (s.P <= 0) {
      await this.println('ALL PHOTON TORPEDOES EXPENDED');
      return;
    }
    let c1;
    while (true) {
      c1 = await this.askNumberWith('TORPEDO COURSE (1-9)? ', () => this.helpCourse());
      if (c1 === 0) return;
      if (c1 >= 1 && c1 < 9) break;
    }
    const c2 = Math.floor(c1);
    const X1 = C[c2][0] + (C[c2 + 1][0] - C[c2][0]) * (c1 - c2);
    const X2 = C[c2][1] + (C[c2 + 1][1] - C[c2][1]) * (c1 - c2);
    s.P -= 1;
    await this.println('TORPEDO TRACK:');
    let X = s.S1, Y = s.S2;
    let hit = false;
    while (true) {
      X += X1;
      Y += X2;
      if (X < 0.5 || X >= 8.5 || Y < 0.5 || Y >= 8.5) {
        await this.println('TORPEDO MISSED');
        break;
      }
      const xi = intHalf(X), yi = intHalf(Y);
      await this.println(`               ${xi},${yi}`);
      const cell = s.quadrant[xi][yi];
      if (cell === G_EMPTY) continue;
      if (cell === G_KLINGON) {
        await this.println('*** KLINGON DESTROYED ***');
        s.K3 -= 1;
        s.K9 -= 1;
        if (s.K9 <= 0) return this.gameOverWin();
        for (let i = 1; i <= 3; i++) {
          if (s.K[i][0] === xi && s.K[i][1] === yi) { s.K[i][2] = 0; break; }
        }
        s.quadrant[xi][yi] = G_EMPTY;
        s.G[s.Q1][s.Q2] = s.K3 * 100 + s.B3 * 10 + s.S3;
        hit = true;
        break;
      }
      if (cell === G_STAR) {
        await this.println("YOU CAN'T DESTROY STARS SILLY");
        break;
      }
      if (cell === G_STARBASE) {
        await this.println('*** STAR BASE DESTROYED ***');
        await this.println('  .......CONGRATULATIONS');
        s.B3 -= 1;
        s.B9 -= 1;
        s.quadrant[xi][yi] = G_EMPTY;
        s.G[s.Q1][s.Q2] = s.K3 * 100 + s.B3 * 10 + s.S3;
        hit = true;
        break;
      }
      // any other glyph (e.g. ship) — pass through (shouldn't happen)
    }
    await this.klingonAttack();
    if (s.E < 0) return this.gameOverDestroyed();
  }

  // ---- Command 5: shield control (BASIC 3460) -----------------------------

  async cmdShields() {
    const s = this.s;
    if (s.D[7] < 0) {
      await this.println('SHIELD CONTROL IS NON-OPERATIONAL');
      return;
    }
    while (true) {
      await this.println(`ENERGY AVAILABLE = ${s.E + s.S}`);
      const x = await this.askNumberWith(
        'NUMBER OF UNITS TO SHIELDS? ',
        () => this.helpShields(),
      );
      if (x <= 0) return;
      if (s.E + s.S - x >= 0) {
        s.E = s.E + s.S - x;
        s.S = x;
        return;
      }
    }
  }

  // ---- Command 6: damage control report (BASIC 3560) ----------------------

  async cmdDamage() {
    const s = this.s;
    if (s.D[6] < 0) {
      await this.println('DAMAGE CONTROL REPORT IS NOT AVAILABLE');
      return;
    }
    await this.println();
    await this.println('DEVICE        STATE OF REPAIR');
    for (let r = 1; r <= 8; r++) {
      await this.println(`${DEVICE_NAMES[r]}   ${s.D[r].toFixed(0)}`);
    }
    await this.println();
  }

  // ---- Command 7: library computer (BASIC 4630) ---------------------------

  async cmdComputer() {
    const s = this.s;
    if (s.D[8] < 0) {
      await this.println('COMPUTER DISABLED');
      return;
    }
    while (true) {
      const raw = (await this.ask('COMPUTER ACTIVE AND AWAITING COMMAND? ')).trim();
      if (raw === '' || raw === '?' || !/^-?\d+$/.test(raw)) {
        await this.printComputerHelp();
        continue;
      }
      const a = Number(raw);
      if (a === 0) return this.computerGalacticRecord();
      if (a === 1) return this.computerStatus();
      if (a === 2) return this.computerTorpedoData();
      await this.printComputerHelp();
    }
  }

  async printComputerHelp() {
    await this.println('FUNCTIONS AVAILABLE FROM COMPUTER');
    await this.println('   0 = CUMULATIVE GALACTIC RECORD');
    await this.println('   1 = STATUS REPORT');
    await this.println('   2 = PHOTON TORPEDO DATA');
  }

  // ---- Per-prompt help text ----------------------------------------------

  async helpCourse() {
    await this.println('COURSE IS A COMPASS DIRECTION 1-9');
    await this.println('(DECIMALS OK):');
    await this.println('       4   3   2');
    await this.println('        \\ ^ /');
    await this.println('       5 ----- 1');
    await this.println('        / v \\');
    await this.println('       6   7   8');
    await this.println('1=RIGHT, 3=UP, 5=LEFT, 7=DOWN.');
    await this.println('1.5 = HALFWAY BETWEEN 1 AND 2.');
    await this.println('ENTER 0 TO CANCEL.');
  }

  async helpWarpFactor() {
    await this.println('WARP FACTOR 0-8 SETS HOW FAR YOU TRAVEL:');
    await this.println('  WARP 1 = 8 SECTORS (ONE FULL QUADRANT).');
    await this.println('  WARP .2 = MINIMUM USABLE SPEED.');
    await this.println('  DAMAGED ENGINES LIMIT YOU TO WARP .2.');
    await this.println('ENERGY USED = (WARP*8) + 5.');
  }

  async helpPhasers() {
    const s = this.s;
    await this.println('SPEND SHIP ENERGY TO HIT KLINGONS');
    await this.println('IN THIS QUADRANT.');
    await this.println(`AVAILABLE ENERGY = ${s.E}.`);
    await this.println(`KLINGONS PRESENT = ${s.K3}.`);
    await this.println('DAMAGE IS SPLIT AMONG KLINGONS,');
    await this.println('SCALED BY RANGE.');
    await this.println('DAMAGED COMPUTER REDUCES ACCURACY.');
    await this.println('ENTER 0 TO CANCEL.');
  }

  async helpShields() {
    const s = this.s;
    await this.println('SHIELDS ABSORB DAMAGE FROM KLINGONS.');
    await this.println(`SHIP ENERGY = ${s.E}.`);
    await this.println(`CURRENT SHIELDS = ${s.S}.`);
    await this.println(`TOTAL POOL = ${s.E + s.S}.`);
    await this.println('ENTER UNITS TO MOVE INTO SHIELDS,');
    await this.println('0 TO CANCEL.');
  }

  async helpDelay() {
    await this.println('CHARACTER PRINT DELAY IN MILLISECONDS:');
    await this.println('     0 = INSTANT');
    await this.println('     8 = FAST (DEFAULT)');
    await this.println('    80 = ASR-33 SPEED (10 CHARS/SEC)');
    await this.println('   150 = ED1000 BAUDOT-LIKE PACE');
    await this.println('PRESS ENTER ALONE TO KEEP CURRENT VALUE.');
  }

  async helpSound() {
    await this.println('SOUND OPTIONS:');
    await this.println('   0 = SILENT');
    await this.println('   1 = TELETYPE CLACK (MP3 SAMPLE)');
    await this.println('   2 = MOVIE TEXT BEEP');
    await this.println('   3 = TELETYPE LINE FSK (700/500 HZ TONES)');
    await this.println('PRESS ENTER ALONE TO KEEP CURRENT MODE.');
  }

  async computerGalacticRecord() {
    const s = this.s;
    await this.println(`COMPUTER RECORD OF GALAXY ${s.Q1},${s.Q2}`);
    const lines = [];
    lines.push('     1     2     3     4     5     6     7     8');
    const sep = '   ----- ----- ----- ----- ----- ----- ----- -----';
    lines.push(sep);
    for (let i = 1; i <= 8; i++) {
      let line = `${i}`;
      for (let j = 1; j <= 8; j++) {
        line += '   ' + fmtNumD(s.Z[i][j], 3);
      }
      lines.push(line);
      lines.push(sep);
    }
    const block = document.createElement('pre');
    block.className = 'srs-frame';
    this.tt.appendBlock(block);
    await this.tt.typeInto(block, lines.join('\n'));
  }

  async computerStatus() {
    const s = this.s;
    await this.println();
    await this.println('   STATUS REPORT');
    await this.println();
    await this.println(`NUMBER OF KLINGONS LEFT =${s.K9}`);
    await this.println(`NUMBER OF STARDATES LEFT =${(s.T0 + s.T9) - s.T}`);
    await this.println(`NUMBER OF STARBASES LEFT =${s.B9}`);
    await this.cmdDamage();
  }

  async computerTorpedoData() {
    const s = this.s;
    await this.println();
    if (s.K3 <= 0) {
      await this.println('SHORT RANGE SENSORS REPORT NO');
      await this.println('KLINGONS IN THIS QUADRANT');
      return;
    }
    for (let i = 1; i <= 3; i++) {
      const k = s.K[i];
      if (k[2] <= 0) continue;
      const direction = bearing(s.S1, s.S2, k[0], k[1]);
      const distance = Math.sqrt((k[0] - s.S1) ** 2 + (k[1] - s.S2) ** 2);
      await this.println(`DIRECTION =${direction}`);
      await this.println(`DISTANCE =${distance}`);
    }
  }

  // ---- Klingon attack (BASIC 3790) ----------------------------------------

  async klingonAttack() {
    const s = this.s;
    if (s.docked) {
      await this.println('STAR BASE SHIELDS PROTECT THE ENTERPRISE');
      return;
    }
    if (s.K3 <= 0) return;
    for (let i = 1; i <= 3; i++) {
      const k = s.K[i];
      if (k[2] <= 0) continue;
      const dist = Math.sqrt((k[0] - s.S1) ** 2 + (k[1] - s.S2) ** 2) || 0.5;
      const h = (k[2] / dist) * (2 * rnd());
      s.S -= h;
      await this.println(
        `${fmtNumD(h, 4)} UNIT HIT ON ENTERPRISE`
      );
      await this.println(
        `AT SECTOR ${k[0]},${k[1]}  (${fmtNumD(Math.max(s.S, 0), 4)} LEFT)`
      );
      if (s.S < 0) return this.gameOverDestroyed();
    }
  }

  async killKlingon(i) {
    const s = this.s;
    const k = s.K[i];
    await this.println(`KLINGON AT SECTOR ${k[0]},${k[1]} DESTROYED ****`);
    s.K3 -= 1;
    s.K9 -= 1;
    s.quadrant[k[0]][k[1]] = G_EMPTY;
    s.G[s.Q1][s.Q2] = s.K3 * 100 + s.B3 * 10 + s.S3;
  }

  // ---- Game over states ---------------------------------------------------

  async gameOverWin() {
    const s = this.s;
    await this.println();
    await this.println('THE LAST KLINGON BATTLE CRUISER');
    await this.println('IN THE GALAXY HAS BEEN DESTROYED');
    await this.println('THE FEDERATION HAS BEEN SAVED !!!');
    await this.println();
    const eff = (s.K7 / Math.max(s.T - s.T0, 1)) * 1000;
    await this.println(`YOUR EFFICIENCY RATING =${eff}`);
    s.over = true;
  }

  async gameOverOutOfTime() {
    const s = this.s;
    await this.println();
    await this.println(`IT IS STARDATE ${s.T}`);
    await this.println(`THERE ARE STILL ${s.K9} KLINGON BATTLE CRUISERS`);
    s.over = true;
  }

  async gameOverDestroyed() {
    const s = this.s;
    await this.println();
    await this.println('THE ENTERPRISE HAS BEEN DESTROYED.');
    await this.println('THE FEDERATION WILL BE CONQUERED');
    await this.println(`THERE ARE STILL ${s.K9} KLINGON BATTLE CRUISERS`);
    s.over = true;
  }

  async gameOverDeadInSpace() {
    const s = this.s;
    await this.println('THE ENTERPRISE IS DEAD IN SPACE.');
    await this.println('IF YOU SURVIVE ALL IMPENDING ATTACK');
    await this.println('YOU WILL BE DEMOTED TO PRIVATE');
    while (s.K3 > 0 && !s.over) {
      await this.klingonAttack();
    }
    if (!s.over) {
      await this.println(`THERE ARE STILL ${s.K9} KLINGON BATTLE CRUISERS`);
      s.over = true;
    }
  }
}

// Course-style bearing from ship (sr,sc) to target (tr,tc),
// mirroring BASIC lines 5010-5240 directly.
function bearing(sr, sc, tr, tc) {
  // BASIC at 5010-5020 sets X = target_col - ship_col, A = ship_row - target_row
  const X = tc - sc;
  const A = sr - tr;
  let C1;
  if (X < 0) {                  // 5030 -> 5130
    if (A > 0) { C1 = 3; return interp37(C1, X, A); }   // 5170 -> 5200
    C1 = 5; return interp15(C1, X, A);                  // 5150 -> 5080
  }
  if (A < 0) { C1 = 7; return interp37(C1, X, A); }     // 5190 -> 5200
  if (X > 0) { C1 = 1; return interp15(C1, X, A); }     // 5070 -> 5080
  if (A === 0) return 5;                                // X=0,A=0: same cell
  // X=0, A>0: BASIC falls through to 5070 (C1=1) and uses 5080 path
  return interp15(1, X, A);
}

function interp15(C1, X, A) {     // BASIC 5080-5120
  const aA = Math.abs(A), aX = Math.abs(X);
  if (aA <= aX) return C1 + aA / aX;
  return C1 + ((aA - aX) + aA) / aA;
}

function interp37(C1, X, A) {     // BASIC 5200-5230
  const aA = Math.abs(A), aX = Math.abs(X);
  if (aA >= aX) return C1 + aX / aA;
  return C1 + ((aX - aA) + aX) / aX;
}
