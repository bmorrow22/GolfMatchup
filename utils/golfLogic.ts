/**
 * Calculates how many strokes a player gets on a specific hole
 * @param hc The player's handicap
 * @param si The Stroke Index of the hole (1-18)
 */
export const getStrokesForHole = (hc: number, si: number): number => {
  if (hc === 0) return 0;
  
  // Base strokes (e.g., a 20 HC gets at least 1 stroke per hole)
  let strokes = Math.floor(hc / 18);
  
  // Extra stroke if the SI is within the remainder
  // (e.g., a 20 HC has a remainder of 2, so they get an extra pop on SI 1 and 2)
  if (si <= (hc % 18)) {
    strokes += 1;
  }
  
  return strokes;
};

/**
 * Calculates the Net Score for a single player on a hole
 */
export const calculateNet = (gross: number, hc: number, si: number): number => {
  if (!gross || gross === 0) return 0;
  return gross - getStrokesForHole(hc, si);
};

/**
 * Main Scoring Engine: Determines if Team A won, lost, or pushed the hole
 */
export const getHoleResult = (
  format: string, 
  scores: number[], // [P1, P2, O1, O2]
  hcs: number[],    // [P1_HC, P2_HC, O1_HC, O2_HC]
  si: number
): 'WIN' | 'LOSS' | 'PUSH' => {
  
  let teamNet = 0;
  let oppNet = 0;

  if (format === 'TOTALS') {
    // Sum of both partners' net scores
    teamNet = calculateNet(scores[0], hcs[0], si) + calculateNet(scores[1], hcs[1], si);
    oppNet = calculateNet(scores[2], hcs[2], si) + calculateNet(scores[3], hcs[3], si);
  } else {
    // Singles or Scramble (Simplified for now to P1 vs O1)
    teamNet = calculateNet(scores[0], hcs[0], si);
    oppNet = calculateNet(scores[2], hcs[2], si);
  }

  if (teamNet < oppNet) return 'WIN';
  if (teamNet > oppNet) return 'LOSS';
  return 'PUSH';
};

/**
 * Converts the history of hole results into a Ryder Cup style string
 */
export const getMatchStatus = (history: ('WIN' | 'LOSS' | 'PUSH')[]) => {
  const wins = history.filter(r => r === 'WIN').length;
  const losses = history.filter(r => r === 'LOSS').length;
  const diff = wins - losses;

  if (diff === 0) return "All Square";
  return diff > 0 ? `${diff} Up` : `${Math.abs(diff)} Down`;
};