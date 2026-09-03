import type { GameConfig, GameState, Line, Box } from './types';

export function createInitialState(config: GameConfig): GameState {
  const N = config.gridSize; // e.g. 4 dots -> 3x3 boxes
  const boxCount = N - 1;

  // Initialize Horizontal lines: N rows, N-1 cols
  const horizontalLines: Line[][] = [];
  for (let r = 0; r < N; r++) {
    const row: Line[] = [];
    for (let c = 0; c < boxCount; c++) {
      row.push({
        id: `h-${r}-${c}`,
        type: 'horizontal',
        row: r,
        col: c,
        owner: null,
      });
    }
    horizontalLines.push(row);
  }

  // Initialize Vertical lines: N-1 rows, N cols
  const verticalLines: Line[][] = [];
  for (let r = 0; r < boxCount; r++) {
    const row: Line[] = [];
    for (let c = 0; c < N; c++) {
      row.push({
        id: `v-${r}-${c}`,
        type: 'vertical',
        row: r,
        col: c,
        owner: null,
      });
    }
    verticalLines.push(row);
  }

  // Initialize Boxes: N-1 rows, N-1 cols
  const boxes: Box[][] = [];
  for (let r = 0; r < boxCount; r++) {
    const row: Box[] = [];
    for (let c = 0; c < boxCount; c++) {
      row.push({
        id: `box-${r}-${c}`,
        row: r,
        col: c,
        owner: null,
        topLineId: `h-${r}-${c}`,
        bottomLineId: `h-${r + 1}-${c}`,
        leftLineId: `v-${r}-${c}`,
        rightLineId: `v-${r}-${c + 1}`,
      });
    }
    boxes.push(row);
  }

  return {
    config,
    currentPlayer: 1,
    horizontalLines,
    verticalLines,
    boxes,
    scores: { 1: 0, 2: 0 },
    history: [],
    redoStack: [],
    isGameOver: false,
    winner: null,
    turnTimer: config.timerDuration || 15,
    streakCount: 0,
  };
}

export function findLine(state: GameState, lineId: string): Line | null {
  const parts = lineId.split('-');
  if (parts.length !== 3) return null;
  const [typeStr, rStr, cStr] = parts;
  const r = parseInt(rStr, 10);
  const c = parseInt(cStr, 10);

  if (typeStr === 'h') {
    return state.horizontalLines[r]?.[c] || null;
  } else if (typeStr === 'v') {
    return state.verticalLines[r]?.[c] || null;
  }
  return null;
}

export function getAllAvailableLines(state: GameState): Line[] {
  const available: Line[] = [];
  for (const row of state.horizontalLines) {
    for (const line of row) {
      if (!line.owner) available.push(line);
    }
  }
  for (const row of state.verticalLines) {
    for (const line of row) {
      if (!line.owner) available.push(line);
    }
  }
  return available;
}

export function countSides(state: GameState, box: Box): number {
  let count = 0;
  if (findLine(state, box.topLineId)?.owner) count++;
  if (findLine(state, box.bottomLineId)?.owner) count++;
  if (findLine(state, box.leftLineId)?.owner) count++;
  if (findLine(state, box.rightLineId)?.owner) count++;
  return count;
}

export function makeMove(state: GameState, lineId: string): { state: GameState; boxesScored: number } {
  const line = findLine(state, lineId);
  if (!line || line.owner || state.isGameOver) {
    return { state, boxesScored: 0 };
  }

  // Clear previous last move markers
  clearLastMove(state);

  // Assign line owner
  line.owner = state.currentPlayer;
  line.isLastMove = true;

  // Check adjacent boxes for completion
  const claimedBoxIds: string[] = [];
  const boxCount = state.config.gridSize - 1;

  for (let r = 0; r < boxCount; r++) {
    for (let c = 0; c < boxCount; c++) {
      const box = state.boxes[r][c];
      if (!box.owner && countSides(state, box) === 4) {
        box.owner = state.currentPlayer;
        box.isJustCompleted = true;
        claimedBoxIds.push(box.id);
      }
    }
  }

  const boxesScored = claimedBoxIds.length;
  state.scores[state.currentPlayer] += boxesScored;

  // Track history move
  state.history.push({
    lineId,
    player: state.currentPlayer,
    boxesClaimed: claimedBoxIds,
    timestamp: Date.now(),
  });
  state.redoStack = []; // Clear redo on new move

  // Streak counter
  if (boxesScored > 0) {
    state.streakCount += boxesScored;
  } else {
    state.streakCount = 0;
  }

  // Check Game Over
  const totalBoxes = boxCount * boxCount;
  const currentTotalClaimed = state.scores[1] + state.scores[2];

  if (currentTotalClaimed >= totalBoxes) {
    state.isGameOver = true;
    if (state.scores[1] > state.scores[2]) {
      state.winner = 1;
    } else if (state.scores[2] > state.scores[1]) {
      state.winner = 2;
    } else {
      state.winner = 'tie';
    }
  } else if (boxesScored === 0) {
    // Switch turn if no box completed
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }

  state.turnTimer = state.config.timerDuration || 15;
  return { state, boxesScored };
}

export function undoMove(state: GameState): GameState | null {
  if (state.history.length === 0) return null;

  const lastMove = state.history.pop()!;
  state.redoStack.push(lastMove);

  const line = findLine(state, lastMove.lineId);
  if (line) {
    line.owner = null;
    line.isLastMove = false;
  }

  // Revert box claims
  for (const boxId of lastMove.boxesClaimed) {
    const parts = boxId.split('-');
    const r = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    if (state.boxes[r]?.[c]) {
      state.boxes[r][c].owner = null;
      state.boxes[r][c].isJustCompleted = false;
    }
  }

  state.scores[lastMove.player] -= lastMove.boxesClaimed.length;
  state.currentPlayer = lastMove.player;
  state.isGameOver = false;
  state.winner = null;

  // Restore last move indicator to previous move
  if (state.history.length > 0) {
    const prevLine = findLine(state, state.history[state.history.length - 1].lineId);
    if (prevLine) prevLine.isLastMove = true;
  }

  return state;
}

function clearLastMove(state: GameState) {
  for (const row of state.horizontalLines) {
    for (const l of row) l.isLastMove = false;
  }
  for (const row of state.verticalLines) {
    for (const l of row) l.isLastMove = false;
  }
}
