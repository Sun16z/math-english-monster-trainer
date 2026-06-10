import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CURRICULUM_OUTLINE,
  DIFFICULTIES,
  GRADES,
  MODES,
  MONSTERS,
  PET_FOODS,
  PET_SKINS,
  STAGES,
  addFoodToBag,
  addSkinToPet,
  applySkinToMonster,
  calculateDamage,
  chooseFoodReward,
  computeStageStars,
  createInitialRun,
  feedPetWithFood,
  generateQuestion,
  getEvolutionName,
  getPetStage,
  getMonsterHp,
  getStageMonster,
  growPetDex,
  hatchEgg,
  isBossWave,
  isEggReady,
  isStageUnlocked,
  maybeDropEgg,
  normalizeFoodBag,
  normalizeMapProgress,
  normalizePetDex,
  summarizeRun,
  warmEgg,
} from './gameLogic.js';

const STORAGE_KEY = 'math-english-monster-trainer:v1';

const PET_SKINS_BY_ID = Object.fromEntries(PET_SKINS.map((skin) => [skin.id, skin]));

const SOUND_LIBRARY = {
  select: {
    type: 'triangle',
    gain: 0.38,
    notes: [
      [392, 0, 0.08],
      [587.33, 0.06, 0.12],
    ],
  },
  poke: {
    type: 'triangle',
    gain: 0.4,
    notes: [
      [659.25, 0, 0.08],
      [880, 0.06, 0.1],
      [1174.66, 0.14, 0.14],
    ],
  },
  good: {
    type: 'triangle',
    gain: 0.5,
    notes: [
      [523.25, 0, 0.16],
      [659.25, 0.08, 0.16],
      [783.99, 0.16, 0.2],
    ],
  },
  combo: {
    type: 'triangle',
    gain: 0.48,
    notes: [
      [523.25, 0, 0.1],
      [659.25, 0.06, 0.1],
      [783.99, 0.12, 0.12],
      [987.77, 0.2, 0.18],
    ],
  },
  wrong: {
    type: 'sawtooth',
    gain: 0.26,
    notes: [
      [196, 0, 0.18],
      [164.81, 0.12, 0.22],
    ],
  },
  retry: {
    type: 'sine',
    gain: 0.32,
    notes: [
      [329.63, 0, 0.12],
      [392, 0.09, 0.14],
    ],
  },
  catch: {
    type: 'triangle',
    gain: 0.56,
    notes: [
      [523.25, 0, 0.14],
      [659.25, 0.07, 0.14],
      [783.99, 0.14, 0.16],
      [1046.5, 0.24, 0.28],
    ],
  },
  next: {
    type: 'sine',
    gain: 0.34,
    notes: [
      [392, 0, 0.14],
      [523.25, 0.1, 0.16],
    ],
  },
  feed: {
    type: 'triangle',
    gain: 0.45,
    notes: [
      [349.23, 0, 0.12],
      [523.25, 0.08, 0.14],
      [698.46, 0.17, 0.18],
    ],
  },
  level: {
    type: 'triangle',
    gain: 0.52,
    notes: [
      [440, 0, 0.13],
      [554.37, 0.08, 0.13],
      [659.25, 0.16, 0.16],
      [880, 0.26, 0.2],
      [1174.66, 0.38, 0.24],
    ],
  },
  rare: {
    type: 'sine',
    gain: 0.42,
    notes: [
      [1046.5, 0, 0.1, 0.8],
      [1318.51, 0.08, 0.12, 0.8],
      [1567.98, 0.17, 0.16, 0.72],
      [2093, 0.31, 0.2, 0.58],
    ],
  },
  speak: {
    type: 'sine',
    gain: 0.24,
    notes: [
      [587.33, 0, 0.08],
      [659.25, 0.07, 0.1],
    ],
  },
  toggle: {
    type: 'triangle',
    gain: 0.34,
    notes: [
      [440, 0, 0.12],
      [587.33, 0.08, 0.16],
    ],
  },
  test: {
    type: 'triangle',
    gain: 0.5,
    notes: [
      [523.25, 0, 0.16],
      [659.25, 0.09, 0.16],
      [783.99, 0.18, 0.18],
      [1046.5, 0.3, 0.24],
    ],
  },
};

const WAV_CACHE = new Map();

function waveform(type, phase) {
  if (type === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (type === 'sawtooth') return 2 * (phase / (Math.PI * 2) - Math.floor(0.5 + phase / (Math.PI * 2)));
  return Math.sin(phase);
}

function writeText(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(label)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function makeWavDataUrl(kind) {
  if (WAV_CACHE.has(kind)) return WAV_CACHE.get(kind);

  const pattern = SOUND_LIBRARY[kind] || SOUND_LIBRARY.good;
  const sampleRate = 22050;
  const totalDuration = Math.max(...pattern.notes.map(([, offset, duration]) => offset + duration)) + 0.08;
  const sampleCount = Math.ceil(totalDuration * sampleRate);
  const samples = new Float32Array(sampleCount);

  pattern.notes.forEach(([frequency, offset, duration, noteGain = 1]) => {
    const start = Math.floor(offset * sampleRate);
    const length = Math.floor(duration * sampleRate);
    for (let index = 0; index < length; index += 1) {
      const sampleIndex = start + index;
      const progress = index / Math.max(1, length - 1);
      const attack = Math.min(1, progress / 0.16);
      const release = Math.min(1, (1 - progress) / 0.24);
      const envelope = Math.max(0, Math.min(attack, release));
      const phase = Math.PI * 2 * frequency * (index / sampleRate);
      samples[sampleIndex] += waveform(pattern.type, phase) * envelope * (pattern.gain || 0.36) * noteGain;
    }
  });

  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  writeText(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, clamped * 0x7fff, true);
  }

  const url = `data:audio/wav;base64,${bytesToBase64(new Uint8Array(buffer))}`;
  WAV_CACHE.set(kind, url);
  return url;
}

function createSoundEngine() {
  let ctx = null;
  let master = null;

  const ensureContext = async () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.82;
      master.connect(ctx.destination);
    }

    if (ctx.state === 'suspended') {
      try {
        await withTimeout(ctx.resume(), 700, 'AudioContextResumeTimeout');
      } catch {
        return null;
      }
    }

    if (ctx.state !== 'running') return null;

    return { ctx, master };
  };

  const playWithAudioElement = async (kind) => {
    if (!window.Audio || !window.btoa || !window.Float32Array) {
      window.__monsterTrainerAudio = {
        lastSound: kind,
        state: 'unsupported',
        playedAt: Date.now(),
      };
      return { ok: false, state: 'unsupported' };
    }

    const audio = new Audio(makeWavDataUrl(kind));
    audio.volume = 1;
    try {
      await withTimeout(audio.play(), 900, 'HtmlAudioPlayTimeout');
      window.__monsterTrainerAudio = {
        lastSound: kind,
        state: 'html-audio',
        playedAt: Date.now(),
      };
      return { ok: true, state: 'html-audio' };
    } catch (error) {
      window.__monsterTrainerAudio = {
        lastSound: kind,
        state: 'blocked',
        error: error?.name || 'AudioPlayError',
        playedAt: Date.now(),
      };
      return { ok: false, state: 'blocked' };
    }
  };

  const play = async (kind) => {
    const audio = await ensureContext();
    if (!audio) return playWithAudioElement(kind);

    const pattern = SOUND_LIBRARY[kind] || SOUND_LIBRARY.good;
    const startBase = audio.ctx.currentTime + 0.018;

    pattern.notes.forEach(([frequency, offset, duration, noteGain = 1]) => {
      const oscillator = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      const start = startBase + offset;
      const end = start + duration;

      oscillator.type = pattern.type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime((pattern.gain || 0.46) * noteGain, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(audio.master);
      oscillator.start(start);
      oscillator.stop(end + 0.03);
    });

    window.__monsterTrainerAudio = {
      lastSound: kind,
      state: audio.ctx.state,
      playedAt: Date.now(),
    };

    return { ok: audio.ctx.state === 'running', state: audio.ctx.state };
  };

  return { play };
}

function createSpeechEngine() {
  const getSynthesis = () => window.speechSynthesis;

  const getVoices = () => {
    const synthesis = getSynthesis();
    if (!synthesis) return [];
    return synthesis.getVoices?.() || [];
  };

  const pickEnglishVoice = () => {
    const voices = getVoices();
    return (
      voices.find((voice) => voice.lang?.toLowerCase().startsWith('en-us')) ||
      voices.find((voice) => voice.lang?.toLowerCase().startsWith('en')) ||
      null
    );
  };

  const speak = async (text, { rate = 0.88, pitch = 1.05 } = {}) => {
    const synthesis = getSynthesis();
    if (!synthesis || !window.SpeechSynthesisUtterance) {
      window.__monsterTrainerSpeech = {
        text,
        state: 'unsupported',
        spokenAt: Date.now(),
      };
      return { ok: false, state: 'unsupported' };
    }

    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    utterance.voice = pickEnglishVoice();

    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        synthesis.cancel();
        window.__monsterTrainerSpeech = {
          text,
          state: 'blocked',
          spokenAt: Date.now(),
        };
        resolve({ ok: false, state: 'blocked' });
      }, Math.max(1800, text.length * 120));

      utterance.onstart = () => {
        window.__monsterTrainerSpeech = {
          text,
          state: 'speaking',
          spokenAt: Date.now(),
        };
      };

      utterance.onend = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        window.__monsterTrainerSpeech = {
          text,
          state: 'ready',
          spokenAt: Date.now(),
        };
        resolve({ ok: true, state: 'ready' });
      };

      utterance.onerror = (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        window.__monsterTrainerSpeech = {
          text,
          state: 'blocked',
          error: event.error,
          spokenAt: Date.now(),
        };
        resolve({ ok: false, state: 'blocked' });
      };

      synthesis.speak(utterance);
    });
  };

  const cancel = () => {
    getSynthesis()?.cancel();
  };

  return { speak, cancel };
}

