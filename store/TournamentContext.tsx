import React, { createContext, useContext, useState } from 'react';

export interface Player {
  id: string;
  name: string;
  email?: string; // Made optional to support placeholders
  hc: number;
  role: 'ADMIN' | 'PLAYER'; 
  team: 'A' | 'B' | 'UNASSIGNED';
  groupId: number | null; // Keep this but allow null
  isPlaceholder?: boolean; // ADD THIS to fix setup.tsx errors
}

// FIXED: Added multi-round data structure and scoring logic
interface RoundConfig {
  course: string;
  formats: ('TOTALS' | 'SCRAMBLE' | 'ALT-SHOT' | 'SINGLES')[];
}

interface TournamentState {
  id: string; 
  ownerId: string; 
  rounds: number;
  roundsData: RoundConfig[];
  isMatchplay: boolean;
  pointsPerWin: number;
  pointsPerRound: number;
  players: Player[]; 
}

const TournamentContext = createContext<any>(null);

export const TournamentProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, setConfig] = useState<TournamentState | null>(null);
  const [currentUser, setCurrentUser] = useState<any>({
    id: 'user_123',
    name: 'Tournament Admin',
    role: 'ADMIN'
  });

  // 1. Join Logic - Now handles "Claiming" a placeholder slot
  const joinByCode = (code: string, userProfile: any) => {
    if (!config) return;

    // Logic: Look for the first placeholder slot. If found, replace it with the real user.
    // If no placeholders exist, append the user to the end.
    const roster = [...config.players];
    const placeholderIndex = roster.findIndex(p => p.isPlaceholder === true);

    if (placeholderIndex !== -1) {
      // Claim the existing slot (preserves Team assignment and ID for the bracket)
      roster[placeholderIndex] = {
        ...roster[placeholderIndex],
        ...userProfile,
        isPlaceholder: false, // Mark as filled
      };
    } else {
      // No slots left, just add them to the list
      roster.push({
        ...userProfile,
        hc: 0,
        role: 'PLAYER',
        team: 'UNASSIGNED',
        groupId: null,
        isPlaceholder: false
      });
    }

    setConfig({ ...config, players: roster });
  };

  // 2. Helper to update player team assignments
  const updatePlayerTeam = (playerId: string, team: 'A' | 'B') => {
    if (!config) return;
    setConfig({
      ...config,
      players: config.players.map(p => 
        p.id === playerId ? { ...p, team } : p
      )
    });
  };

  const updatePlayerHandicap = (playerId: string, newHC: number) => {
    if (!config) return;
    setConfig({
      ...config,
      players: config.players.map(p => 
        p.id === playerId ? { ...p, hc: newHC } : p
      )
    });
  };

  const removePlayer = (playerId: string) => {
    if (!config) return;
    setConfig({
      ...config,
      players: config.players.filter(p => p.id !== playerId)
    });
  };

  return (
    <TournamentContext.Provider value={{ 
      config, 
      setConfig, 
      currentUser, 
      setCurrentUser,
      joinByCode,
      updatePlayerHandicap,
      updatePlayerTeam,
      removePlayer
    }}>
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournament = () => {
  const context = useContext(TournamentContext);
  if (!context) return { config: null, currentUser: null };
  return context;
};