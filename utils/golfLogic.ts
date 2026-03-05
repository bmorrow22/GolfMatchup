import { FormatType } from '../store/TournamentContext';

export const getStrokesForHole = (hc: number, si: number): number => {
  if (hc <= 0) return 0;
  return Math.floor(hc / 18) + (si <= (hc % 18) ? 1 : 0);
};

export const calculateNet = (gross: number, hc: number, si: number): number => {
  if (!gross || gross === 0) return 0;
  return gross - getStrokesForHole(hc, si);
};

export const getHoleResult = (
  format: FormatType | string,
  scores: number[],
  hcs: number[],
  si: number
): 'WIN' | 'LOSS' | 'PUSH' => {
  let teamNet = 0, oppNet = 0;
  if (format === 'TOTALS') {
    teamNet = calculateNet(scores[0], hcs[0], si) + calculateNet(scores[1], hcs[1], si);
    oppNet  = calculateNet(scores[2], hcs[2], si) + calculateNet(scores[3], hcs[3], si);
  } else {
    teamNet = calculateNet(scores[0], hcs[0], si);
    oppNet  = calculateNet(scores[2] ?? scores[1], hcs[2] ?? hcs[1], si);
  }
  if (teamNet < oppNet) return 'WIN';
  if (teamNet > oppNet) return 'LOSS';
  return 'PUSH';
};

export const getMatchStatus = (history: ('WIN' | 'LOSS' | 'PUSH')[]): string => {
  const wins = history.filter(r => r === 'WIN').length;
  const losses = history.filter(r => r === 'LOSS').length;
  const diff = wins - losses;
  if (diff === 0) return 'All Square';
  return diff > 0 ? `${diff} Up` : `${Math.abs(diff)} Down`;
};

export interface SegmentResult {
  winner: 'TEAM_A' | 'TEAM_B' | 'PUSH';
  teamAPoints: number;
  teamBPoints: number;
}

export const getSegmentResult = (
  results: ('WIN' | 'LOSS' | 'PUSH')[],
  winPts = 2,
  pushPts = 1
): SegmentResult => {
  const wins = results.filter(r => r === 'WIN').length;
  const losses = results.filter(r => r === 'LOSS').length;
  if (wins > losses) return { winner: 'TEAM_A', teamAPoints: winPts, teamBPoints: 0 };
  if (losses > wins) return { winner: 'TEAM_B', teamAPoints: 0, teamBPoints: winPts };
  return { winner: 'PUSH', teamAPoints: pushPts, teamBPoints: pushPts };
};