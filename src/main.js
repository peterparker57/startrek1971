import { Teletype } from './teletype.js';
import { Game } from './game.js';
import { Sound } from './sound.js';
import { loadPref } from './prefs.js';

const sound = new Sound();
const tt = new Teletype(
  document.getElementById('output'),
  document.getElementById('cmd'),
  document.getElementById('prompt'),
  sound,
);

// Restore saved settings (URL ?cps= still overrides delay)
const savedDelay = loadPref('charDelayMs', null);
if (savedDelay !== null && savedDelay >= 0) tt.setDelayMs(savedDelay);

const savedSound = loadPref('soundMode', 0);
if (savedSound > 0) sound.setMode(savedSound);

const params = new URLSearchParams(location.search);
const cpsRaw = params.get('cps');
if (cpsRaw !== null) {
  const cpsParam = Number(cpsRaw);
  if (Number.isFinite(cpsParam) && cpsParam >= 0) {
    tt.setSpeed(cpsParam);
  }
}

async function clearScreen() {
  for (let i = 0; i < 12; i++) await tt.println();
}

function waitForAnyKey() {
  return new Promise((resolve) => {
    const handler = (ev) => {
      if (ev.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) return;
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
      window.removeEventListener('click', handler);
      resolve();
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler, { passive: true });
    window.addEventListener('click', handler);
  });
}

async function bootstrap() {
  await clearScreen();
  await tt.println('                          STAR TREK ');
  await tt.println();
  await tt.println("(TYPE 'I' AT THE COMMAND PROMPT FOR INSTRUCTIONS, OR '?' FOR HELP.)");
  await tt.println('PRESS ANY KEY TO START YOUR MISSION.');
  await waitForAnyKey();
  sound.resume();
  const game = new Game(tt);
  await game.run();
}

bootstrap();
