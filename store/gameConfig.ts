// This mimics a database/settings choice
export const CURRENT_GAME_CONFIG = {
  courseKey: 'SOUTH', // Matches COURSES.SOUTH in TorreyData
  side: 'front9',     // or 'back9'
  format: 'TOTALS',   // or 'SINGLES'
  players: [
    { name: 'Braden', hc: 10 },
    { name: 'Partner', hc: 15 },
    { name: 'Opponent 1', hc: 12 },
    { name: 'Opponent 2', hc: 18 },
  ]
};