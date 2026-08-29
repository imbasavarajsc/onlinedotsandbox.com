import type { GameState, Line, Box } from './types';
import { getAllAvailableLines, findLine, countSides } from './gameEngine';

export function getAiMove(state: GameState, difficulty: 'easy' | 'medium' | 'hard'): Line | null {
  const availableLines = getAllAvailableLines(state);
  if (availableLines.length === 0) return null;

  // 1. Check for immediate box completion moves (3 sides -> 4th side)
  const completingLines = getCompletingLines(state, availableLines);
  if (completingLines.length > 0) {
    // Always complete a box if available!
    if (difficulty === 'easy') {
      return completingLines[Math.floor(Math.random() * completingLines.length)];
    }
    // For medium & hard, complete boxes
    return completingLines[0];
  }

  // 2. Easy AI: pick random available line
  if (difficulty === 'easy') {
    return availableLines[Math.floor(Math.random() * availableLines.length)];
  }

  // 3. Find "Safe Moves" (moves that leave adjacent boxes with <= 2 sides)
  const safeLines = getSafeLines(state, availableLines);

  if (safeLines.length > 0) {
    if (difficulty === 'medium') {
      return safeLines[Math.floor(Math.random() * safeLines.length)];
    }
    
    // Hard AI: Pick safe move that minimizes future opponent opportunities or preserves center control
    return selectBestSafeMove(state, safeLines);
  }

  // 4. No safe moves available: forced to open a chain for opponent
  if (difficulty === 'medium') {
    // Pick random unsafe move
    return availableLines[Math.floor(Math.random() * availableLines.length)];
  }

  // Hard AI: Tactical chain length evaluation (give away the shortest chain!)
  return selectLeastDamagingUnsafeMove(state, availableLines);
}

function getCompletingLines(state: GameState, availableLines: Line[]): Line[] {
  const boxCount = state.config.gridSize - 1;
  const completing: Set<Line> = new Set();

  for (let r = 0; r < boxCount; r++) {
    for (let c = 0; c < boxCount; c++) {
      const box = state.boxes[r][c];
      if (!box.owner && countSides(state, box) === 3) {
        // Find which line of this box is unplaced
        const missingLineId = [box.topLineId, box.bottomLineId, box.leftLineId, box.rightLineId].find(
          id => !findLine(state, id)?.owner
        );
        if (missingLineId) {
          const l = findLine(state, missingLineId);
          if (l) completing.add(l);
        }
      }
    }
  }

  return Array.from(completing);
}

function getSafeLines(state: GameState, availableLines: Line[]): Line[] {
  return availableLines.filter(line => {
    // Simulating placing this line
    const adjacentBoxes = getAdjacentBoxes(state, line);
    for (const box of adjacentBoxes) {
      if (countSides(state, box) >= 2) {
        // Placing this 3rd side would allow opponent to complete on their turn!
        return false;
      }
    }
    return true;
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
      ) {
        boxes.push(box);
      }
    }
  }
  return boxes;
}

function selectBestSafeMove(state: GameState, safeLines: Line[]): Line {
  // Prefer central lines to outer edge lines to retain flexibility
  const N = state.config.gridSize;
  const center = (N - 1) / 2;

  let bestLine = safeLines[0];
  let minDistance = Infinity;

  for (const line of safeLines) {
    const dist = Math.hypot(line.row - center, line.col - center);
    if (dist < minDistance) {
      minDistance = dist;
      bestLine = line;
    }
  }
  return bestLine;
}

function selectLeastDamagingUnsafeMove(state: GameState, availableLines: Line[]): Line {
  // Estimate chain size opened by each line and pick line opening shortest chain
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

function estimateChainLength(state: GameState, line: Line): number {
  const adjBoxes = getAdjacentBoxes(state, line);
  let count = 0;
  for (const box of adjBoxes) {
    if (countSides(state, box) === 2) {
      count += 1;
    }
  }
  return count;
}