function loadProfile() {
  const empty = { bestScore: 0, collection: [], petDex: {}, foodBag: {}, mapProgress: {}, sessions: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const collection = Array.isArray(parsed.collection) ? parsed.collection : [];
    return {
      bestScore: Number(parsed.bestScore) || 0,
      collection,
      petDex: normalizePetDex(parsed.petDex, collection),
      foodBag: normalizeFoodBag(parsed.foodBag),
      mapProgress: normalizeMapProgress(parsed.mapProgress),
      sessions: Number(parsed.sessions) || 0,
    };
  } catch {
    return empty;
  }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function makeReviewQuestion(question, answeredCount) {
  const domain = question.originalDomain || question.domain.replace(/^錯題複習 · /, '');
  return {
    ...question,
    id: `${question.id}-review-${answeredCount + 1}`,
    domain: `錯題複習 · ${domain}`,
    originalDomain: domain,
    originalId: question.originalId || question.id,
    review: true,
  };
}

function makeReviewItem(question) {
  const domain = question.originalDomain || question.domain.replace(/^錯題複習 · /, '');
  return {
    originalId: question.originalId || question.id,
    dueIn: question.review ? 1 : 2,
    question: {
      ...question,
      domain,
      originalDomain: domain,
      review: false,
      answered: null,
    },
  };
}

function getStrongestPet(petDex = {}) {
  return Object.values(petDex || {}).sort((a, b) => (b.xp || 0) - (a.xp || 0))[0] || null;
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? 'heart filled' : 'heart'}>
      <path d="M12 21s-7.5-4.7-9.6-9.2C.8 8.4 2.7 5 6.2 5c2 0 3.4 1.1 4.2 2.2C11.2 6.1 12.7 5 14.7 5c3.5 0 5.4 3.4 3.8 6.8C16.4 16.3 12 21 12 21Z" />
    </svg>
  );
}

function SubjectIcon({ subject }) {
  if (subject === 'mandarin') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16M7 5v14M17 5v14M5 12h14" />
        <path d="M9 9h6M9 15h6" />
      </svg>
    );
  }

  if (subject === 'english') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h10.5A3.5 3.5 0 0 1 19 7.5V20H8.5A3.5 3.5 0 0 1 5 16.5V4Z" />
        <path d="M8.2 8h6.6M8.2 11.5h7.6M8.2 15h4.8" />
      </svg>
    );
  }

  if (subject === 'natural') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 13c5.8-7.5 12.2-7.8 15-7.3.3 3.9-.9 10.2-8.1 12.5C8.3 19.4 5.7 17 5 13Z" />
        <path d="M6 18c3.6-4.5 7.1-6.6 12-8" />
        <path d="M16.5 15.7c1.2 1.2 1.9 2.4 1.9 3.6a2.4 2.4 0 0 1-4.8 0c0-1.2.7-2.4 1.9-3.6l.5-.5Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h12v14H6z" />
      <path d="M9 9h6M12 6v6M9 15h.1M12 15h.1M15 15h.1" />
    </svg>
  );
}

function AccessoryLayer({ accessory }) {
  if (!accessory) return null;

  if (accessory.id === 'leafCrown') {
    return (
      <g className="accessory accessory-leaf-crown">
        <path d="M80 51c-14-16-11-29 4-39 11 11 14 24 4 39Z" />
        <path d="M112 48c-6-20 2-31 20-33 5 15 0 27-13 35Z" />
        <path d="M141 57c2-18 14-26 31-21-1 16-10 25-26 28Z" />
      </g>
    );
  }

  if (accessory.id === 'starBadge') {
    return <path className="accessory accessory-star-badge" d="M111 151 119 168l19 2-14 13 4 19-17-10-17 10 4-19-14-13 19-2Z" />;
  }

  if (accessory.id === 'crystalBell') {
    return (
      <g className="accessory accessory-crystal-bell">
        <path d="M103 157h18l8 19-17 14-17-14Z" />
        <circle cx="112" cy="192" r="5" />
      </g>
    );
  }

  if (accessory.id === 'moonRibbon') {
    return (
      <g className="accessory accessory-moon-ribbon">
        <path d="M73 78c-18-1-31-12-35-26 15 8 31 4 40-8-1 14 8 28 21 35-8 3-17 2-26-1Z" />
        <path d="M70 83 45 96l9-24Z" />
        <path d="M78 84 102 98l-7-25Z" />
      </g>
    );
  }

  if (accessory.id === 'sproutCap') {
    return (
      <g className="accessory accessory-sprout-cap">
        <path d="M92 41c11-26 31-29 52-13-12 20-31 25-52 13Z" />
        <path d="M110 49c-2-18 5-31 21-39" />
      </g>
    );
  }

  if (accessory.id === 'emberCharm') {
    return (
      <g className="accessory accessory-ember-charm">
        <path d="M151 151c13 14 13 29 0 40-14-11-14-26 0-40Z" />
        <path d="M151 164c6 7 6 15 0 21-7-6-7-14 0-21Z" />
      </g>
    );
  }

  if (accessory.id === 'mischiefBow') {
    return (
      <g className="accessory accessory-mischief-bow">
        <path d="M67 72c-18-14-30-13-38 0 9 12 22 14 38 0Z" />
        <path d="M77 72c18-14 30-13 38 0-9 12-22 14-38 0Z" />
        <circle cx="72" cy="72" r="8" />
      </g>
    );
  }

  if (accessory.id === 'cloudBell') {
    return (
      <g className="accessory accessory-cloud-bell">
        <path d="M96 154h32l-7 24H103Z" />
        <path d="M103 154c3-10 15-14 22 0" />
        <circle cx="112" cy="183" r="5" />
      </g>
    );
  }

  return null;
}

function EvolutionLayer({ stage }) {
  if (!stage) return null;
  return (
    <g className={`evo-layer evo-stage-${stage}`} aria-hidden="true">
      <ellipse className="evo-aura" cx="110" cy="186" rx="74" ry="18" />
      <path className="evo-spark s1" d="M34 96l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z" />
      <path className="evo-spark s2" d="M186 60l4 8 9 1-6 7 1 9-8-4-8 4 1-9-6-7 9-1Z" />
      {stage >= 2 ? (
        <g className="evo-crown">
          <path d="M84 30l12 14 14-20 14 20 12-14 -6 26H90Z" />
          <circle cx="110" cy="22" r="5" />
        </g>
      ) : null}
      {stage >= 2 ? <path className="evo-spark s3" d="M52 40l4 8 9 1-6 7 1 9-8-4-8 4 1-9-6-7 9-1Z" /> : null}
    </g>
  );
}

function SpecialPetSvg({ monster, accessory, evoStage = 0 }) {
  const uid = useId();
  if (monster.petShape === 'moonBunny') {
    return (
      <svg viewBox="0 0 220 220" role="img" aria-label={monster.name}>
        <defs>
          <radialGradient id={`${monster.id}${uid}-hood`} cx="50%" cy="35%" r="68%">
            <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--monster-a), #ffffff 26%)' }} />
            <stop offset="72%" stopColor="var(--monster-a)" />
            <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--monster-a), #000000 42%)' }} />
          </radialGradient>
          <radialGradient id={`${monster.id}${uid}-face`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="var(--monster-b)" />
          </radialGradient>
        </defs>
        <ellipse cx="110" cy="186" rx="66" ry="16" className="shadow" />
        <path className="tail" d="M168 137c20 5 30 20 21 34-15 6-31 0-39-14Z" />
        <path className="ear left" d="M72 69C48 39 39 18 25 20c-4 33 7 59 34 77Z" />
        <path className="ear right" d="M148 69c24-30 33-51 47-49 4 33-7 59-34 77Z" />
        <path className="body" style={{ fill: `url(#${monster.id}${uid}-hood)` }} d="M41 119c0-52 28-88 70-88s70 36 70 88c0 43-27 74-70 74s-70-31-70-74Z" />
        <path className="belly" style={{ fill: `url(#${monster.id}${uid}-face)` }} d="M61 113c0-34 20-57 50-57s50 23 50 57c0 30-20 51-50 51s-50-21-50-51Z" />
        <path className="crest moon-mark" d="M104 54c15-6 27 4 27 17-6-8-18-10-27-4-9 7-9 20-1 27-14-1-24-12-24-25 0-7 3-12 7-16 5 5 11 6 18 1Z" />
        <circle cx="88" cy="108" r="10" className="eye" />
        <circle cx="134" cy="108" r="10" className="eye" />
        <circle cx="91" cy="104" r="3" className="eye-light" />
        <circle cx="137" cy="104" r="3" className="eye-light" />
        <circle cx="74" cy="126" r="8" className="cheek left" />
        <circle cx="148" cy="126" r="8" className="cheek right" />
        <path className="mouth" d="M96 137c8 9 22 9 30 0" />
        <path className="paw left" d="M62 151c-15 5-22 18-14 27 14 4 28-3 36-15Z" />
        <path className="paw right" d="M158 151c15 5 22 18 14 27-14 4-28-3-36-15Z" />
        <path className="spark" d="M175 84 186 75l-3 14 13 7-15 2-4 14-7-12-15 2 10-11-7-12Z" />
        <AccessoryLayer accessory={accessory} />
        <EvolutionLayer stage={evoStage} />
      </svg>
    );
  }

  if (monster.petShape === 'cloudPup') {
    return (
      <svg viewBox="0 0 220 220" role="img" aria-label={monster.name}>
        <defs>
          <radialGradient id={`${monster.id}${uid}-cloud`} cx="46%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="74%" stopColor="var(--monster-b)" />
            <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--monster-b), var(--monster-a) 22%)' }} />
          </radialGradient>
        </defs>
        <ellipse cx="110" cy="186" rx="66" ry="16" className="shadow" />
        <path className="tail" d="M161 130c22-10 41 4 33 21-7 14-28 14-37 1 13 4 24-4 20-13-3-7-12-9-20-4Z" />
        <path className="ear left" d="M76 75C42 72 24 91 25 119c1 28 24 42 48 28 20-12 22-50 3-72Z" />
        <path className="ear right" d="M144 75c34-3 52 16 51 44-1 28-24 42-48 28-20-12-22-50-3-72Z" />
        <path className="body" style={{ fill: `url(#${monster.id}${uid}-cloud)` }} d="M46 123c0-45 25-77 64-77 38 0 64 32 64 77 0 40-26 69-64 69-39 0-64-29-64-69Z" />
        <path className="belly" d="M72 118c0-28 16-48 39-48s38 20 38 48c0 27-15 46-38 46s-39-19-39-46Z" />
        <path className="crest cloud-curl" d="M96 49c10-22 39-18 38 4-1 16-20 21-31 11 12 2 22-4 20-12-2-9-17-9-21 2Z" />
        <circle cx="90" cy="111" r="9" className="eye" />
        <circle cx="132" cy="111" r="9" className="eye" />
        <circle cx="93" cy="108" r="3" className="eye-light" />
        <circle cx="135" cy="108" r="3" className="eye-light" />
        <circle cx="78" cy="129" r="8" className="cheek left" />
        <circle cx="144" cy="129" r="8" className="cheek right" />
        <path className="mouth" d="M98 138c8 8 20 8 28 0" />
        <path className="paw left" d="M65 151c-14 5-20 16-13 25 13 4 25-2 32-13Z" />
        <path className="paw right" d="M155 151c14 5 20 16 13 25-13 4-25-2-32-13Z" />
        <path className="spark" d="M178 77 187 70l-2 12 11 6-13 2-3 12-6-10-13 2 9-10-6-10Z" />
        <AccessoryLayer accessory={accessory} />
        <EvolutionLayer stage={evoStage} />
      </svg>
    );
  }

  return null;
}

