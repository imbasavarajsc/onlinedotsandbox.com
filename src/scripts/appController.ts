import { createInitialState, makeMove, undoMove, findLine, getAllAvailableLines } from './gameEngine';
import { getAiMove } from './aiEngine';
import { audioEngine } from './audioEngine';
import { loadStats, recordGameResult, resetStats } from './statsEngine';
import { launchConfetti } from './confetti';
import type { GameConfig, GameState, Line, PlayerId } from './types';

let state: GameState;
let timerInterval: number | null = null;
let aiTimeoutId: number | null = null;
let currentHintLineId: string | null = null;

export function initApp() {
  const defaultConfig: GameConfig = {
    gridSize: 4,
    mode: 'pve',
    aiDifficulty: 'medium',
    player1Name: 'Player 1',
    player2Name: 'AI Bot (Medium)',
    theme: 'cyberpunk',
    soundEnabled: true,
    timerEnabled: true,
    timerDuration: 15,
  };

  state = createInitialState(defaultConfig);

  setupEventListeners();
  applyTheme(defaultConfig.theme);
  renderAll();
}

function renderAll() {
  renderBoard();
  renderScoreboard();
  renderControls();
  checkTurnTimer();

  // Trigger AI if it's AI turn
  if (!state.isGameOver) {
    if (state.config.mode === 'pve' && state.currentPlayer === 2) {
      scheduleAiMove();
    } else if (state.config.mode === 'eve') {
      scheduleAiMove();
    }
  }
}

function renderBoard() {
  const svg = document.getElementById('game-svg') as unknown as SVGSVGElement;
  const boxesGroup = document.getElementById('boxes-group');
  const linesGroup = document.getElementById('lines-group');
  const dotsGroup = document.getElementById('dots-group');

  if (!svg || !boxesGroup || !linesGroup || !dotsGroup) return;

  boxesGroup.innerHTML = '';
  linesGroup.innerHTML = '';
  dotsGroup.innerHTML = '';

  const N = state.config.gridSize; // Number of dots
  const boxCount = N - 1;
  const padding = 50;
  const boardWidth = 600 - padding * 2;
  const spacing = boardWidth / (N - 1);

  // 1. Render Boxes
  for (let r = 0; r < boxCount; r++) {
    for (let c = 0; c < boxCount; c++) {
      const box = state.boxes[r][c];
      const x = padding + c * spacing;
      const y = padding + r * spacing;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', `${x + 6}`);
      rect.setAttribute('y', `${y + 6}`);
      rect.setAttribute('width', `${spacing - 12}`);
      rect.setAttribute('height', `${spacing - 12}`);
      rect.setAttribute('rx', '8');
      rect.setAttribute('class', `board-box ${box.owner === 1 ? 'p1-box' : box.owner === 2 ? 'p2-box' : ''}`);

      boxesGroup.appendChild(rect);

      if (box.owner) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', `${x + spacing / 2}`);
        text.setAttribute('y', `${y + spacing / 2}`);
        text.setAttribute('class', `box-label ${box.owner === 1 ? 'p1-text' : 'p2-text'}`);
        if (box.owner === 1) {
          text.textContent = 'P1';
        } else {
          text.textContent = state.config.mode === 'pve' ? 'AI' : 'P2';
        }
        boxesGroup.appendChild(text);
      }
    }
  }

  // 2. Render Lines
  // Horizontal lines
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < boxCount; c++) {
      const line = state.horizontalLines[r][c];
      const x1 = padding + c * spacing;
      const y1 = padding + r * spacing;
      const x2 = x1 + spacing;
      const y2 = y1;

      createSvgLine(linesGroup, line, x1, y1, x2, y2);
    }
  }

  // Vertical lines
  for (let r = 0; r < boxCount; r++) {
    for (let c = 0; c < N; c++) {
      const line = state.verticalLines[r][c];
      const x1 = padding + c * spacing;
      const y1 = padding + r * spacing;
      const x2 = x1;
      const y2 = y1 + spacing;

      createSvgLine(linesGroup, line, x1, y1, x2, y2);
    }
  }

  // 3. Render Dots
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cx = padding + c * spacing;
      const cy = padding + r * spacing;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', `${cx}`);
      circle.setAttribute('cy', `${cy}`);
      circle.setAttribute('r', N > 5 ? '7' : '9');
      circle.setAttribute('class', 'board-dot active');

      dotsGroup.appendChild(circle);
    }
  }
}

