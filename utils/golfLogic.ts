import { FormatType } from '../store/TournamentContext';

// ── Handicap helpers ──────────────────────────────────────────────────────────

export const getStrokesForHole = (hc: number, si: number): number => {
  if (hc <= 0) return 0;
  return Math.floor(hc / 18) + (si <= (hc % 18) ? 1 : 0);
};

export const calculateNet = (gross: number, hc: number, si: number): number => {
  if (!gross || gross === 0) return 0;
  return gross - getStrokesForHole(hc, si);
};

// ── Hole result ───────────────────────────────────────────────────────────────
//
// FIXES applied here:
//
// 1. Returns null (not 'PUSH') when a hole hasn't been fully scored.
//    Previously returning 'PUSH' for missing scores caused phantom segment
//    points and wrong W/L display in the scorecard.
//
// 2. matchHistory must preserve null positions so index i always maps to
//    hole i. Callers must NOT .filter() this array.
//
// Format semantics:
//   SINGLES    → 1v1
//   SCRAMBLE   → one shared score per side (stored under player[0] each side)
//   ALT-SHOT   → same as SCRAMBLE for scoring
//   TOTALS     → lowest net of each 2-person side wins the hole

export const getHoleResult = (
  format: FormatType | string,
  scores: number[],    // [sideA_p0, sideA_p1, sideB_p0, sideB_p1]
  hcs: number[],
  si: number
): 'WIN' | 'LOSS' | 'PUSH' | null => {

  if (format === 'SINGLES') {
    const aScore = scores[0] ?? 0;
    const bScore = scores[2] ?? scores[1] ?? 0;
    if (!aScore || !bScore) return null;
    const aNet = calculateNet(aScore, hcs[0] ?? 0, si);
    const bNet = calculateNet(bScore, hcs[2] ?? hcs[1] ?? 0, si);
    if (aNet < bNet) return 'WIN';
    if (aNet > bNet) return 'LOSS';
    return 'PUSH';
  }

  if (format === 'SCRAMBLE' || format === 'ALT-SHOT') {
    const aScore = scores[0] ?? 0;
    const bScore = scores[2] ?? scores[1] ?? 0;
    if (!aScore || !bScore) return null;
    const aHc = Math.min(hcs[0] ?? 0, hcs[1] ?? hcs[0] ?? 0);
    const bHc = Math.min(hcs[2] ?? 0, hcs[3] ?? hcs[2] ?? 0);
    const aNet = calculateNet(aScore, aHc, si);
    const bNet = calculateNet(bScore, bHc, si);
    if (aNet < bNet) return 'WIN';
    if (aNet > bNet) return 'LOSS';
    return 'PUSH';
  }

  // TOTALS: lowest net of each two-person side
  const a0 = scores[0] ?? 0;
  const a1 = scores[1] ?? 0;
  const b0 = scores[2] ?? 0;
  const b1 = scores[3] ?? 0;
  const aHasScore = a0 > 0 || a1 > 0;
  const bHasScore = b0 > 0 || b1 > 0;
  if (!aHasScore || !bHasScore) return null;

  const aNets = [
    a0 > 0 ? calculateNet(a0, hcs[0] ?? 0, si) : 999,
    a1 > 0 ? calculateNet(a1, hcs[1] ?? hcs[0] ?? 0, si) : 999,
  ];
  const bNets = [
    b0 > 0 ? calculateNet(b0, hcs[2] ?? hcs[0] ?? 0, si) : 999,
    b1 > 0 ? calculateNet(b1, hcs[3] ?? hcs[0] ?? 0, si) : 999,
  ];

  const aNet = Math.min(...aNets);
  const bNet = Math.min(...bNets);
  if (aNet < bNet) return 'WIN';
  if (aNet > bNet) return 'LOSS';
  return 'PUSH';
};

// ── Match status banner ───────────────────────────────────────────────────────

export const getMatchStatus = (history: (('WIN' | 'LOSS' | 'PUSH') | null)[]): string => {
  const played = history.filter((r): r is 'WIN' | 'LOSS' | 'PUSH' => r !== null);
  const wins   = played.filter(r => r === 'WIN').length;
  const losses = played.filter(r => r === 'LOSS').length;
  const diff   = wins - losses;
  if (played.length === 0) return 'Not Started';
  if (diff === 0) return 'All Square';
  return diff > 0 ? `${diff} Up` : `${Math.abs(diff)} Down`;
};

// ── Segment result ────────────────────────────────────────────────────────────
//
// FIX #1: Losers get 0 points — always.
// Points are only awarded for winning or tying a segment.
// Accepts null entries (unscored holes are simply skipped).

export interface SegmentResult {
  winner: 'TEAM_A' | 'TEAM_B' | 'PUSH';
  teamAPoints: number;
  teamBPoints: number;
}

export const getSegmentResult = (
  results: (('WIN' | 'LOSS' | 'PUSH') | null)[],
  winPts = 2,
  pushPts = 1
): SegmentResult => {
  const played = results.filter((r): r is 'WIN' | 'LOSS' | 'PUSH' => r !== null);
  if (played.length === 0) return { winner: 'PUSH', teamAPoints: 0, teamBPoints: 0 };

  const wins   = played.filter(r => r === 'WIN').length;
  const losses = played.filter(r => r === 'LOSS').length;

  if (wins > losses)   return { winner: 'TEAM_A', teamAPoints: winPts,  teamBPoints: 0 };
  if (losses > wins)   return { winner: 'TEAM_B', teamAPoints: 0,       teamBPoints: winPts };
  return                      { winner: 'PUSH',   teamAPoints: pushPts, teamBPoints: pushPts };
};

// ── Per-hole display label ────────────────────────────────────────────────────
//
// Shows W / L / H in the scorecard grid row.
// These are per-hole indicators — NOT segment points.

export const holeResultLabel = (
  result: 'WIN' | 'LOSS' | 'PUSH' | null,
  isTeamASide: boolean
): { text: string; color: string } => {
  if (result === null)   return { text: '',  color: '#94a3b8' };
  if (result === 'PUSH') return { text: 'H', color: '#94a3b8' };
  if ((result === 'WIN') === isTeamASide) return { text: 'W', color: '#16a34a' };
  return { text: 'L', color: '#dc2626' };
};