function MonsterFigure({
  monster,
  hpRatio,
  isHit,
  isFriend = false,
  growth = 1,
  accessory = null,
  action = null,
  onInteract = null,
  evoStage = 0,
  isBoss = false,
}) {
  const uid = useId();
  const interactive = typeof onInteract === 'function';
  const shape = monster.petShape || 'classic';
  const handleKeyDown = (event) => {
    if (!interactive || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    onInteract();
  };

  return (
    <div
      className={`monster-figure shape-${shape} ${interactive ? 'interactive' : ''} ${isFriend ? 'friend' : 'opponent'} ${isHit ? 'is-hit' : ''} ${action ? `action-${action}` : ''} ${isBoss ? 'is-boss' : ''} evo-${evoStage}`}
      style={{
        '--monster-a': monster.colorA,
        '--monster-b': monster.colorB,
        '--monster-c': monster.colorC,
        '--hp-ratio': hpRatio,
        '--pet-growth': growth,
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `和${monster.name}互動` : undefined}
      onClick={onInteract || undefined}
      onKeyDown={handleKeyDown}
    >
      <SpecialPetSvg monster={monster} accessory={accessory} evoStage={evoStage} />
      {monster.petShape ? null : (
      <svg viewBox="0 0 220 220" role="img" aria-label={monster.name}>
        <defs>
          <radialGradient id={`${monster.id}${uid}-body`} cx="50%" cy="38%" r="64%">
            <stop offset="0%" stopColor="var(--monster-b)" />
            <stop offset="72%" stopColor="var(--monster-a)" />
            <stop offset="100%" stopColor="#17343a" />
          </radialGradient>
          <linearGradient id={`${monster.id}${uid}-horn`} x1="0%" x2="100%">
            <stop offset="0%" stopColor="var(--monster-c)" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>
        <ellipse cx="110" cy="186" rx="66" ry="16" className="shadow" />
        <path className="tail" d="M156 126c32 0 42-20 35-39 19 15 21 48-7 65-14 9-31 6-41-3Z" />
        <path className="ear left" d="M65 60 40 24l47 14Z" />
        <path className="ear right" d="M154 58l30-32-5 47Z" />
        <path className="body" style={{ fill: `url(#${monster.id}${uid}-body)` }} d="M45 116c0-48 28-83 68-83 39 0 66 35 66 83 0 43-27 76-67 76-41 0-67-33-67-76Z" />
        <path className="belly" d="M82 128c0-23 12-39 31-39 18 0 30 16 30 39 0 22-12 36-30 36-19 0-31-14-31-36Z" />
        <path className="leafmark left" d="M55 104c-20-7-28-25-21-42 18 5 29 18 31 36Z" />
        <path className="leafmark right" d="M168 106c20-7 28-25 21-42-18 5-29 18-31 36Z" />
        <path className="crest" style={{ fill: `url(#${monster.id}${uid}-horn)` }} d="M90 44 111 12l22 32-21 13Z" />
        <circle cx="87" cy="104" r="10" className="eye" />
        <circle cx="136" cy="104" r="10" className="eye" />
        <circle cx="90" cy="101" r="3" className="eye-light" />
        <circle cx="139" cy="101" r="3" className="eye-light" />
        <path className="mouth" d="M94 133c10 9 25 9 35 0" />
        <path className="paw left" d="M64 147c-15 5-21 16-14 26 13 3 26-2 33-12Z" />
        <path className="paw right" d="M158 147c15 5 21 16 14 26-13 3-26-2-33-12Z" />
        <path className="spark" d="M179 86 193 74l-5 18 16 8-18 3-3 18-9-15-18 4 12-14-9-15Z" />
        <AccessoryLayer accessory={accessory} />
      </svg>
      )}
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="stat-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FoodIcon({ food }) {
  const style = {
    '--food-a': food.colorA,
    '--food-b': food.colorB,
  };

  if (food.id === 'cake' || food.id === 'starCake') {
    return (
      <svg className={`food-icon food-${food.id}`} viewBox="0 0 48 48" aria-hidden="true" style={style}>
        <path className="food-shadow" d="M10 38c7 4 21 4 28 0 2-1 2-4 0-5-7-4-21-4-28 0-2 1-2 4 0 5Z" />
        <path className="food-cake" d="M12 20h24l-3 18H15Z" />
        <path className="food-cream" d="M12 20c2-8 8-11 12-5 4-6 10-3 12 5Z" />
        <path className="food-sparkle" d="M24 7 27 14l7 1-6 5 2 7-6-4-6 4 2-7-6-5 7-1Z" />
      </svg>
    );
  }

  return (
    <svg className={`food-icon food-${food.id}`} viewBox="0 0 48 48" aria-hidden="true" style={style}>
      <path className="food-shadow" d="M11 38c7 4 19 4 26 0 2-1 2-4 0-5-7-4-19-4-26 0-2 1-2 4 0 5Z" />
      <path className="food-leaf" d="M25 12c4-7 10-8 16-3-4 6-10 8-16 3Z" />
      <circle className="food-fruit" cx="23" cy="27" r="12" />
      <circle className="food-shine" cx="18" cy="22" r="3" />
    </svg>
  );
}

function RewardBurst({ burst }) {
  if (!burst) return null;

  const count = burst.type === 'catch' ? 18 : burst.type === 'rare' || burst.type === 'level' || burst.type === 'heart' ? 14 : 10;
  const particles = Array.from({ length: count }, (_, index) => {
    const angle = Math.round((360 / count) * index + (index % 2 ? 8 : -8));
    const distance = 54 + (index % 5) * 12;
    return { angle, distance, delay: index * 16 };
  });

  return (
    <div key={burst.key} className={`reward-burst burst-${burst.type}`} aria-hidden="true">
      {burst.food ? <FoodIcon food={burst.food} /> : null}
      <strong>{burst.label}</strong>
      {particles.map((particle, index) => (
        <span
          key={index}
          style={{
            '--angle': `${particle.angle}deg`,
            '--distance': `${particle.distance}px`,
            '--delay': `${particle.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ModeControls({ mode, grade, difficulty, onModeChange, onGradeChange, onDifficultyChange }) {
  return (
    <div className="mode-controls">
      <div className="segmented subjects" aria-label="科目">
        {Object.values(MODES).map((item) => (
          <button
            key={item.id}
            className={mode === item.id ? 'active' : ''}
            type="button"
            onClick={() => onModeChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="segmented grades" aria-label="年級">
        {Object.values(GRADES).map((item) => (
          <button
            key={item.id}
            className={grade === item.id ? 'active' : ''}
            type="button"
            onClick={() => onGradeChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="segmented compact" aria-label="難度">
        {Object.values(DIFFICULTIES).map((item) => (
          <button
            key={item.id}
            className={difficulty === item.id ? 'active' : ''}
            type="button"
            onClick={() => onDifficultyChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FoodPack({ foodBag, leadPet, onFeedFood }) {
  return (
    <div className="food-pack" aria-label="點心包">
      <div className="mission-head">
        <span>點心包</span>
        <strong>{leadPet ? '可餵食' : '先收服'}</strong>
      </div>
      <div className="food-grid">
        {PET_FOODS.map((food) => {
          const amount = foodBag?.[food.id] || 0;
          const disabled = amount <= 0 || !leadPet;
          return (
            <button
              key={food.id}
              type="button"
              className={`food-button tier-${food.tier}`}
              onClick={() => onFeedFood(food.id)}
              disabled={disabled}
            >
              <FoodIcon food={food} />
              <span>
                <strong>{food.label}</strong>
                <em>+{food.xp} 成長</em>
              </span>
              <b>{amount}</b>
            </button>
          );
        })}
      </div>
      <p>表現越穩，點心越稀有。</p>
    </div>
  );
}

function EggCard({ egg }) {
  return (
    <div className="egg-card" aria-label="神秘蛋">
      <div className="mission-head">
        <span>孵蛋窩</span>
        <strong>{egg ? egg.label : '空的'}</strong>
      </div>
      {egg ? (
        <div className="egg-body">
          <div className={`egg-icon tier-${egg.tier} ${egg.warmth >= egg.needed - 1 ? 'is-wiggling' : ''}`} style={{ '--egg-a': egg.colorA, '--egg-b': egg.colorB }}>
            <span className="egg-shell" />
            <span className="egg-spot s1" />
            <span className="egg-spot s2" />
          </div>
          <div className="egg-meta">
            <div className="meter egg-meter" aria-label="孵化進度">
              <span style={{ width: `${Math.min(100, (egg.warmth / egg.needed) * 100)}%` }} />
            </div>
            <p>{egg.warmth >= egg.needed ? '快孵化了！' : `再答對 ${egg.needed - egg.warmth} 題就孵化`}</p>
          </div>
        </div>
      ) : (
        <p className="egg-empty">連續答對或收服寵物，就有機會撿到蛋！</p>
      )}
    </div>
  );
}

function ProgressRail({ run, profile, onFeedFood }) {
  const summary = summarizeRun(run);
  const missionProgress = Math.min(5, run.correctCount);
  const outlineSubject = run.mode === 'mixed' ? run.question.subject : run.mode;
  const outline = CURRICULUM_OUTLINE[run.grade]?.[outlineSubject] || [];
  const leadPet = getStrongestPet(run.petDex);
  return (
    <aside className="progress-rail" aria-label="進度">
      <div className="panel-title">
        <span>訓練進度</span>
        <strong>Wave {run.wave}</strong>
      </div>
      <div className="wave-card">
        <div>
          <small>{GRADES[run.grade].name} · 第 {run.stageIndex + 1} 關</small>
          <strong>{STAGES[run.stageIndex]?.name || run.monster.habitat}</strong>
        </div>
        <div className="wave-orb">{run.waveInStage}/5</div>
      </div>
      <div className="outline-card">
        <div className="mission-head">
          <span>{MODES[outlineSubject].label}大綱</span>
          <strong>{run.question.domain}</strong>
        </div>
        <div className="outline-tags">
          {outline.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      <div className="mission">
        <div className="mission-head">
          <span>每日任務</span>
          <strong>{missionProgress}/5</strong>
        </div>
        <div className="meter" aria-label="每日任務進度">
          <span style={{ width: `${(missionProgress / 5) * 100}%` }} />
        </div>
        <p>連續答對 5 題，收集一枚星晶。</p>
      </div>
      <div className="mini-stats">
        <div>
          <span>答題</span>
          <strong>{run.answeredCount}</strong>
        </div>
        <div>
          <span>正確</span>
          <strong>{summary.accuracy}%</strong>
        </div>
        <div>
          <span>訂正</span>
          <strong>{summary.corrections}</strong>
        </div>
      </div>
      <div className="mini-stats">
        <div>
          <span>抓到</span>
          <strong>{summary.collected}/6</strong>
        </div>
        <div>
          <span>錯題</span>
          <strong>{run.wrongCount}</strong>
        </div>
        <div>
          <span>回鍋</span>
          <strong>{run.reviewQueue?.length || 0}</strong>
        </div>
      </div>
      <EggCard egg={run.currentEgg} />
      <FoodPack foodBag={run.foodBag} leadPet={leadPet} onFeedFood={onFeedFood} />
      <div className="collection-grid">
        {MONSTERS.map((monster) => {
          const owned = run.collection.includes(monster.id) || profile.collection.includes(monster.id);
          const pet = run.petDex?.[monster.id] || profile.petDex?.[monster.id];
          const stage = pet ? getPetStage(pet) : null;
          const displayName = owned && stage ? getEvolutionName(monster, stage.level) : monster.name;
          return (
            <div
              key={monster.id}
              className={owned ? 'collection-chip owned' : 'collection-chip'}
              title={owned && pet ? `${displayName} Lv.${stage.level} ${pet.accessory.label}` : monster.name}
              style={{ '--chip-scale': stage?.size || 0.86 }}
            >
              <span style={{ background: monster.colorA }} />
              <small>{owned ? displayName : '???'}</small>
              <em>{owned && pet ? `Lv.${stage.level} ${pet.accessory.label}` : '未收服'}</em>
              {pet?.skins?.length ? (
                <div className="skin-dots" aria-label="變色皮膚">
                  {pet.skins.map((skinId) => {
                    const skin = PET_SKINS_BY_ID[skinId];
                    return skin ? <i key={skinId} title={`${skin.label}色`} style={{ background: skin.colorA }} /> : null;
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="run-log">
        {run.log.slice(0, 4).map((entry, index) => (
          <div key={`${entry}-${index}`}>{entry}</div>
        ))}
      </div>
    </aside>
  );
}

function DamagePop({ pop }) {
  if (!pop) return null;
  return (
    <div key={pop.key} className={`damage-pop ${pop.crit ? 'crit' : ''}`} aria-hidden="true">
      -{pop.value}
      {pop.crit ? <small>連擊加成！</small> : null}
    </div>
  );
}

function CaptureFx({ fx }) {
  if (!fx) return null;
  return (
    <div key={fx.key} className="capture-fx" aria-hidden="true">
      <div className="capture-ball">
        <span className="ball-top" />
        <span className="ball-band" />
        <span className="ball-star">★</span>
      </div>
      <div className="capture-rings">
        <span />
        <span />
        <span />
      </div>
      <strong className="capture-text">收服成功！</strong>
    </div>
  );
}

function Arena({ run, lastImpact, petAction, burst, speechState, damagePop, captureFx, onPetInteract }) {
  const hpRatio = Math.max(0, run.monsterHp / run.monsterMaxHp);
  const boss = isBossWave(run.waveInStage);
  const activePet = run.petDex?.[run.monster.id];
  const activeStage = activePet ? getPetStage(activePet) : null;
  const leadPet = getStrongestPet(run.petDex);
  const leadMonsterBase = leadPet ? MONSTERS.find((monster) => monster.id === leadPet.id) : null;
  const leadStage = leadPet ? getPetStage(leadPet) : null;
  const friendMonsterId = leadPet?.id || 'companion';
  const friendAction = petAction && petAction.monsterId === friendMonsterId
    ? petAction.type
    : speechState === 'speaking'
      ? 'talk'
      : null;
  const leadMonster = leadMonsterBase
    ? applySkinToMonster(leadMonsterBase, leadPet.activeSkin)
    : null;
  const friend = leadMonster
    ? { ...leadMonster, name: `${getEvolutionName(leadMonsterBase, leadStage.level)} Lv.${leadStage.level}` }
    : {
      id: 'companion',
      name: '星芽夥伴',
      colorA: '#1f9d78',
      colorB: '#f7d154',
      colorC: '#ff8f6b',
    };
  const sceneStyle = {
    '--scene-a': run.monster.colorA,
    '--scene-b': run.monster.colorB,
    '--scene-c': run.monster.colorC,
  };

  return (
    <section
      className={`arena habitat-stage-${run.stageIndex} ${speechState === 'speaking' ? 'is-speaking' : ''} ${lastImpact === 'hit' ? 'is-shaking' : ''} ${boss ? 'is-boss-wave' : ''}`}
      aria-label="訓練場"
      style={sceneStyle}
    >
      <div className="parallax-scene" aria-hidden="true">
        <div className="parallax-layer layer-sky">
          <span className="drift-cloud cloud-a" />
          <span className="drift-cloud cloud-b" />
          <span className="drift-cloud cloud-c" />
          <span className="twinkle tw1" />
          <span className="twinkle tw2" />
          <span className="twinkle tw3" />
        </div>
        <div className="parallax-layer layer-far">
          <span className="hill h1" />
          <span className="hill h2" />
        </div>
        <div className="parallax-layer layer-mid">
          <span className="tree t1" />
          <span className="tree t2" />
          <span className="crystal c1" />
          <span className="crystal c2" />
          <span className="crystal c3" />
        </div>
      </div>
      <div className="monster-status opponent-status">
        <div>
          <strong>
            {boss ? <em className="boss-tag">BOSS</em> : null}
            {run.monster.name}
          </strong>
          <span>{run.monster.enName} · {run.monster.element} · 第 {run.waveInStage}/5 波</span>
        </div>
        <div className={boss ? 'hp-bar boss' : 'hp-bar'} aria-label="對手生命值">
          <span style={{ width: `${hpRatio * 100}%` }} />
        </div>
      </div>
      <MonsterFigure
        monster={run.monster}
        hpRatio={hpRatio}
        isHit={lastImpact === 'hit'}
        growth={(activeStage?.size || 1) * (boss ? 1.22 : 1)}
        accessory={activePet?.accessory}
        action={petAction?.monsterId === run.monster.id ? petAction.type : null}
        onInteract={() => onPetInteract(run.monster.id, 'opponent')}
        isBoss={boss}
      />
      <DamagePop pop={damagePop} />
      <CaptureFx fx={captureFx} />
      <div className="trainer-side">
        <MonsterFigure
          monster={friend}
          hpRatio={1}
          isFriend
          isHit={lastImpact === 'miss'}
          growth={leadStage ? Math.min(1.16, leadStage.size) : 1}
          accessory={leadPet?.accessory}
          action={friendAction}
          onInteract={() => onPetInteract(friendMonsterId, 'friend')}
          evoStage={leadStage?.evoStage || 0}
        />
        <div className={speechState === 'speaking' ? 'speech-chip is-speaking' : 'speech-chip'}>
          {run.feedback ? run.feedback.title : leadPet ? `${leadPet.accessory.label} ${leadStage.title}` : run.question.label}
        </div>
      </div>
      <RewardBurst burst={burst} />
      {petAction?.food ? (
        <div key={petAction.key} className={`feeding-treat tier-${petAction.food.tier}`}>
          <FoodIcon food={petAction.food} />
        </div>
      ) : null}
      <div className="ground">
        <span />
      </div>
    </section>
  );
}

function SpeechControls({
  question,
  answered,
  enabled,
  speechState,
  onToggle,
  onSpeakPrompt,
  onSpeakChoices,
  onSpeakPractice,
}) {
  if (question.subject !== 'english') return null;

  const stateText =
    speechState === 'ready'
      ? '可朗讀'
      : speechState === 'speaking'
        ? '朗讀中'
        : speechState === 'blocked'
          ? '再點一次'
          : speechState === 'unsupported'
            ? '瀏覽器不支援'
            : '按一下開始';

  return (
    <div className="speech-controls" aria-label="英文口說練習">
      <div className="speech-status">
        <span>口說練習</span>
        <strong>{stateText}</strong>
      </div>
      <div className="speech-buttons">
        <button type="button" className={enabled ? 'speech-toggle active' : 'speech-toggle'} onClick={onToggle}>
          {enabled ? '自動朗讀 ON' : '自動朗讀 OFF'}
        </button>
        <button type="button" onClick={onSpeakPrompt}>
          念題目
        </button>
        <button type="button" onClick={onSpeakChoices}>
          念選項
        </button>
        <button type="button" onClick={onSpeakPractice} disabled={!answered}>
          跟讀答案
        </button>
      </div>
    </div>
  );
}

function QuizPanel({
  run,
  speechEnabled,
  speechState,
  onSpeechToggle,
  onSpeakPrompt,
  onSpeakChoices,
  onSpeakPractice,
  onAnswer,
  onNext,
  onReset,
}) {
  const isAnswered = Boolean(run.answered);
  return (
    <aside className="quiz-panel" aria-label="題目">
      <div className="question-kind">
        <SubjectIcon subject={run.question.subject} />
        <span>{run.question.label}</span>
        <em>{run.question.domain}</em>
      </div>
      <div className="question-text">{run.question.prompt}</div>
      <SpeechControls
        question={run.question}
        answered={isAnswered}
        enabled={speechEnabled}
        speechState={speechState}
        onToggle={onSpeechToggle}
        onSpeakPrompt={onSpeakPrompt}
        onSpeakChoices={onSpeakChoices}
        onSpeakPractice={onSpeakPractice}
      />
      <div className="answer-grid">
        {run.question.choices.map((choice, index) => {
          const blocked = run.wrongChoices.includes(choice);
          const correct = isAnswered && choice === run.question.answer;
          const wrong = blocked && choice !== run.question.answer;
          return (
            <button
              key={`${choice}-${index}`}
              type="button"
              className={`answer-button ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`}
              onClick={() => onAnswer(choice)}
              disabled={isAnswered || blocked}
            >
              <span>{index + 1}</span>
              <strong>{choice}</strong>
            </button>
          );
        })}
      </div>
      <div className={run.feedback ? `feedback ${run.feedback.kind}` : 'feedback'}>
        {run.feedback ? (
          <>
            <strong>{run.feedback.title}</strong>
            <span>{run.feedback.detail}</span>
          </>
        ) : (
          <>
            <strong>提示槽</strong>
            <span>{run.retrying ? run.question.tip : '答對才可以攻擊並嘗試收服寵物。'}</span>
          </>
        )}
      </div>
      <div className="quiz-actions">
        <button type="button" className="secondary-action" onClick={onReset}>
          回地圖
        </button>
        <button type="button" className="primary-action" onClick={onNext} disabled={!isAnswered}>
          下一題
        </button>
      </div>
    </aside>
  );
}

function SoundControls({ enabled, audioState, onToggle, onTest }) {
  const buttonText = enabled ? '音效 ON' : '音效 OFF';
  const stateText =
    audioState === 'ready'
      ? '可播放'
      : audioState === 'checking'
        ? '播放中'
      : audioState === 'blocked'
        ? '再點試聽'
        : audioState === 'unsupported'
          ? '無音訊'
          : '試聽';

  return (
    <div className="sound-controls">
      <button type="button" className={enabled ? 'sound-button active' : 'sound-button'} onClick={onToggle}>
        {buttonText}
      </button>
      <button type="button" className="sound-test-button" onClick={onTest} disabled={!enabled}>
        {stateText}
      </button>
    </div>
  );
}

function TopBar({
  run,
  profile,
  soundEnabled,
  audioState,
  onSoundToggle,
  onSoundTest,
  onModeChange,
  onGradeChange,
  onDifficultyChange,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">四科</div>
        <div>
          <h1>國英數自然 Monster Trainer</h1>
          <span>國小期末抓寵複習</span>
        </div>
      </div>
      <ModeControls
        mode={run.mode}
        grade={run.grade}
        difficulty={run.difficulty}
        onModeChange={onModeChange}
        onGradeChange={onGradeChange}
        onDifficultyChange={onDifficultyChange}
      />
      <div className="stats">
        <SoundControls
          enabled={soundEnabled}
          audioState={audioState}
          onToggle={onSoundToggle}
          onTest={onSoundTest}
        />
        <div className="heart-row" aria-label="生命值">
          {Array.from({ length: run.maxHearts }, (_, index) => (
            <HeartIcon key={index} filled={index < run.hearts} />
          ))}
        </div>
        <StatPill label="連擊" value={run.streak} />
        <StatPill label="分數" value={run.score} />
        <StatPill label="最佳" value={Math.max(profile.bestScore, run.score)} />
      </div>
    </header>
  );
}

function EndOverlay({ run, onReset }) {
  if (run.phase !== 'gameover' && run.phase !== 'complete') return null;
  const summary = summarizeRun(run);

  return (
    <div className="end-overlay" role="dialog" aria-modal="true">
      <div className="end-card">
        <span className="end-kicker">{run.phase === 'complete' ? '訓練完成' : '本輪結束'}</span>
        <h2>{run.phase === 'complete' ? '星晶滿格' : '再來一輪會更穩'}</h2>
        <div className="summary-grid">
          <StatPill label="分數" value={summary.score} />
          <StatPill label="答對率" value={`${summary.accuracy}%`} />
          <StatPill label="最佳連擊" value={summary.bestStreak} />
          <StatPill label="收集" value={summary.collected} />
        </div>
        <button type="button" className="primary-action" onClick={onReset}>
          開新訓練
        </button>
      </div>
    </div>
  );
}

function StageStars({ stars, animated = false }) {
  return (
    <div className={animated ? 'stage-stars animated' : 'stage-stars'} aria-label={`${stars} 顆星`}>
      {[1, 2, 3].map((slot) => (
        <span key={slot} className={slot <= stars ? 'star filled' : 'star'} style={{ '--star-delay': `${slot * 260}ms` }}>
          ★
        </span>
      ))}
    </div>
  );
}

function MapScreen({ profile, grade, onSelectStage }) {
  return (
    <div className="map-screen" role="dialog" aria-modal="true" aria-label="冒險地圖">
      <div className="map-sky" aria-hidden="true">
        <span className="drift-cloud cloud-a" />
        <span className="drift-cloud cloud-b" />
        <span className="twinkle tw1" />
        <span className="twinkle tw2" />
      </div>
      <div className="map-head">
        <h2>糖果世界冒險地圖</h2>
        <p>{GRADES[grade].name}．每一關 5 波，第 5 波是 BOSS！</p>
      </div>
      <div className="map-path">
        {STAGES.map((stage, index) => {
          const monster = MONSTERS[index];
          const stars = profile.mapProgress?.[stage.id] || 0;
          const unlocked = isStageUnlocked(index, profile.mapProgress);
          return (
            <button
              key={stage.id}
              type="button"
              className={`map-node ${unlocked ? 'unlocked' : 'locked'} ${stars > 0 ? 'cleared' : ''}`}
              style={{ '--node-a': monster.colorA, '--node-b': monster.colorB, '--node-c': monster.colorC }}
              onClick={() => unlocked && onSelectStage(index)}
              disabled={!unlocked}
            >
              <span className="node-orb">
                {unlocked ? index + 1 : '🔒'}
              </span>
              <strong>{stage.name}</strong>
              <em>{unlocked ? `BOSS：${monster.name}` : '先通過上一關'}</em>
              <StageStars stars={stars} />
            </button>
          );
        })}
      </div>
      <p className="map-hint">點關卡開始！答對攻擊怪物，打贏 BOSS 就過關拿星星。</p>
    </div>
  );
}

function StageClearOverlay({ run, onBackToMap, onNextStage, onRetry }) {
  if (run.phase !== 'cleared') return null;
  const summary = summarizeRun(run);
  const stage = STAGES[run.stageIndex];
  const hasNext = run.stageIndex < STAGES.length - 1;

  return (
    <div className="end-overlay stage-clear" role="dialog" aria-modal="true">
      <div className="end-card">
        <span className="end-kicker">第 {run.stageIndex + 1} 關完成</span>
        <h2>{stage?.name} 過關！</h2>
        <StageStars stars={run.stageStars} animated />
        <div className="summary-grid">
          <StatPill label="分數" value={summary.score} />
          <StatPill label="答對率" value={`${summary.accuracy}%`} />
          <StatPill label="最佳連擊" value={summary.bestStreak} />
          <StatPill label="訂正" value={summary.corrections} />
        </div>
        <div className="clear-actions">
          <button type="button" className="secondary-action" onClick={onRetry}>
            再挑戰拿三星
          </button>
          {hasNext ? (
            <button type="button" className="primary-action" onClick={onNextStage}>
              前往下一關
            </button>
          ) : (
            <button type="button" className="primary-action" onClick={onBackToMap}>
              回地圖
            </button>
          )}
        </div>
        <button type="button" className="map-link" onClick={onBackToMap}>
          回冒險地圖
        </button>
      </div>
    </div>
  );
}

function EvolutionOverlay({ fx, onDismiss }) {
  if (!fx) return null;
  return (
    <div key={fx.key} className="evolution-overlay" role="dialog" aria-modal="true" onClick={onDismiss}>
      <div className="evolution-card">
        <span className="end-kicker">進化！</span>
        <div className="evolution-figure">
          <MonsterFigure monster={fx.monster} hpRatio={1} isFriend growth={1.25} accessory={fx.accessory} evoStage={fx.evoStage} />
        </div>
        <h2>
          {fx.fromName} <i>➜</i> {fx.toName}
        </h2>
        <p>{fx.title}，變得更強更可愛了！</p>
        <button type="button" className="primary-action" onClick={onDismiss}>
          太棒了！
        </button>
      </div>
    </div>
  );
}

function HatchOverlay({ fx, onDismiss }) {
  if (!fx) return null;
  return (
    <div key={fx.key} className="hatch-overlay" role="dialog" aria-modal="true" onClick={onDismiss}>
      <div className="hatch-card">
        <span className="end-kicker">蛋孵化了！</span>
        <div className="hatch-figure">
          <MonsterFigure monster={fx.monster} hpRatio={1} isFriend growth={1.18} />
        </div>
        <h2>
          <b className={`skin-tag skin-${fx.skin.id}`}>{fx.skin.label}色</b>
          {fx.monsterName}
        </h2>
        <p>
          {fx.isNewMonster ? '而且是還沒收服過的新夥伴！' : `稀有度：${fx.skin.rarity}，已加入圖鑑。`}
        </p>
        <button type="button" className="primary-action" onClick={onDismiss}>
          收下夥伴
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [run, setRun] = useState(() => {
    const savedProfile = loadProfile();
    return createInitialRun({
      mode: 'mixed',
      grade: 'grade2',
      difficulty: 'sprout',
      savedCollection: savedProfile.collection,
      savedPetDex: savedProfile.petDex,
      savedFoodBag: savedProfile.foodBag,
      phase: 'map',
    });
  });
  const [lastImpact, setLastImpact] = useState(null);
  const [petAction, setPetAction] = useState(null);
  const [burst, setBurst] = useState(null);
  const [damagePop, setDamagePop] = useState(null);
  const [captureFx, setCaptureFx] = useState(null);
  const [evolutionFx, setEvolutionFx] = useState(null);
  const [hatchFx, setHatchFx] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioState, setAudioState] = useState('idle');
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speechState, setSpeechState] = useState('idle');
  const soundEngineRef = useRef(null);
  const soundNeedsUnlockRef = useRef(false);
  const speechEngineRef = useRef(null);
  const speechNeedsUnlockRef = useRef(false);
  const petActionTimeoutRef = useRef(null);
  const burstTimeoutRef = useRef(null);
  const damagePopTimeoutRef = useRef(null);
  const captureFxTimeoutRef = useRef(null);
  const pendingHatchRef = useRef(null);

  const showDamagePop = useCallback((pop, duration = 920) => {
    window.clearTimeout(damagePopTimeoutRef.current);
    const keyed = { ...pop, key: `damage-${Date.now()}` };
    setDamagePop(keyed);
    damagePopTimeoutRef.current = window.setTimeout(() => {
      setDamagePop((current) => (current?.key === keyed.key ? null : current));
    }, duration);
  }, []);

  const showCaptureFx = useCallback((duration = 2100) => {
    window.clearTimeout(captureFxTimeoutRef.current);
    const keyed = { key: `capture-${Date.now()}` };
    setCaptureFx(keyed);
    captureFxTimeoutRef.current = window.setTimeout(() => {
      setCaptureFx((current) => (current?.key === keyed.key ? null : current));
    }, duration);
  }, []);

  const showPetAction = useCallback((action, duration = 920) => {
    if (!action?.type) return;
    window.clearTimeout(petActionTimeoutRef.current);
    const keyedAction = { ...action, key: action.key || `${action.type}-${Date.now()}` };
    setPetAction(keyedAction);
    petActionTimeoutRef.current = window.setTimeout(() => {
      setPetAction((current) => (current?.key === keyedAction.key ? null : current));
    }, duration);
  }, []);

  const showBurst = useCallback((event, duration = 960) => {
    if (!event?.type) return;
    window.clearTimeout(burstTimeoutRef.current);
    const keyedEvent = { ...event, key: event.key || `${event.type}-${Date.now()}` };
    setBurst(keyedEvent);
    burstTimeoutRef.current = window.setTimeout(() => {
      setBurst((current) => (current?.key === keyedEvent.key ? null : current));
    }, duration);
  }, []);

  const playSound = useCallback(async (kind, options = {}) => {
    if (!options.force && !soundEnabled) return false;
    if (!options.force && soundNeedsUnlockRef.current) return false;
    if (typeof window === 'undefined') return false;

    if (!soundEngineRef.current) {
      soundEngineRef.current = createSoundEngine();
    }

    try {
      setAudioState('checking');
      const result = await soundEngineRef.current.play(kind);
      soundNeedsUnlockRef.current = !result.ok;
      setAudioState(result.ok ? 'ready' : result.state);
      return result.ok;
    } catch {
      soundNeedsUnlockRef.current = true;
      setAudioState('blocked');
      return false;
    }
  }, [soundEnabled]);

  const speakEnglish = useCallback(async (text, options = {}) => {
    const cleanText = String(text || '').trim();
    if (!cleanText) return false;
    if (!options.force && !speechEnabled) return false;
    if (!options.force && speechNeedsUnlockRef.current) return false;
    if (typeof window === 'undefined') return false;

    if (!speechEngineRef.current) {
      speechEngineRef.current = createSpeechEngine();
    }

    try {
      if (options.cue !== false) void playSound('speak');
      setSpeechState('speaking');
      const result = await speechEngineRef.current.speak(cleanText, {
        rate: options.rate ?? 0.88,
        pitch: options.pitch ?? 1.05,
      });
      speechNeedsUnlockRef.current = !result.ok;
      setSpeechState(result.state);
      return result.ok;
    } catch {
      speechNeedsUnlockRef.current = true;
      setSpeechState('blocked');
      return false;
    }
  }, [playSound, speechEnabled]);

  const speakCurrentPrompt = useCallback((options = {}) => {
    speechNeedsUnlockRef.current = false;
    return speakEnglish(run.question.speechPrompt, { force: true, ...options });
  }, [run.question.speechPrompt, speakEnglish]);

  const speakCurrentChoices = useCallback(() => {
    speechNeedsUnlockRef.current = false;
    return speakEnglish(`Listen to the choices. ${run.question.choices.join('. ')}.`, { force: true, rate: 0.82 });
  }, [run.question.choices, speakEnglish]);

  const speakCurrentPractice = useCallback(() => {
    speechNeedsUnlockRef.current = false;
    return speakEnglish(run.question.practiceText || run.question.answer, { force: true, rate: 0.78 });
  }, [run.question.answer, run.question.practiceText, speakEnglish]);

  const saveRunProfile = (nextRun, stageStarsUpdate = null) => {
    const collection = [...new Set([...profile.collection, ...nextRun.collection])];
    const mapProgress = { ...profile.mapProgress };
    if (stageStarsUpdate) {
      Object.entries(stageStarsUpdate).forEach(([stageId, stars]) => {
        mapProgress[stageId] = Math.max(mapProgress[stageId] || 0, stars);
      });
    }
    const nextProfile = {
      bestScore: Math.max(profile.bestScore, nextRun.score),
      collection,
      petDex: normalizePetDex({ ...profile.petDex, ...nextRun.petDex }, collection),
      foodBag: normalizeFoodBag(nextRun.foodBag),
      mapProgress: normalizeMapProgress(mapProgress),
      sessions: profile.sessions + (nextRun.phase === 'playing' ? 0 : 1),
    };
    setProfile(nextProfile);
    saveProfile(nextProfile);
    return nextProfile;
  };

  const clearTransientFx = () => {
    setLastImpact(null);
    setPetAction(null);
    setBurst(null);
    setDamagePop(null);
    setCaptureFx(null);
    setEvolutionFx(null);
    setHatchFx(null);
    pendingHatchRef.current = null;
    window.clearTimeout(petActionTimeoutRef.current);
    window.clearTimeout(burstTimeoutRef.current);
    window.clearTimeout(damagePopTimeoutRef.current);
    window.clearTimeout(captureFxTimeoutRef.current);
    speechEngineRef.current?.cancel();
  };

  const resetRun = (mode = run.mode, grade = run.grade, difficulty = run.difficulty, { phase = 'map', stageIndex = 0 } = {}) => {
    clearTransientFx();
    setRun(createInitialRun({
      mode,
      grade,
      difficulty,
      savedCollection: profile.collection,
      savedPetDex: profile.petDex,
      savedFoodBag: profile.foodBag,
      phase,
      stageIndex,
    }));
  };

  const startStage = (stageIndex) => {
    void playSound('select');
    resetRun(run.mode, run.grade, run.difficulty, { phase: 'playing', stageIndex });
  };

  const backToMap = () => {
    void playSound('next');
    resetRun(run.mode, run.grade, run.difficulty, { phase: 'map', stageIndex: 0 });
  };

  const changeMode = (mode) => {
    void playSound('select');
    resetRun(mode, run.grade, run.difficulty);
  };
  const changeGrade = (grade) => {
    void playSound('select');
    resetRun(run.mode, grade, run.difficulty);
  };
  const changeDifficulty = (difficulty) => {
    void playSound('select');
    resetRun(run.mode, run.grade, difficulty);
  };

  const answerQuestion = (choice) => {
    if (run.answered || run.phase !== 'playing') return;

    const correct = choice === run.question.answer;
    if (!correct) {
      void playSound('wrong');
      window.setTimeout(() => void playSound('retry'), 170);
      const leadPet = getStrongestPet(run.petDex);
      if (leadPet) showPetAction({ type: 'sad', monsterId: leadPet.id }, 760);
      showBurst({ type: 'wrong', label: '再想一下' }, 820);
      setLastImpact('miss');
      window.setTimeout(() => setLastImpact(null), 420);
      const currentQueue = run.reviewQueue || [];
      const reviewId = run.question.originalId || run.question.id;
      const shouldQueueReview = !currentQueue.some((item) => item.originalId === reviewId);
      const nextReviewQueue = shouldQueueReview
        ? [...currentQueue, makeReviewItem(run.question)].slice(-6)
        : currentQueue;
      setRun({
        ...run,
        hearts: Math.max(1, run.hearts - 1),
        streak: 0,
        energy: Math.max(0, run.energy - 10),
        stageWrong: (run.stageWrong || 0) + (run.wrongChoices.length === 0 ? 1 : 0),
        wrongCount: run.wrongCount + 1,
        wrongChoices: [...new Set([...run.wrongChoices, choice])],
        reviewQueue: nextReviewQueue,
        retrying: true,
        feedback: {
          kind: 'bad',
          title: '再試一次',
          detail: `${run.question.tip} 這題要改到答對，寵物才會靠近。`,
        },
        log: [
          shouldQueueReview ? `回鍋排程：${run.question.domain}` : `訂正中：${choice}`,
          ...run.log,
        ].slice(0, 6),
      });
      return;
    }

    const damage = correct
      ? calculateDamage({ streak: run.streak + 1, level: run.level, subject: run.question.subject, retrying: run.retrying })
      : 0;
    const nextHp = Math.max(0, run.monsterHp - damage);
    const nextHearts = Math.min(run.maxHearts, run.hearts + (run.retrying ? 0 : 1));
    const nextStreak = correct ? run.streak + 1 : 0;
    const scoreGain = correct ? Math.max(35, 90 + run.level * 12 + run.streak * 18 - run.wrongChoices.length * 18) : 0;
    const nextCollection = nextHp === 0 ? [...new Set([...run.collection, run.monster.id])] : run.collection;
    const alreadyOwned = run.collection.includes(run.monster.id) || profile.collection.includes(run.monster.id);
    const petXpGain = nextHp === 0 ? (run.retrying ? 3 : 4) : alreadyOwned ? 1 : 0;
    const previousPet = run.petDex?.[run.monster.id];
    const previousPetStage = previousPet ? getPetStage(previousPet) : null;
    const nextPetDex = petXpGain > 0 ? growPetDex(run.petDex, run.monster.id, petXpGain) : run.petDex;
    const rewardFood = chooseFoodReward({
      scoreGain,
      streak: nextStreak,
      caught: nextHp === 0,
      retrying: run.retrying,
    });
    const nextFoodBag = addFoodToBag(run.foodBag, rewardFood.id, 1);

    let nextEgg = run.currentEgg ? warmEgg(run.currentEgg, 1) : null;
    let hatchResult = null;
    let petDexWithSkins = nextPetDex;
    let collectionAfterHatch = nextCollection;
    if (isEggReady(nextEgg)) {
      hatchResult = hatchEgg(nextEgg);
      petDexWithSkins = addSkinToPet(nextPetDex, hatchResult.monsterId, hatchResult.skin.id);
      collectionAfterHatch = [...new Set([...nextCollection, hatchResult.monsterId])];
      nextEgg = null;
    } else if (!nextEgg) {
      nextEgg = maybeDropEgg({
        currentEgg: null,
        scoreGain,
        streak: nextStreak,
        caught: nextHp === 0,
        retrying: run.retrying,
      });
    }

    const activePet = petDexWithSkins[run.monster.id];
    const activePetStage = activePet ? getPetStage(activePet) : null;
    const leveledUp = Boolean(previousPetStage && activePetStage && activePetStage.level > previousPetStage.level);
    const evolved = Boolean(previousPetStage && activePetStage && activePetStage.evoStage > previousPetStage.evoStage);
    const rareFood = rewardFood.tier >= 3;
    const leadPet = getStrongestPet(petDexWithSkins);
    const growthText = activePetStage
      ? ` 寵物成長：${activePetStage.title} Lv.${activePetStage.level}，裝飾：${activePet.accessory.label}。`
      : '';
    const foodText = ` 得到點心：${rewardFood.label}。`;
    const eggText = hatchResult
      ? ` 蛋孵化了：${hatchResult.skin.label}色夥伴！`
      : nextEgg && !run.currentEgg
        ? ` 撿到${nextEgg.label}！`
        : '';

    showDamagePop({ value: damage, crit: nextStreak >= 3 });
    if (nextHp === 0) showCaptureFx();
    void playSound(nextHp === 0 ? 'catch' : nextStreak > 0 && nextStreak % 3 === 0 ? 'combo' : 'good');
    if (rareFood) window.setTimeout(() => void playSound('rare'), 210);
    if (leveledUp) window.setTimeout(() => void playSound('level'), 360);
    if (hatchResult) window.setTimeout(() => void playSound('rare'), 520);

    if (evolved) {
      const monsterBase = MONSTERS.find((item) => item.id === run.monster.id);
      window.setTimeout(() => {
        void playSound('level');
        setEvolutionFx({
          key: `evo-${Date.now()}`,
          monster: applySkinToMonster(monsterBase, activePet.activeSkin),
          accessory: activePet.accessory,
          evoStage: activePetStage.evoStage,
          fromName: getEvolutionName(monsterBase, previousPetStage.level),
          toName: getEvolutionName(monsterBase, activePetStage.level),
          title: activePetStage.title,
        });
      }, nextHp === 0 ? 1500 : 600);
    }

    if (hatchResult) {
      const hatchedBase = MONSTERS.find((item) => item.id === hatchResult.monsterId);
      const hatchFxPayload = {
        key: `hatch-${Date.now()}`,
        monster: applySkinToMonster(hatchedBase, hatchResult.skin.id),
        monsterName: hatchedBase.name,
        skin: hatchResult.skin,
        isNewMonster: !nextCollection.includes(hatchResult.monsterId),
      };
      if (evolved) {
        pendingHatchRef.current = hatchFxPayload;
      } else {
        window.setTimeout(() => setHatchFx(hatchFxPayload), nextHp === 0 ? 1700 : 700);
      }
    }
    showBurst({
      type: nextHp === 0 ? 'catch' : leveledUp ? 'level' : rareFood ? 'rare' : 'correct',
      label: nextHp === 0
        ? '收服成功'
        : leveledUp
          ? `升到 Lv.${activePetStage.level}`
          : rareFood
            ? '高級點心'
            : nextStreak >= 3
              ? `連擊 x${nextStreak}`
              : '答對',
      food: rareFood ? rewardFood : null,
    }, rareFood || nextHp === 0 || leveledUp ? 1180 : 900);
    if (nextHp === 0) {
      showPetAction({ type: 'cheer', monsterId: run.monster.id }, 1040);
    } else if (leadPet) {
      showPetAction({ type: nextStreak >= 3 ? 'cheer' : 'attack', monsterId: leadPet.id }, 860);
    }
    setLastImpact('hit');
    window.setTimeout(() => setLastImpact(null), 420);

    const nextRun = {
      ...run,
      answered: choice,
      wrongChoices: run.wrongChoices,
      retrying: false,
      monsterHp: nextHp,
      hearts: nextHearts,
      score: run.score + scoreGain,
      streak: nextStreak,
      bestStreak: Math.max(run.bestStreak, nextStreak),
      energy: correct ? Math.min(100, run.energy + 18 + nextStreak * 2) : Math.max(0, run.energy - 16),
      answeredCount: run.answeredCount + 1,
      correctCount: run.correctCount + 1,
      correctionCount: run.correctionCount + (run.wrongChoices.length > 0 ? 1 : 0),
      collection: collectionAfterHatch,
      petDex: petDexWithSkins,
      foodBag: nextFoodBag,
      currentEgg: nextEgg,
      phase: run.phase,
      feedback: {
        kind: 'good',
        title: nextHp === 0
          ? `收服成功：${run.monster.name} Lv.${activePetStage?.level || 1}`
          : run.question.review
            ? `回鍋答對 +${damage}`
            : run.wrongChoices.length > 0
              ? `訂正成功 +${damage}`
              : `命中 +${damage}`,
        detail: `${run.question.explanation}${growthText}${foodText}${eggText}`,
      },
      log: [
        hatchResult
          ? `孵化：${hatchResult.skin.label}色${MONSTERS.find((item) => item.id === hatchResult.monsterId)?.name || '夥伴'}`
          : nextHp === 0
            ? `抓到：${run.monster.name}｜${activePet?.accessory.label || '新裝飾'}`
            : run.question.review
              ? `回鍋答對：${run.question.answer}`
              : `答對：${run.question.answer}`,
        nextEgg && !run.currentEgg ? `撿到：${nextEgg.label}` : `得到：${rewardFood.label}`,
        ...run.log,
      ].slice(0, 6),
    };

    setRun(nextRun);
    saveRunProfile(nextRun);
    if (nextRun.question.subject === 'english') {
      window.setTimeout(() => {
        void speakEnglish(nextRun.question.practiceText || nextRun.question.answer, { rate: 0.78 });
      }, 160);
    }
  };

  const feedLeadPet = (foodId) => {
    const leadPet = getStrongestPet(run.petDex);
    const amount = run.foodBag?.[foodId] || 0;
    if (!leadPet || amount <= 0) return;

    const previousStage = getPetStage(leadPet);
    const result = feedPetWithFood(run.petDex, leadPet.id, foodId);
    const nextFoodBag = addFoodToBag(run.foodBag, foodId, -1);
    const monster = MONSTERS.find((item) => item.id === leadPet.id);
    const leveledUp = result.stage.level > previousStage.level;
    const evolved = result.stage.evoStage > previousStage.evoStage;
    const rareFood = result.food.tier >= 3;

    if (evolved) {
      window.setTimeout(() => {
        void playSound('level');
        setEvolutionFx({
          key: `evo-feed-${Date.now()}`,
          monster: applySkinToMonster(monster, result.pet.activeSkin),
          accessory: result.pet.accessory,
          evoStage: result.stage.evoStage,
          fromName: getEvolutionName(monster, previousStage.level),
          toName: getEvolutionName(monster, result.stage.level),
          title: result.stage.title,
        });
      }, 620);
    }
    const nextRun = {
      ...run,
      petDex: result.petDex,
      foodBag: nextFoodBag,
      feedback: {
        kind: 'good',
        title: `${monster?.name || '夥伴'}吃了${result.food.label}`,
        detail: `成長經驗 +${result.food.xp}，現在是 ${result.stage.title} Lv.${result.stage.level}。`,
      },
      log: [
        `餵食：${result.food.label} +${result.food.xp}`,
        ...run.log,
      ].slice(0, 6),
    };

    void playSound(leveledUp ? 'level' : 'feed');
    if (rareFood && !leveledUp) window.setTimeout(() => void playSound('rare'), 180);
    setRun(nextRun);
    saveRunProfile(nextRun);
    showBurst({
      type: leveledUp ? 'level' : rareFood ? 'rare' : 'feed',
      label: leveledUp ? `長大 Lv.${result.stage.level}` : result.food.label,
      food: result.food,
    }, leveledUp || rareFood ? 1180 : 980);
    showPetAction({
      type: 'eat',
      monsterId: leadPet.id,
      food: result.food,
    }, 1100);
  };

  const interactWithPet = (monsterId, source) => {
    const monster = monsterId === 'companion'
      ? { id: 'companion', name: '星芽夥伴' }
      : MONSTERS.find((item) => item.id === monsterId) || run.monster;
    const friendly = source === 'friend';
    const actionType = friendly ? 'cheer' : 'poke';

    void playSound('poke');
    showPetAction({ type: actionType, monsterId }, friendly ? 940 : 820);
    showBurst({
      type: 'heart',
      label: friendly ? '摸摸' : '打招呼',
    }, 900);

    setRun((current) => ({
      ...current,
      feedback: {
        kind: 'good',
        title: `${monster.name} 回應你`,
        detail: friendly
          ? '牠開心地跳了一下，等你答對題目再餵牠更好的點心。'
          : '牠眨眨眼靠近一點，答對題目就有機會收服牠。',
      },
      log: [
        friendly ? `互動：摸摸${monster.name}` : `互動：向${monster.name}打招呼`,
        ...current.log,
      ].slice(0, 6),
    }));
  };

  const nextQuestion = () => {
    if (!run.answered || run.phase !== 'playing') return;

    speechEngineRef.current?.cancel();
    const defeated = run.monsterHp <= 0;

    if (defeated && isBossWave(run.waveInStage)) {
      const stars = computeStageStars({ stageWrong: run.stageWrong || 0 });
      const clearedRun = {
        ...run,
        phase: 'cleared',
        stageStars: stars,
        answered: run.answered,
        feedback: null,
      };
      void playSound('level');
      window.setTimeout(() => void playSound('rare'), 320);
      setRun(clearedRun);
      saveRunProfile(clearedRun, { [STAGES[run.stageIndex].id]: stars });
      return;
    }

    const nextWaveInStage = defeated ? run.waveInStage + 1 : run.waveInStage;
    const nextMonster = defeated ? getStageMonster(run.stageIndex, nextWaveInStage) : run.monster;
    const globalWave = run.stageIndex * 5 + nextWaveInStage;
    const bossNext = isBossWave(nextWaveInStage);
    const nextLevel = defeated || run.correctCount > 0 && run.correctCount % 4 === 0 ? run.level + 1 : run.level;
    const nextMaxHp = defeated
      ? getMonsterHp(nextMonster, globalWave, run.difficulty, { boss: bossNext })
      : run.monsterMaxHp;
    const agedReviewQueue = (run.reviewQueue || []).map((item) => ({ ...item, dueIn: item.dueIn - 1 }));
    const dueReviewIndex = agedReviewQueue.findIndex((item) => item.dueIn <= 0);
    const nextReviewQueue = [...agedReviewQueue];
    const reviewItem = dueReviewIndex >= 0 ? nextReviewQueue.splice(dueReviewIndex, 1)[0] : null;
    const nextGeneratedQuestion = reviewItem
      ? makeReviewQuestion(reviewItem.question, run.answeredCount)
      : generateQuestion({
        mode: run.mode,
        grade: run.grade,
        level: nextLevel,
        wave: globalWave,
        streak: run.streak,
        difficulty: run.difficulty,
        answeredCount: run.answeredCount,
      });
    void playSound(defeated ? 'catch' : 'next');
    const nextRun = {
      ...run,
      phase: 'playing',
      wave: globalWave,
      waveInStage: nextWaveInStage,
      level: nextLevel,
      monster: nextMonster,
      monsterMaxHp: nextMaxHp,
      monsterHp: defeated ? nextMaxHp : run.monsterHp,
      question: nextGeneratedQuestion,
      answered: null,
      wrongChoices: [],
      reviewQueue: nextReviewQueue,
      retrying: false,
      feedback: null,
      log: [
        reviewItem
          ? '錯題回鍋出現'
          : defeated
            ? bossNext
              ? `BOSS ${nextMonster.name} 出現！`
              : `${nextMonster.name} 出現`
            : '下一題',
        ...run.log,
      ].slice(0, 6),
    };

    setRun(nextRun);
  };

  useEffect(() => {
    const handler = (event) => {
      if (!['1', '2', '3', '4'].includes(event.key)) return;
      const index = Number(event.key) - 1;
      const choice = run.question.choices[index];
      if (choice) answerQuestion(choice);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [run]);

  useEffect(() => {
    if (run.phase !== 'playing' || run.question.subject !== 'english') return undefined;
    void speakEnglish(run.question.speechPrompt, { rate: 0.86, cue: false });
    return () => {
      speechEngineRef.current?.cancel();
    };
  }, [run.phase, run.question.id, run.question.subject, run.question.speechPrompt, speakEnglish]);

  useEffect(() => () => {
    window.clearTimeout(petActionTimeoutRef.current);
    window.clearTimeout(burstTimeoutRef.current);
    window.clearTimeout(damagePopTimeoutRef.current);
    window.clearTimeout(captureFxTimeoutRef.current);
    speechEngineRef.current?.cancel();
  }, []);

  const dismissEvolution = () => {
    setEvolutionFx(null);
    if (pendingHatchRef.current) {
      const pending = pendingHatchRef.current;
      pendingHatchRef.current = null;
      window.setTimeout(() => setHatchFx(pending), 220);
    }
  };

  const energyStyle = useMemo(() => ({ width: `${run.energy}%` }), [run.energy]);

  return (
    <div className="app-shell">
      <TopBar
        run={run}
        profile={profile}
        soundEnabled={soundEnabled}
        audioState={audioState}
        onSoundToggle={() => {
          const nextEnabled = !soundEnabled;
          setSoundEnabled(nextEnabled);
          if (nextEnabled) {
            soundNeedsUnlockRef.current = false;
            void playSound('test', { force: true });
          }
        }}
        onSoundTest={() => {
          soundNeedsUnlockRef.current = false;
          void playSound('test', { force: true });
        }}
        onModeChange={changeMode}
        onGradeChange={changeGrade}
        onDifficultyChange={changeDifficulty}
      />
      <div className="energy-strip" aria-label="能量">
        <span style={energyStyle} />
      </div>
      <main className="game-layout">
        <ProgressRail run={run} profile={profile} onFeedFood={feedLeadPet} />
        <Arena
          run={run}
          lastImpact={lastImpact}
          petAction={petAction}
          burst={burst}
          speechState={speechState}
          damagePop={damagePop}
          captureFx={captureFx}
          onPetInteract={interactWithPet}
        />
        <QuizPanel
          run={run}
          speechEnabled={speechEnabled}
          speechState={speechState}
          onSpeechToggle={() => {
            const nextEnabled = !speechEnabled;
            setSpeechEnabled(nextEnabled);
            if (nextEnabled && run.question.subject === 'english') {
              speechNeedsUnlockRef.current = false;
              void speakEnglish(run.question.speechPrompt, { force: true, rate: 0.86 });
            }
          }}
          onSpeakPrompt={() => void speakCurrentPrompt({ rate: 0.86 })}
          onSpeakChoices={() => void speakCurrentChoices()}
          onSpeakPractice={() => void speakCurrentPractice()}
          onAnswer={answerQuestion}
          onNext={nextQuestion}
          onReset={backToMap}
        />
      </main>
      {run.phase === 'map' ? (
        <MapScreen profile={profile} grade={run.grade} onSelectStage={startStage} />
      ) : null}
      <StageClearOverlay
        run={run}
        onBackToMap={backToMap}
        onNextStage={() => startStage(Math.min(STAGES.length - 1, run.stageIndex + 1))}
        onRetry={() => startStage(run.stageIndex)}
      />
      <EvolutionOverlay fx={evolutionFx} onDismiss={dismissEvolution} />
      <HatchOverlay fx={hatchFx} onDismiss={() => setHatchFx(null)} />
      <EndOverlay run={run} onReset={backToMap} />
    </div>
  );
}