function createSvgLine(
  group: HTMLElement,
  line: Line,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  // Visible Line
  const visLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  visLine.setAttribute('x1', `${x1}`);
  visLine.setAttribute('y1', `${y1}`);
  visLine.setAttribute('x2', `${x2}`);
  visLine.setAttribute('y2', `${y2}`);

  let classes = 'board-line';
  if (!line.owner) {
    classes += ' empty';
  } else if (line.owner === 1) {
    classes += ' claimed-p1';
  } else {
    classes += ' claimed-p2';
  }

  if (line.isLastMove) classes += ' last-move';
  if (line.id === currentHintLineId) classes += ' hint';

  visLine.setAttribute('class', classes);

  // Wide Hitbox Line for mobile & smooth hover
  const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  hitLine.setAttribute('x1', `${x1}`);
  hitLine.setAttribute('y1', `${y1}`);
  hitLine.setAttribute('x2', `${x2}`);
  hitLine.setAttribute('y2', `${y2}`);
  hitLine.setAttribute('stroke-width', '24');
  hitLine.setAttribute('stroke', 'transparent');
  hitLine.setAttribute('cursor', line.owner ? 'default' : 'pointer');

  if (!line.owner && !state.isGameOver) {
    hitLine.addEventListener('mouseenter', () => {
      visLine.classList.add('hovered');
    });
    hitLine.addEventListener('mouseleave', () => {
      visLine.classList.remove('hovered');
    });
    hitLine.addEventListener('click', () => {
      handleUserMove(line.id);
    });
  }

  g.appendChild(visLine);
  g.appendChild(hitLine);
  group.appendChild(g);
}

function handleUserMove(lineId: string) {
  if (state.isGameOver) return;

  // Prevent human clicking during AI turn in PVE / EVE mode
  if (state.config.mode === 'pve' && state.currentPlayer === 2) return;
  if (state.config.mode === 'eve') return;

  executeMove(lineId);
}

function executeMove(lineId: string) {
  currentHintLineId = null;
  const prevPlayer = state.currentPlayer;
  const { state: newState, boxesScored } = makeMove(state, lineId);
  state = newState;

  // Sound effects
  if (boxesScored > 0) {
    audioEngine.playBoxPop(state.streakCount);
  } else {
    audioEngine.playClick();
  }

  renderAll();

  if (state.isGameOver) {
    handleGameOver();
  }
}

function scheduleAiMove() {
  if (aiTimeoutId) clearTimeout(aiTimeoutId);

  const delay = state.config.mode === 'eve' ? 500 : 700;
  aiTimeoutId = window.setTimeout(() => {
    if (state.isGameOver) return;

    let difficulty = state.config.aiDifficulty;
    if (state.config.mode === 'eve' && state.currentPlayer === 1) {
      difficulty = 'hard'; // EVE player 1 is hard bot vs player 2 difficulty bot
    }

    const aiMoveLine = getAiMove(state, difficulty);
    if (aiMoveLine) {
      executeMove(aiMoveLine.id);
    }
  }, delay);
}

