(() => {
  'use strict';

  const LEVELS = [
    {
      id: 1,
      title: 'Two things in common',
      goal: 'A AND B',
      moves: 8,
      target: 400,
      hint: 'Look for the lens-shaped area where both circles overlap.',
      description: 'Find an element that belongs to both sets.'
    },
    {
      id: 2,
      title: 'A on its own',
      goal: 'A AND NOT B',
      moves: 7,
      target: 550,
      hint: 'Choose the part of circle A that does not touch circle B.',
      description: 'Choose an element in A, but not in B.'
    },
    {
      id: 3,
      title: 'B on its own',
      goal: 'NOT A AND B',
      moves: 7,
      target: 650,
      hint: 'The correct region is inside B and outside A.',
      description: 'Choose an element in B, but not in A.'
    },
    {
      id: 4,
      title: 'Beyond both',
      goal: 'NOT A AND NOT B',
      moves: 6,
      target: 800,
      hint: 'The answer is outside both circles.',
      description: 'Find an element that belongs to neither set.'
    },
    {
      id: 5,
      title: 'Shared space',
      goal: 'A AND B',
      moves: 6,
      target: 1000,
      hint: 'Both memberships must be true.',
      description: 'Identify the intersection of A and B.',
      timeLimit: 90
    },
    {
      id: 6,
      title: 'A little precision',
      goal: 'A AND NOT B',
      moves: 5,
      target: 1200,
      hint: 'Avoid the overlap: A only.',
      description: 'Select the part unique to set A.',
      timeLimit: 75
    }
  ];

  const REGIONS = {
    outside: 'Outside both sets',
    a: 'A only',
    b: 'B only',
    both: 'A and B'
  };

  const THEMES = [
    {
      id: 'garden',
      name: 'Garden',
      desc: 'A calm, leafy green palette.',
      unlock: 'Available from the start',
      colors: ['#b8d2b0', '#d0e0c8', '#a8c8a0', '#e3ebdd']
    },
    {
      id: 'golden-hour',
      name: 'Golden hour',
      desc: 'Warm sunlight and soft honey tones.',
      unlock: 'Complete level 4',
      colors: ['#e4c77e', '#f0d9a7', '#c99a49', '#f5e9c9']
    },
    {
      id: 'lavender',
      name: 'Lavender fields',
      desc: 'A gentle purple daydream.',
      unlock: 'Complete all 6 levels',
      colors: ['#c9bde2', '#e0d8ef', '#a99bcf', '#eee8f7']
    }
  ];

  const DEFAULT = {
    level: 1,
    score: 0,
    best: 0,
    xp: 0,
    completed: [],
    unlocked: ['garden'],
    selectedTheme: 'garden',
    streak: 0,
    lastDaily: '',
    dailyCompleted: [],
    sound: false,
    music: false
  };

  const $ = id => document.getElementById(id);

  let state = loadState();
  let tab = 'play';
  let levelIndex = Math.min(Math.max(state.level - 1, 0), LEVELS.length - 1);
  let movesLeft = LEVELS[levelIndex].moves;
  let elapsed = 0;
  let paused = false;
  let hintUsed = false;
  let showHint = false;
  let selectedRegion = null;
  let dailyChoice = null;
  let dailyMessage = '';
  let dailyFeedback = '';
  let lastMove = null;
  let timerStart = Date.now();
  let tick = null;
  let audioContext = null;
  let musicOsc = null;
  let toastTimer = null;

  function loadState() {
    try {
      const x = JSON.parse(localStorage.getItem('mosaic-standalone-v1') || 'null');
      return x && typeof x === 'object'
        ? {
            ...DEFAULT,
            ...x,
            completed: Array.isArray(x.completed) ? x.completed : [],
            unlocked: Array.isArray(x.unlocked) ? x.unlocked : ['garden'],
            dailyCompleted: Array.isArray(x.dailyCompleted) ? x.dailyCompleted : []
          }
        : structuredClone(DEFAULT);
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT));
    }
  }

  function saveState() {
    try {
      localStorage.setItem('mosaic-standalone-v1', JSON.stringify(state));
      $('saveLabel').textContent = 'Progress saved on this device';
    } catch {
      $('saveLabel').textContent = 'Browser storage is unavailable';
    }
  }

  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function dailyGoal() {
    const options = ['A AND B', 'A AND NOT B', 'NOT A AND B', 'NOT A AND NOT B'];
    let n = 0;
    for (const c of localDateKey()) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    return options[n % options.length];
  }

  function targetRegion(goal) {
    return {
      'A AND B': 'both',
      'A AND NOT B': 'a',
      'NOT A AND B': 'b',
      'NOT A AND NOT B': 'outside'
    }[goal];
  }

  function matches(goal, region) {
    const a = region === 'a' || region === 'both';
    const b = region === 'b' || region === 'both';
    return {
      'A AND B': a && b,
      'A AND NOT B': a && !b,
      'NOT A AND B': !a && b,
      'NOT A AND NOT B': !a && !b
    }[goal];
  }

  function currentLevel() {
    return LEVELS[levelIndex];
  }

  function goal() {
    return tab === 'daily' ? dailyGoal() : currentLevel().goal;
  }

