import type { GameState, Line, Box } from './types';
import { getAllAvailableLines, findLine, countSides, makeMove } from './gameEngine';

// ─── Deep Clone ───────────────────────────────────────────────────────────────
// makeMove mutates state in-place, so we must clone before every simulation step.

function cloneState(state: GameState): GameState {
  return {
    config: state.config, // config is read-only — safe to share reference
    currentPlayer: state.currentPlayer,
    horizontalLines: state.horizontalLines.map(row =>
      row.map(l => ({ ...l }))
    ),
    verticalLines: state.verticalLines.map(row =>
      row.map(l => ({ ...l }))
    ),
    boxes: state.boxes.map(row =>
      row.map(b => ({ ...b }))
    ),
    scores: { 1: state.scores[1], 2: state.scores[2] },
    history: [...state.history],
    redoStack: [...state.redoStack],
    isGameOver: state.isGameOver,
    winner: state.winner,
    turnTimer: state.turnTimer,
    streakCount: state.streakCount,
  };
}

/** Apply a move on a CLONE of the state — never touches the real state. */
function simulateMove(state: GameState, lineId: string) {
  const clone = cloneState(state);
  return makeMove(clone, lineId);
}

// ─── Public Entry ────────────────────────────────────────────────────────────

export function getAiMove(state: GameState, difficulty: 'easy' | 'medium' | 'hard'): Line | null {
  const availableLines = getAllAvailableLines(state);
  if (availableLines.length === 0) return null;

  // ── Easy: mostly random, only occasionally completes boxes ───────────────
  if (difficulty === 'easy') {
    const completing = getCompletingLines(state, availableLines);
    if (completing.length > 0 && Math.random() < 0.6) {
      return completing[Math.floor(Math.random() * completing.length)];
    }
    return availableLines[Math.floor(Math.random() * availableLines.length)];
  }

  // ── Medium: greedy — complete boxes, avoid giving 3-sided ────────────────
  if (difficulty === 'medium') {
    const completing = getCompletingLines(state, availableLines);
    if (completing.length > 0) return completing[0];

    const safeLines = getSafeLines(state, availableLines);
    if (safeLines.length > 0) {
      return safeLines[Math.floor(Math.random() * safeLines.length)];
    }
    return selectLeastDamagingUnsafeMove(state, availableLines);
  }

  // ── Hard: minimax with alpha-beta pruning (safe, clones state) ───────────
  return hardAiMove(state, availableLines);
}

// ─── Hard AI – Minimax ───────────────────────────────────────────────────────

function adaptiveDepth(movesLeft: number): number {
  if (movesLeft <= 8)  return 8;
  if (movesLeft <= 16) return 6;
  if (movesLeft <= 24) return 5;
  if (movesLeft <= 32) return 4;
  return 3;
}

function hardAiMove(state: GameState, availableLines: Line[]): Line {
  // Always grab a free box immediately (trivially optimal)
  const completing = getCompletingLines(state, availableLines);
  if (completing.length > 0) {
    // Among capturing moves, pick the one that leaves fewest 3-sided boxes for opponent
    return completing.reduce((best, line) => {
      return scoreCapture(state, line) <= scoreCapture(state, best) ? line : best;
    });
  }

  const depth = adaptiveDepth(availableLines.length);
  const aiPlayer = state.currentPlayer;

  let bestScore = -Infinity;
  let bestLine = availableLines[0];

  // Move ordering: safe lines first, then least damaging unsafe
  const safeLines = getSafeLines(state, availableLines);
  const unsafeLines = availableLines
    .filter(l => !safeLines.includes(l))
    .sort((a, b) => estimateChainLength(state, a) - estimateChainLength(state, b));
  const orderedLines = [...safeLines, ...unsafeLines];

  for (const line of orderedLines) {
    const { state: nextState } = simulateMove(state, line.id);
    const isSameTurn = nextState.currentPlayer === aiPlayer;
    const score = minimax(nextState, depth - 1, -Infinity, Infinity, isSameTurn, aiPlayer);
    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  aiPlayer: number
): number {
  if (state.isGameOver || depth === 0) {
    return evaluate(state, aiPlayer);
  }

  const lines = getAllAvailableLines(state);
  if (lines.length === 0) return evaluate(state, aiPlayer);

  // Move ordering for better pruning
  const completing = getCompletingLines(state, lines);
  const safe = getSafeLines(state, lines.filter(l => !completing.includes(l)));
  const rest = lines
    .filter(l => !completing.includes(l) && !safe.includes(l))
    .sort((a, b) => estimateChainLength(state, a) - estimateChainLength(state, b));
  const orderedLines = [...completing, ...safe, ...rest];

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const line of orderedLines) {
      const { state: next } = simulateMove(state, line.id);
      const isSameTurn = next.currentPlayer === aiPlayer;
      const val = minimax(next, depth - 1, alpha, beta, isSameTurn, aiPlayer);
      maxEval = Math.max(maxEval, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const line of orderedLines) {
      const { state: next } = simulateMove(state, line.id);
      const isSameTurn = next.currentPlayer !== aiPlayer;
      const val = minimax(next, depth - 1, alpha, beta, !isSameTurn, aiPlayer);
      minEval = Math.min(minEval, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function evaluate(state: GameState, aiPlayer: number): number {
  const opp = aiPlayer === 1 ? 2 : 1;
  return state.scores[aiPlayer] - state.scores[opp];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCompletingLines(state: GameState, availableLines: Line[]): Line[] {
  const boxCount = state.config.gridSize - 1;
  const completing: Set<Line> = new Set();

  for (let r = 0; r < boxCount; r++) {
    for (let c = 0; c < boxCount; c++) {
      const box = state.boxes[r][c];
      if (!box.owner && countSides(state, box) === 3) {
        const missingId = [box.topLineId, box.bottomLineId, box.leftLineId, box.rightLineId]
          .find(id => !findLine(state, id)?.owner);
        if (missingId) {
          const l = findLine(state, missingId);
          if (l) completing.add(l);
        }
      }
    }
  }

  return Array.from(completing);
}

function getSafeLines(state: GameState, availableLines: Line[]): Line[] {
  return availableLines.filter(line => {
    const adjacentBoxes = getAdjacentBoxes(state, line);
    return adjacentBoxes.every(box => countSides(state, box) < 2);
  });
}

function getAdjacentBoxes(state: GameState, line: Line): Box[] {
  const boxes: Box[] = [];
  const boxCount = state.config.gridSize - 1;
  for (let r = 0; r < boxCount; r++) {
    for (let c = 0; c < boxCount; c++) {
      const box = state.boxes[r][c];
      if (
        box.topLineId === line.id ||
        box.bottomLineId === line.id ||
        box.leftLineId === line.id ||
        box.rightLineId === line.id
      ) boxes.push(box);
    }
  }
  return boxes;
}

function estimateChainLength(state: GameState, line: Line): number {
  return getAdjacentBoxes(state, line)
    .filter(box => countSides(state, box) === 2).length;
}

function scoreCapture(state: GameState, line: Line): number {
  const { state: next } = simulateMove(state, line.id);
  const available = getAllAvailableLines(next);
  return getCompletingLines(next, available).length;
}

function selectLeastDamagingUnsafeMove(state: GameState, availableLines: Line[]): Line {
  let minChainLength = Infinity;
  let bestLine = availableLines[0];
  for (const line of availableLines) {
    const chainLen = estimateChainLength(state, line);
    if (chainLen < minChainLength) {
      minChainLength = chainLen;
      bestLine = line;
    }
  }
  return bestLine;
}