function renderScoreboard() {
  const p1Card = document.getElementById('player1-card');
  const p2Card = document.getElementById('player2-card');
  const p1Score = document.getElementById('p1-score');
  const p2Score = document.getElementById('p2-score');
  const p1Name = document.getElementById('p1-name');
  const p2Name = document.getElementById('p2-name');
  const p1Avatar = document.getElementById('p1-avatar');
  const p2Avatar = document.getElementById('p2-avatar');
  const statusMsg = document.getElementById('status-message');
  const streakBanner = document.getElementById('streak-banner');
  const streakCount = document.getElementById('streak-count');

  if (p1Card && p2Card) {
    if (state.currentPlayer === 1) {
      p1Card.classList.add('active-turn');
      p2Card.classList.remove('active-turn');
    } else {
      p2Card.classList.add('active-turn');
      p1Card.classList.remove('active-turn');
    }
  }

  if (p1Score) p1Score.textContent = `${state.scores[1]}`;
  if (p2Score) p2Score.textContent = `${state.scores[2]}`;

  if (p1Name && document.activeElement !== p1Name) {
    p1Name.textContent = state.config.player1Name;
  }
  
  if (p2Name) {
    const isHuman2 = state.config.mode === 'pvp' || state.config.mode === 'sandbox';
    p2Name.setAttribute('contenteditable', isHuman2 ? 'true' : 'false');
    if (document.activeElement !== p2Name) {
      if (isHuman2) {
        p2Name.textContent = state.config.player2Name;
      } else {
        p2Name.textContent = `AI Bot (${state.config.aiDifficulty.toUpperCase()})`;
      }
    }
  }

  if (p1Avatar) p1Avatar.textContent = 'P1';
  if (p2Avatar) {
    if (state.config.mode === 'pve') {
      p2Avatar.textContent = 'AI';
    } else {
      p2Avatar.textContent = 'P2';
    }
  }

  if (statusMsg) {
    if (state.isGameOver) {
      if (state.winner === 1) statusMsg.textContent = `${state.config.player1Name} Wins! 🎉`;
      else if (state.winner === 2) statusMsg.textContent = `${p2Name?.textContent || 'Player 2'} Wins! 🎉`;
      else statusMsg.textContent = "It's a Tie! 🤝";
    } else {
      if (state.config.mode === 'pve' && state.currentPlayer === 2) {
        statusMsg.textContent = 'AI Bot is thinking... 🤖';
      } else {
        const currName = state.currentPlayer === 1 ? state.config.player1Name : (p2Name?.textContent || 'Player 2');
        statusMsg.textContent = `${currName}'s Turn`;
      }
    }
  }

  if (streakBanner && streakCount) {
    if (state.streakCount > 1) {
      streakBanner.classList.remove('hidden');
      streakCount.textContent = `${state.streakCount}`;
    } else {
      streakBanner.classList.add('hidden');
    }
  }
}

function renderControls() {
  const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
  const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
  const hintBtn = document.getElementById('hint-btn') as HTMLButtonElement;

  if (undoBtn) undoBtn.disabled = state.history.length === 0 || state.isGameOver;
  if (redoBtn) redoBtn.disabled = state.redoStack.length === 0 || state.isGameOver;
  if (hintBtn) hintBtn.disabled = state.isGameOver;
}

function checkTurnTimer() {
  const timerBadge = document.getElementById('turn-timer');
  const timerText = document.getElementById('timer-text');

  if (timerInterval) clearInterval(timerInterval);

  if (!state.config.timerEnabled || state.config.timerDuration === 0 || state.isGameOver) {
    if (timerBadge) timerBadge.style.display = 'none';
    return;
  }

  if (timerBadge) timerBadge.style.display = 'inline-flex';
  if (timerText) timerText.textContent = `${state.turnTimer}s`;

  timerInterval = window.setInterval(() => {
    state.turnTimer--;
    if (timerText) timerText.textContent = `${state.turnTimer}s`;

    if (state.turnTimer <= 0) {
      clearInterval(timerInterval!);
      // Force random move on timer expiration
      const avail = getAllAvailableLines(state);
      if (avail.length > 0) {
        const randomLine = avail[Math.floor(Math.random() * avail.length)];
        executeMove(randomLine.id);
      }
    }
  }, 1000);
}