let levelSolved = false;

function isCompleted() {
  return levelSolved;
}

  function fmt(n) {
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }

  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }

  function playTone(freq = 560, duration = .09) {
    if (!state.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(.07, audioContext.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      o.connect(g);
      g.connect(audioContext.destination);
      o.start();
      o.stop(audioContext.currentTime + duration);
    } catch {}
  }

  function setTab(next) {
    tab = next;
    paused = false;
    $('gameView').classList.toggle('hidden', next === 'collection');
    $('collectionView').classList.toggle('hidden', next !== 'collection');
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === next));
    $('dailyCard').classList.toggle('hidden', next !== 'daily');

    if (next === 'daily') {
      dailyChoice = null;
      dailyMessage = '';
      dailyFeedback = 'Today’s challenge is ready.';
      selectedRegion = null;
      showHint = false;
    } else if (next === 'play') {
      dailyChoice = null;
      dailyMessage = '';
      dailyFeedback = 'Choose a region to place your tile.';
    }
    render();
  }

  function resetLevel(message = 'Choose a region to place your tile.') {
    movesLeft = currentLevel().moves;
    elapsed = 0;
    timerStart = Date.now();
    paused = false;
    hintUsed = false;
    showHint = false;
    selectedRegion = null;
    lastMove = null;
    $('feedback').textContent = message;
    $('feedback').className = 'feedback';
  }

  function chooseRegion(region) {
    if (paused || (tab === 'play' && isCompleted())) return;

    playTone(420);
    selectedRegion = region;
    document.querySelectorAll('.venn-region').forEach(b =>
      b.classList.toggle('chosen', b.dataset.region === region)
    );

    if (tab === 'daily') {
      dailyChoice = region;
      dailyMessage = '';
      dailyFeedback = matches(goal(), region)
        ? 'That looks promising — check your answer below.'
        : `${REGIONS[region]} does not match today’s expression.`;
      $('dailyMessage').textContent = dailyFeedback;
      $('feedback').textContent = dailyFeedback;
      $('feedback').className = 'feedback ' + (matches(goal(), region) ? '' : 'error');
      return;
    }

    lastMove = { movesLeft, elapsed, selectedRegion: null, hintUsed, showHint };
    movesLeft--;

    if (matches(goal(), region)) {
      const points = calculatePoints(
        300 + currentLevel().id * 30,
        movesLeft,
        hintUsed,
        elapsed,
        currentLevel().timeLimit
      );
      completeLevel(points);
    } else if (movesLeft <= 0) {
      paused = true;
      $('feedback').textContent = `Out of moves. The target is ${REGIONS[targetRegion(goal())].toLowerCase()}. Restart to try again.`;
      $('feedback').className = 'feedback error';
      playTone(180, .2);
    } else {
      $('feedback').textContent = `Not quite — ${REGIONS[region].toLowerCase()} doesn’t match ${goal()}. ${movesLeft} moves left.`;
      $('feedback').className = 'feedback error';
      playTone(220, .13);
    }

    render();
  }

  function calculatePoints(base, moves, hint, seconds, timeLimit) {
    return Math.max(
      50,
      base +
        Math.max(0, moves) * 25 -
        (hint ? 50 : 0) +
        (timeLimit ? Math.max(0, timeLimit - seconds) * 2 : 0)
    );
  }

  function completeLevel(points) {
    const id = currentLevel().id;
    levelSolved = true;

    state.completed = [...new Set([...state.completed, id])];
    state.score += points;
    state.best = Math.max(state.best, state.score);
    state.xp += Math.round(points / 10);

    // بعد از آخرین مرحله، چرخه از اول شروع می‌شود
    state.level = id >= LEVELS.length ? 1 : id + 1;

    if (state.completed.length >= 4 && !state.unlocked.includes('golden-hour')) {
      state.unlocked.push('golden-hour');
    }

    if (state.completed.length === LEVELS.length && !state.unlocked.includes('lavender')) {
      state.unlocked.push('lavender');
    }

    saveState();
    paused = true;

    showOverlay(
      'Level complete',
      'Your progress has been saved on this device.',
      'Next level →',
      'next'
    );

    $('feedback').textContent = `Lovely! +${points} points and +${Math.round(points / 10)} XP.`;
    $('feedback').className = 'feedback success';

    playTone(720, .18);
    setTimeout(() => playTone(900, .2), 110);
    showToast(`Level complete · +${points} points`);
  }

  function useHint() {
    if (tab === 'daily' || paused || isCompleted()) return;
    hintUsed = true;
    showHint = true;
    $('hintText').textContent = currentLevel().hint;
    $('hintDetail').classList.remove('hidden');
    render();
    $('feedback').textContent = 'Hint revealed. A small score penalty applies if you solve this level.';
  }

  function undo() {
    if (tab === 'daily' || paused || !lastMove) return;
    movesLeft = lastMove.movesLeft;
    elapsed = lastMove.elapsed;
    selectedRegion = lastMove.selectedRegion;
    hintUsed = lastMove.hintUsed;
    showHint = lastMove.showHint;
    lastMove = null;
    paused = false;
    $('feedback').textContent = 'Last move cleared. Try again.';
    $('feedback').className = 'feedback';
    render();
  }

  function restart() {
    resetLevel('Fresh start. Choose a region.');
    $('pauseOverlay').classList.add('hidden');
    render();
  }

  function togglePause() {
    if (tab === 'collection') return;

    if (isCompleted() && tab === 'play') {
      showOverlay(
        'Level complete',
        'Your progress has been saved on this device.',
        'Next level →',
        'next'
      );
      return;
    }

    paused = !paused;

    if (paused) {
      showOverlay(
        movesLeft <= 0 ? 'Give it another go' : 'Take a breath',
        movesLeft <= 0
          ? 'The puzzle is paused. Restart to try again.'
          : 'The game and timer are paused.',
        movesLeft <= 0 ? 'Restart level →' : 'Resume play →',
        movesLeft <= 0 ? 'restart' : 'resume'
      );
    } else {
      $('pauseOverlay').classList.add('hidden');
    }

    render();
  }

  function showOverlay(title, message, action, kind) {
    $('pauseTitle').textContent = title;
    $('pauseMessage').textContent = message;
    $('overlayAction').textContent = action;
    $('overlayAction').dataset.action = kind;
    $('pauseOverlay').classList.remove('hidden');
  }

  function submitDaily() {
    if (!dailyChoice) {
      dailyMessage = 'Choose a region first.';
    } else if (!matches(goal(), dailyChoice)) {
      dailyMessage = 'Not quite yet — try another region.';
      playTone(210);
    } else {
      const key = localDateKey();
      if (state.dailyCompleted.includes(key)) {
        dailyMessage = 'You have already recorded today’s puzzle.';
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        state.streak =
          state.lastDaily === localDateKey(yesterday)
            ? state.streak + 1
            : state.lastDaily === key
              ? state.streak
              : 1;
        state.lastDaily = key;
        state.dailyCompleted.push(key);
        state.xp += 25;
        saveState();
        dailyMessage = 'Daily puzzle recorded. +25 XP — come back tomorrow to keep your streak.';
        playTone(760, .18);
        showToast('Daily puzzle complete · +25 XP');
      }
    }
    $('dailyMessage').textContent = dailyMessage;
    render();
  }

  function renderExpression(text) {
    const el = $('expression');
    el.innerHTML = '';
    text.split(' ').forEach(word => {
      const span = document.createElement('span');
      span.textContent = word;
      if (word === 'AND' || word === 'NOT') span.className = 'operator';
      el.appendChild(span);
    });
  }

  function render() {
    const level = currentLevel();
    const g = goal();
    const target = targetRegion(g);
    const done = isCompleted();

    document.documentElement.style.setProperty(
      '--accent',
      state.selectedTheme === 'golden-hour'
        ? '#b98632'
        : state.selectedTheme === 'lavender'
          ? '#7560a5'
          : '#286753'
    );

    $('streakCount').textContent = `${state.streak} day streak`;
    $('scoreValue').textContent = state.score.toLocaleString();
    $('bestValue').textContent = state.best.toLocaleString();
    $('xpPercent').textContent = `${Math.min(100, Math.round(state.xp / Math.max(1, level.target) * 100))}%`;
    $('xpBar').style.width = `${Math.min(100, state.xp / Math.max(1, level.target) * 100)}%`;
    $('xpNote').textContent = `${Math.max(0, level.target - state.xp).toLocaleString()} XP to next milestone`;
    $('completedCount').textContent = `${state.completed.length} of ${LEVELS.length}`;
    $('levelBars').innerHTML = LEVELS.map(l =>
      `<i class="${state.completed.includes(l.id) ? 'filled' : ''}"></i>`
    ).join('');
    $('levelBadge').textContent =
      tab === 'daily' ? 'DAILY PUZZLE' : `GARDEN / LEVEL ${String(level.id).padStart(2, '0')}`;
    $('levelTitle').textContent = tab === 'daily' ? 'A little daily ritual' : level.title;
    $('levelDescription').textContent =
      tab === 'daily' ? 'One small challenge, every day.' : level.description;
    $('headingNote').textContent =
      tab === 'daily'
        ? 'One small challenge, every day.'
        : level.timeLimit
          ? `${Math.max(0, level.timeLimit - elapsed)}s left on the challenge`
          : 'No timer. Find your rhythm.';
    $('movesLabel').textContent =
      tab === 'daily' ? 'Choose one region' : `${movesLeft} moves left`;

    const timeText = fmt(elapsed);
    $('timerValue').textContent = timeText;
    $('timerLarge').textContent = timeText;
    $('timerProgress').style.width = level.timeLimit
      ? `${Math.min(100, elapsed / level.timeLimit * 100)}%`
      : '0%';

    $('hintBtn').disabled = paused || done || tab === 'daily';
    $('undoBtn').disabled = paused || done || tab === 'daily' || !lastMove;
    $('restartBtn').disabled = tab === 'daily';
    $('hintCount').textContent = hintUsed ? 'Used' : '1';
    $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
    $('timerPauseBtn').textContent = paused ? '▶' : 'Ⅱ';
    $('tipThird').textContent =
      tab === 'daily'
        ? 'Get today’s puzzle right to earn XP and build your streak.'
        : `Solve ${level.title.toLowerCase()} before your moves run out.`;
    $('rewardStatus').textContent = state.unlocked.includes('golden-hour')
      ? 'Unlocked — equip it in Collection'
      : 'Unlock after level 4';
    $('dailyGoalText').textContent = dailyGoal();
    $('dailyMessage').textContent = dailyMessage;
    $('soundBtn').innerHTML = `♫ <b>Sound ${state.sound ? 'on' : 'off'}</b>`;
    $('musicBtn').textContent = `♪ Music ${state.music ? 'on' : 'off'}`;
    $('soundBtn').classList.toggle('enabled', state.sound);
    $('musicBtn').classList.toggle('enabled', state.music);

    renderExpression(g);

    document.querySelectorAll('.venn-region').forEach(b => {
      const r = b.dataset.region;
      b.classList.toggle('chosen', r === selectedRegion);
      b.classList.toggle('hinted', showHint && r === target);
      b.disabled = paused || (tab === 'play' && done);
    });

    $('hintDetail').classList.toggle('hidden', !showHint);
    if (showHint) {
      $('hintText').textContent =
        tab === 'daily'
          ? 'Think about which membership conditions are true.'
          : level.hint;
    }

    $('pauseOverlay').classList.toggle('hidden', !paused);
    $('dailySubmit').disabled = state.dailyCompleted.includes(localDateKey());
    $('dailySubmit').textContent = state.dailyCompleted.includes(localDateKey())
      ? 'Completed today ✓'
      : 'Check answer ✓';

    renderCollection();
  }

  function renderCollection() {
    const grid = $('collectionGrid');
    grid.innerHTML = '';

    THEMES.forEach(theme => {
      const unlocked = state.unlocked.includes(theme.id);
      const card = document.createElement('article');
      card.className = `collect-card ${unlocked ? '' : 'locked'}`;

      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      theme.colors.forEach(c => {
        const i = document.createElement('i');
        i.style.background = c;
        swatch.appendChild(i);
      });

      const info = document.createElement('div');
      const h = document.createElement('h2');
      const p = document.createElement('p');
      const small = document.createElement('small');
      h.textContent = theme.name;
      p.textContent = theme.desc;
      small.textContent = unlocked ? 'Unlocked' : theme.unlock;
      info.append(h, p, small);

      const btn = document.createElement('button');
      btn.textContent =
        state.selectedTheme === theme.id ? 'Equipped' : unlocked ? 'Equip' : 'Locked';
      btn.className = state.selectedTheme === theme.id ? 'selected' : '';
      btn.disabled = !unlocked;
      btn.addEventListener('click', () => {
        state.selectedTheme = theme.id;
        saveState();
        render();
        showToast(`${theme.name} theme equipped`);
      });

      card.append(swatch, info, btn);
      grid.appendChild(card);
    });
  }

  function openModal(title, eyebrow, content, actions = []) {
    $('modalTitle').textContent = title;
    $('modalEyebrow').textContent = eyebrow;
    $('modalContent').innerHTML = content;
    $('modalActions').innerHTML = '';

    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = a.primary ? 'primary-button' : 'secondary-button';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        closeModal();
        if (a.action) a.action();
      });
      $('modalActions').appendChild(b);
    });

    $('modalBackdrop').classList.remove('hidden');
  }

  function closeModal() {
    $('modalBackdrop').classList.add('hidden');
  }

  function settings() {
    openModal(
      'Settings',
      'YOUR PREFERENCES',
      `<div class="setting-row"><div><b>Sound effects</b><p>Feedback for moves and answers</p></div><button class="toggle ${state.sound ? 'on' : ''}" id="modalSound">${state.sound ? 'On' : 'Off'}</button></div><div class="setting-row"><div><b>Background music</b><p>Gentle focus ambience</p></div><button class="toggle ${state.music ? 'on' : ''}" id="modalMusic">${state.music ? 'On' : 'Off'}</button></div><p>Preferences and game progress are saved on this device. No account or server is required.</p>`,
      [{ label: 'Done', primary: true }]
    );

    $('modalSound').addEventListener('click', () => {
      state.sound = !state.sound;
      saveState();
      settings();
      render();
    });

    $('modalMusic').addEventListener('click', () => {
      state.music = !state.music;
      saveState();
      if (state.music) startMusic();
      else stopMusic();
      settings();
      render();
    });
  }

  function startMusic() {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      stopMusic();
      musicOsc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      musicOsc.type = 'sine';
      musicOsc.frequency.value = 110;
      gain.gain.value = .008;
      musicOsc.connect(gain);
      gain.connect(audioContext.destination);
      musicOsc.start();
    } catch {}
  }

  function stopMusic() {
    if (musicOsc) {
      try {
        musicOsc.stop();
      } catch {}
      musicOsc = null;
    }
  }

  function dailyTab() {
    setTab('daily');
  }

  document.querySelectorAll('.nav-tab').forEach(b =>
    b.addEventListener('click', () => setTab(b.dataset.tab))
  );
  $('homeBtn').addEventListener('click', () => setTab('play'));
  $('collectionShortcut').addEventListener('click', () => setTab('collection'));
  $('hintBtn').addEventListener('click', useHint);
  $('undoBtn').addEventListener('click', undo);
  $('restartBtn').addEventListener('click', () =>
    openModal(
      'Start this level over?',
      'A FRESH START',
      '<p>Your current moves and timer will reset. Your saved score and completed levels will stay.</p>',
      [
        { label: 'Keep playing' },
        { label: 'Restart level', primary: true, action: restart }
      ]
    )
  );
  $('pauseBtn').addEventListener('click', togglePause);
  $('timerPauseBtn').addEventListener('click', togglePause);
  $('dismissHint').addEventListener('click', () => {
    showHint = false;
    render();
  });
  $('dailySubmit').addEventListener('click', submitDaily);

  $('overlayAction').addEventListener('click', () => {
    const action = $('overlayAction').dataset.action;
    if (action === 'next') {
      levelIndex = (levelIndex + 1) % LEVELS.length;
      state.level = levelIndex + 1;
      saveState();
      resetLevel();
      $('pauseOverlay').classList.add('hidden');
      render();
    } else if (action === 'restart') {
      restart();
    } else {
      paused = false;
      timerStart = Date.now() - elapsed * 1000;
      $('pauseOverlay').classList.add('hidden');
      render();
    }
  });

  document.querySelectorAll('.venn-region').forEach(b =>
    b.addEventListener('click', () => chooseRegion(b.dataset.region))
  );

  $('howBtn').addEventListener('click', () =>
    openModal(
      'How to play Mosaic',
      'THE BASICS',
      '<ol class="how-list"><li><b>Read the expression.</b><p>AND means both conditions must be true. NOT means a set condition must be false.</p></li><li><b>Choose a region.</b><p>Tap one of the four labeled regions. The overlap belongs to both A and B.</p></li><li><b>Learn as you go.</b><p>Correct answers earn points and XP. Hints reduce your score; complete levels to unlock themes.</p></li></ol>',
      [{ label: 'Got it', primary: true }]
    )
  );

  $('settingsBtn').addEventListener('click', settings);
  $('modalClose').addEventListener('click', closeModal);
  $('modalBackdrop').addEventListener('click', e => {
    if (e.target === $('modalBackdrop')) closeModal();
  });
  $('profileBtn').addEventListener('click', () =>
    openModal(
      'Playing locally',
      'YOUR PLAYER PROFILE',
      '<p>Mosaic is running as a standalone app. Your score, unlocked themes, and daily streak are saved only in this browser. Google sign-in and cloud sync are not included in this no-build version.</p>',
      [{ label: 'Sounds good', primary: true }]
    )
  );
  $('soundBtn').addEventListener('click', () => {
    state.sound = !state.sound;
    saveState();
    render();
    if (state.sound) playTone();
  });
  $('musicBtn').addEventListener('click', () => {
    state.music = !state.music;
    saveState();
    if (state.music) startMusic();
    else stopMusic();
    render();
  });

  function updateClock() {
    if (!paused && tab === 'play' && !isCompleted()) {
      elapsed = Math.floor((Date.now() - timerStart) / 1000);
      const limit = currentLevel().timeLimit;
      if (limit && elapsed >= limit) {
        elapsed = limit;
        paused = true;
        showOverlay('Time is up', 'Restart the level to try again.', 'Restart level →', 'restart');
      }
      render();
    }
  }

  function syncTimer() {
    if (tick) clearInterval(tick);
    timerStart = Date.now() - elapsed * 1000;
    tick = setInterval(updateClock, 500);
  }

  const originalReset = resetLevel;
  resetLevel = function (message) {
    levelSolved = false;
    originalReset(message);
    syncTimer();
  };

  const originalSetTab = setTab;
  setTab = function (next) {
    originalSetTab(next);
    syncTimer();
  };

  const originalNext = $('overlayAction').onclick;

  render();
  syncTimer();
  
  // Mosaic intro loader
  const mosaicLoader = document.getElementById('mosaic-loader');

  if (mosaicLoader) {
    const hideLoader = () => {
      mosaicLoader.classList.add('loader-hidden');

      setTimeout(() => {
        mosaicLoader.remove();
      }, 700);
    };

    // Keep the intro visible briefly, then reveal the game.
    setTimeout(hideLoader, 1800);
  }

})();
