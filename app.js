(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const intro = $('#intro');
  const app = $('#app');
  const cursor = $('#cursor');
  const orbit = $('#orbit');
  const canvas = $('#worldCanvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const meta = $('#cardMeta');
  const menu = $('#menu');
  const menuToggle = $('#menuToggle');
  const soundToggle = $('#soundToggle');
  const holdOverlay = $('#holdOverlay');
  const hint = $('#dragHint');

  const state = {
    started: false,
    currentView: 'home',
    sound: true,
    audioContext: null,
    drone: null,
    raf: 0,
    mouse: { x: 0, y: 0, targetX: 0, targetY: 0 },
    world: { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 },
    drag: { active: false, x: 0, y: 0, yaw: 0, pitch: 0, vx: 0, vy: 0 },
    holdTimer: null,
    lastFrame: performance.now()
  };

  const cardBaseTransforms = [
    'rotate(-3deg)',
    'rotate(2deg)',
    'rotate(1deg)',
    'rotate(-2deg)',
    'translate(-50%,-50%) rotate(3deg)'
  ];
  const cardDepth = [.9, 1.1, .8, 1.3, 1];

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startAmbient() {
    if (state.audioContext) {
      if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
      return;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Web Audio unavailable');
      const audioContext = new AudioContext();
      const low = audioContext.createOscillator();
      const high = audioContext.createOscillator();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();

      low.type = 'sine';
      low.frequency.value = 52;
      high.type = 'triangle';
      high.frequency.value = 78;
      filter.type = 'lowpass';
      filter.frequency.value = 150;
      gain.gain.value = .017;

      low.connect(filter);
      high.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      low.start();
      high.start();

      state.audioContext = audioContext;
      state.drone = { low, high, gain };
    } catch (_) {
      state.sound = false;
      soundToggle.classList.add('is-muted');
    }
  }

  function setSound(enabled) {
    state.sound = Boolean(enabled);
    soundToggle.classList.toggle('is-muted', !state.sound);
    soundToggle.setAttribute('aria-pressed', String(state.sound));
    if (state.sound && !state.audioContext) startAmbient();
    if (state.drone && state.audioContext) {
      state.drone.gain.gain.setTargetAtTime(state.sound ? .017 : 0, state.audioContext.currentTime, .08);
    }
  }

  function enter(withAudio) {
    if (state.started) return;
    state.started = true;
    setSound(withAudio);
    app.classList.add('is-ready');
    app.setAttribute('aria-hidden', 'false');
    intro.classList.add('is-leaving');
    setTimeout(() => intro.remove(), 1250);
    state.lastFrame = performance.now();
    state.raf = requestAnimationFrame(frame);
  }

  function drawWorld() {
    const w = innerWidth;
    const h = innerHeight;
    const cx = w * .5;
    const cy = h * .5;
    const radius = Math.min(w, h) * (w < 700 ? .33 : .38);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);

    const glow = ctx.createRadialGradient(0, 0, radius * .2, 0, 0, radius * 1.35);
    glow.addColorStop(0, 'rgba(255,255,255,.04)');
    glow.addColorStop(.62, 'rgba(255,255,255,.012)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.115)';
    ctx.lineWidth = .55;

    for (let lat = -70; lat <= 70; lat += 14) {
      const latitude = lat * Math.PI / 180;
      const ringRadius = radius * Math.cos(latitude);
      const baseY = radius * Math.sin(latitude) * Math.cos(state.world.pitch);
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const p = i / 100 * Math.PI * 2 + state.world.yaw;
        const x = Math.cos(p) * ringRadius;
        const z = Math.sin(p) * ringRadius;
        const y = baseY + z * Math.sin(state.world.pitch) * .36;
        const scale = 1 + z / radius * .08;
        if (i === 0) ctx.moveTo(x * scale, y * scale);
        else ctx.lineTo(x * scale, y * scale);
      }
      ctx.stroke();
    }

    for (let lon = 0; lon < 360; lon += 14) {
      const longitude = lon * Math.PI / 180 + state.world.yaw;
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const latitude = -Math.PI / 2 + i / 90 * Math.PI;
        const ringRadius = radius * Math.cos(latitude);
        const y0 = radius * Math.sin(latitude);
        const x = Math.cos(longitude) * ringRadius;
        const z = Math.sin(longitude) * ringRadius;
        const y = y0 * Math.cos(state.world.pitch) + z * Math.sin(state.world.pitch);
        const depth = -y0 * Math.sin(state.world.pitch) + z * Math.cos(state.world.pitch);
        const scale = 1 + depth / radius * .08;
        if (i === 0) ctx.moveTo(x * scale, y * scale);
        else ctx.lineTo(x * scale, y * scale);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function positionCards(time) {
    $$('.card', orbit).forEach((card, index) => {
      const depth = cardDepth[index];
      const dx = state.world.yaw * (innerWidth < 700 ? 16 : 32) * depth
        + state.mouse.x * 9 * depth
        + Math.sin(time * .00035 + index * 1.4) * 7;
      const dy = -state.world.pitch * (innerWidth < 700 ? 13 : 22) * depth
        + state.mouse.y * 6 * depth
        + Math.cos(time * .00042 + index * 1.7) * 6;
      card.style.transform = `${cardBaseTransforms[index]} translate3d(${dx}px,${dy}px,${depth * 18}px)`;
    });
  }

  function frame(time) {
    const dt = Math.min((time - state.lastFrame) / 16.667, 2);
    state.lastFrame = time;

    state.mouse.x += (state.mouse.targetX - state.mouse.x) * .07 * dt;
    state.mouse.y += (state.mouse.targetY - state.mouse.y) * .07 * dt;

    if (!state.drag.active) {
      state.world.targetYaw += state.drag.vx * dt;
      state.world.targetPitch += state.drag.vy * dt;
      state.drag.vx *= Math.pow(.94, dt);
      state.drag.vy *= Math.pow(.94, dt);
      state.world.targetYaw += .0008 * dt;
      state.world.targetPitch *= .999;
    }

    state.world.pitch = Math.max(-.8, Math.min(.8, state.world.pitch));
    state.world.targetPitch = Math.max(-.8, Math.min(.8, state.world.targetPitch));
    state.world.yaw += (state.world.targetYaw - state.world.yaw) * .075 * dt;
    state.world.pitch += (state.world.targetPitch - state.world.pitch) * .075 * dt;

    drawWorld();
    positionCards(time);
    state.raf = requestAnimationFrame(frame);
  }

  function cancelHold() {
    clearTimeout(state.holdTimer);
    state.holdTimer = null;
    holdOverlay.classList.remove('is-visible', 'is-active');
  }

  function beginHold() {
    cancelHold();
    holdOverlay.classList.add('is-visible');
    requestAnimationFrame(() => holdOverlay.classList.add('is-active'));
    state.holdTimer = setTimeout(() => {
      cancelHold();
      showView('projects');
    }, 1060);
  }

  function setMenu(open) {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuToggle.setAttribute('aria-expanded', String(open));
  }

  function showView(name) {
    if (!name) return;
    const next = $(`.view[data-name="${name}"]`);
    const previous = $(`.view[data-name="${state.currentView}"]`);
    if (!next) return;
    if (next === previous) {
      setMenu(false);
      return;
    }
    previous?.classList.remove('is-active');
    next.classList.add('is-active');
    state.currentView = name;
    setMenu(false);
    if (name === 'projects') next.scrollTop = 0;
  }

  function setupCursor() {
    addEventListener('pointermove', event => {
      state.mouse.targetX = (event.clientX / innerWidth - .5) * 2;
      state.mouse.targetY = (event.clientY / innerHeight - .5) * 2;
      if (cursor) cursor.style.transform = `translate3d(${event.clientX - 21}px,${event.clientY - 21}px,0)`;

      if (state.drag.active) {
        state.world.targetYaw = state.drag.yaw + (event.clientX - state.drag.x) / innerWidth * 1.8;
        state.world.targetPitch = state.drag.pitch + (event.clientY - state.drag.y) / innerHeight * 1.45;
        state.drag.vx = (event.movementX || 0) / innerWidth * .045;
        state.drag.vy = (event.movementY || 0) / innerHeight * .04;
      }
    }, { passive: true });

    $$('.mag').forEach(element => {
      element.addEventListener('pointerenter', () => cursor?.classList.add('is-hover'));
      element.addEventListener('pointerleave', () => {
        cursor?.classList.remove('is-hover');
        element.style.transform = '';
      });
      element.addEventListener('pointermove', event => {
        if (matchMedia('(pointer: coarse)').matches) return;
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        element.style.transform = `translate(${x * .12}px,${y * .12}px)`;
      });
    });
  }

  function setupWorldInteractions() {
    orbit.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      state.drag.active = true;
      state.drag.x = event.clientX;
      state.drag.y = event.clientY;
      state.drag.yaw = state.world.targetYaw;
      state.drag.pitch = state.world.targetPitch;
      state.drag.vx = 0;
      state.drag.vy = 0;
      orbit.setPointerCapture?.(event.pointerId);
      cursor?.classList.add('is-drag');
      hint.style.opacity = '.2';
    });

    const endDrag = () => {
      if (!state.drag.active) return;
      state.drag.active = false;
      cursor?.classList.remove('is-drag');
      hint.style.opacity = '1';
    };
    addEventListener('pointerup', endDrag);
    addEventListener('pointercancel', endDrag);

    $$('.card', orbit).forEach(card => {
      card.addEventListener('pointerenter', () => {
        $('h2', meta).textContent = card.dataset.title;
        $('span', meta).textContent = card.dataset.type;
        meta.classList.add('is-visible');
      });
      card.addEventListener('pointerleave', () => {
        meta.classList.remove('is-visible');
        cancelHold();
      });
      card.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.stopPropagation();
        beginHold();
      });
      card.addEventListener('pointerup', cancelHold);
      card.addEventListener('pointercancel', cancelHold);
    });
  }

  function setupNavigation() {
    menuToggle.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
    $$('[data-view]').forEach(element => {
      element.addEventListener('click', event => {
        event.preventDefault();
        showView(element.dataset.view);
      });
    });

    $$('.filters button').forEach(button => {
      button.addEventListener('click', () => {
        const filter = button.dataset.filter;
        $$('.filters button').forEach(item => item.classList.toggle('is-active', item === button));
        $$('.project-row').forEach(row => {
          row.classList.toggle('is-hidden', filter !== 'all' && row.dataset.kind !== filter);
        });
      });
    });

    addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        cancelHold();
        setMenu(false);
      }
      if (event.key === '1') showView('home');
      if (event.key === '2') showView('projects');
      if (event.key === '3') showView('contact');
    });
  }

  $('#enter')?.addEventListener('click', () => enter(true));
  $('#silent')?.addEventListener('click', () => enter(false));
  soundToggle.addEventListener('click', () => setSound(!state.sound));
  addEventListener('resize', resizeCanvas, { passive: true });

  resizeCanvas();
  setupCursor();
  setupWorldInteractions();
  setupNavigation();
})();