function handleGameOver() {
  if (timerInterval) clearInterval(timerInterval);

  const isVsAi = state.config.mode === 'pve';
  recordGameResult(
    state.winner as PlayerId | 'tie',
    state.scores[1],
    state.scores[2],
    isVsAi,
    state.config.aiDifficulty,
    state.streakCount
  );

  if (state.winner === 1) {
    audioEngine.playWinFanfare();
    launchConfetti();
  }

  showVictoryModal();
}

function showVictoryModal() {
  const modal = document.getElementById('victory-modal');
  const title = document.getElementById('winner-title');
  const subtitle = document.getElementById('winner-subtitle');
  const p1Name = document.getElementById('modal-p1-name');
  const p2Name = document.getElementById('modal-p2-name');
  const p1Score = document.getElementById('modal-p1-score');
  const p2Score = document.getElementById('modal-p2-score');

  if (!modal) return;

  if (p1Name) p1Name.textContent = state.config.player1Name;
  if (p2Name) p2Name.textContent = state.config.mode === 'pve' ? 'AI Bot' : 'Player 2';
  if (p1Score) p1Score.textContent = `${state.scores[1]}`;
  if (p2Score) p2Score.textContent = `${state.scores[2]}`;

  if (title) {
    if (state.winner === 1) title.textContent = `${state.config.player1Name.toUpperCase()} VICTORY! 🎉`;
    else if (state.winner === 2) title.textContent = `${p2Name?.textContent.toUpperCase()} VICTORY! 🎉`;
    else title.textContent = 'DRAW MATCH! 🤝';
  }

  if (subtitle) {
    subtitle.textContent = `Final Score: ${state.scores[1]} vs ${state.scores[2]}`;
  }

  modal.classList.add('active');
}

function setupEventListeners() {
  // New Game Button
  document.getElementById('new-game-btn')?.addEventListener('click', () => {
    audioEngine.playButtonClick();
    state = createInitialState(state.config);
    renderAll();
  });

  // Undo Button
  document.getElementById('undo-btn')?.addEventListener('click', () => {
    audioEngine.playButtonClick();
    const updated = undoMove(state);
    if (updated) {
      state = updated;
      // In PVE mode, undo human move also undoes AI response move!
      if (state.config.mode === 'pve' && state.currentPlayer === 2 && state.history.length > 0) {
        undoMove(state);
      }
      renderAll();
    }
  });

  // Redo Button
  document.getElementById('redo-btn')?.addEventListener('click', () => {
    audioEngine.playButtonClick();
    if (state.redoStack.length > 0) {
      const nextMove = state.redoStack[state.redoStack.length - 1];
      executeMove(nextMove.lineId);
    }
  });

  // Hint Button
  document.getElementById('hint-btn')?.addEventListener('click', () => {
    audioEngine.playButtonClick();
    const recommended = getAiMove(state, 'hard');
    if (recommended) {
      currentHintLineId = recommended.id;
      renderBoard();
    }
  });

  // Theme Selector
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  themeSelect?.addEventListener('change', (e) => {
    const newTheme = (e.target as HTMLSelectElement).value as any;
    state.config.theme = newTheme;
    applyTheme(newTheme);
  });

  // Editable Player Name Listeners
  const p1NameElem = document.getElementById('p1-name');
  p1NameElem?.addEventListener('input', () => {
    state.config.player1Name = p1NameElem.textContent?.trim() || 'Player 1';
  });

  const p2NameElem = document.getElementById('p2-name');
  p2NameElem?.addEventListener('input', () => {
    if (state.config.mode === 'pvp' || state.config.mode === 'sandbox') {
      state.config.player2Name = p2NameElem.textContent?.trim() || 'Player 2';
    }
  });

  // Mode Selector
  const modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
  modeSelect?.addEventListener('change', (e) => {
    const newMode = (e.target as HTMLSelectElement).value as any;
    state.config.mode = newMode;
    if (newMode === 'pvp' || newMode === 'sandbox') {
      if (state.config.player2Name.startsWith('AI Bot') || state.config.player2Name.startsWith('Bot 2')) {
        state.config.player2Name = 'Player 2';
      }
    }
    const aiContainer = document.getElementById('ai-level-container');
    if (aiContainer) {
      aiContainer.style.display = (newMode === 'pve') ? 'flex' : 'none';
    }
    state = createInitialState(state.config);
    renderAll();
  });

  // Grid Size Selector
  const sizeSelect = document.getElementById('grid-size-select') as HTMLSelectElement;
  sizeSelect?.addEventListener('change', (e) => {
    const newSize = parseInt((e.target as HTMLSelectElement).value, 10);
    state.config.gridSize = newSize;
    state = createInitialState(state.config);
    renderAll();
  });

  // AI Level Selector
  const aiSelect = document.getElementById('ai-level-select') as HTMLSelectElement;
  aiSelect?.addEventListener('change', (e) => {
    const diff = (e.target as HTMLSelectElement).value as any;
    state.config.aiDifficulty = diff;
    renderScoreboard();
  });

  // Timer Selector
  const timerSelect = document.getElementById('timer-select') as HTMLSelectElement;
  timerSelect?.addEventListener('change', (e) => {
    const duration = parseInt((e.target as HTMLSelectElement).value, 10);
    state.config.timerEnabled = duration > 0;
    state.config.timerDuration = duration;
    state.turnTimer = duration;
    checkTurnTimer();
  });

  // Sound Toggle Button
  const soundBtn = document.getElementById('sound-toggle-btn');
  soundBtn?.addEventListener('click', () => {
    const isMuted = !audioEngine.getMuted();
    audioEngine.setMuted(isMuted);

    document.getElementById('sound-icon-on')?.classList.toggle('hidden', isMuted);
    document.getElementById('sound-icon-off')?.classList.toggle('hidden', !isMuted);
  });

  // Modals Toggle Listeners
  setupModalListeners();
}

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
}

