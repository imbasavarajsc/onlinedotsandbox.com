import type { GameStats, PlayerId } from './types';

const STORAGE_KEY = 'dots_and_boxes_stats';

const DEFAULT_STATS: GameStats = {
  gamesPlayed: 0,
  p1Wins: 0,
  p2Wins: 0,
  ties: 0,
  easyAiWins: 0,
  mediumAiWins: 0,
  hardAiWins: 0,
  totalBoxesCompleted: 0,
  longestStreak: 0,
};

export function loadStats(): GameStats {
  if (typeof window === 'undefined') return DEFAULT_STATS;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return DEFAULT_STATS;
    return { ...DEFAULT_STATS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_STATS;
  }
}

export function saveStats(stats: GameStats): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save stats:', e);
  }
}

export function recordGameResult(
  winner: PlayerId | 'tie',
  p1Boxes: number,
  p2Boxes: number,
  isVsAi: boolean,
  aiDifficulty?: 'easy' | 'medium' | 'hard',
  maxStreak: number = 0
): GameStats {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  stats.totalBoxesCompleted += (p1Boxes + p2Boxes);

  if (maxStreak > stats.longestStreak) {
    stats.longestStreak = maxStreak;
  }

  if (winner === 'tie') {
    stats.ties += 1;
  } else if (winner === 1) {
    stats.p1Wins += 1;
    if (isVsAi && aiDifficulty) {
      if (aiDifficulty === 'easy') stats.easyAiWins += 1;
      if (aiDifficulty === 'medium') stats.mediumAiWins += 1;
      if (aiDifficulty === 'hard') stats.hardAiWins += 1;
    }
  } else {
    stats.p2Wins += 1;
  }

  saveStats(stats);
  return stats;
}

export function resetStats(): GameStats {
  saveStats(DEFAULT_STATS);
  return DEFAULT_STATS;
}