function setupModalListeners() {
  // Tutorial Modal
  const tutModal = document.getElementById('tutorial-modal');
  document.getElementById('open-tutorial-btn')?.addEventListener('click', () => tutModal?.classList.add('active'));
  document.getElementById('close-tutorial-btn')?.addEventListener('click', () => tutModal?.classList.remove('active'));
  document.getElementById('got-it-btn')?.addEventListener('click', () => tutModal?.classList.remove('active'));

  // Stats Modal
  const statsModal = document.getElementById('stats-modal');
  document.getElementById('open-stats-btn')?.addEventListener('click', () => {
    updateStatsDisplay();
    statsModal?.classList.add('active');
  });
  document.getElementById('close-stats-btn')?.addEventListener('click', () => statsModal?.classList.remove('active'));

  document.getElementById('reset-stats-btn')?.addEventListener('click', () => {
    resetStats();
    updateStatsDisplay();
  });

  // Victory Modal
  const vicModal = document.getElementById('victory-modal');
  document.getElementById('close-victory-btn')?.addEventListener('click', () => vicModal?.classList.remove('active'));
  document.getElementById('rematch-btn')?.addEventListener('click', () => {
    vicModal?.classList.remove('active');
    state = createInitialState(state.config);
    renderAll();
  });
}

function updateStatsDisplay() {
  const stats = loadStats();
  const total = document.getElementById('stat-total-games');
  const wins = document.getElementById('stat-p1-wins');
  const boxes = document.getElementById('stat-total-boxes');
  const streak = document.getElementById('stat-streak');

  const easy = document.getElementById('stat-easy-wins');
  const medium = document.getElementById('stat-medium-wins');
  const hard = document.getElementById('stat-hard-wins');

  if (total) total.textContent = `${stats.gamesPlayed}`;
  if (wins) wins.textContent = `${stats.p1Wins}`;
  if (boxes) boxes.textContent = `${stats.totalBoxesCompleted}`;
  if (streak) streak.textContent = `${stats.longestStreak}`;

  if (easy) easy.textContent = `${stats.easyAiWins}`;
  if (medium) medium.textContent = `${stats.mediumAiWins}`;
  if (hard) hard.textContent = `${stats.hardAiWins}`;
}
