import React, { createContext, useContext, useState } from 'react';

export interface Player {
  id: string;
  name: string;
  email: string;
  hc: number;
  role?: 'ADMIN' | 'PLAYER'; // Added role to the Player interface
  team: 'A' | 'B' | 'UNASSIGNED';
  groupId: number | null;
}

interface TournamentState {
  ownerId: string;
  course: 'SOUTH' | 'NORTH';
  segmentLength: 9 | 18;
  format: 'TOTALS' | 'SINGLES' | 'SCRAMBLE' | 'ALTSHOT';
  players: Player[]; 
}

const TournamentContext = createContext<any>(null);

export const TournamentProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, setConfig] = useState<TournamentState>({
    ownerId: 'user_123',
    course: 'SOUTH',
    segmentLength: 9,
    format: 'TOTALS',
    players: [], 
  });

  const [allRegisteredPlayers, setAllRegisteredPlayers] = useState<Player[]>([]);
  const [currentUser] = useState({ id: 'user_123', role: 'ADMIN' });

  // 1. Join Logic
  const joinTournament = (user: Player) => {
    setAllRegisteredPlayers(prev => [...prev, user]);
    setConfig(prev => ({
      ...prev,
      players: [...prev.players, { ...user, team: 'UNASSIGNED', groupId: null }]
    }));
  };

  // 2. Admin Logic: Update Handicap
  const updatePlayerHandicap = (playerId: string, newHC: number) => {
    setConfig(prev => ({
      ...prev,
      players: prev.players.map(p => p.id === playerId ? { ...p, hc: newHC } : p)
    }));
  };

  // 3. Admin Logic: Remove Player
  const removePlayer = (playerId: string) => {
    setConfig(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== playerId)
    }));
  };

  return (
    <TournamentContext.Provider value={{ 
      config, 
      setConfig, 
      currentUser, 
      allRegisteredPlayers, 
      joinTournament,
      updatePlayerHandicap, // Now being passed to the app
      removePlayer          // Now being passed to the app
    }}>
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournament = () => {
  const context = useContext(TournamentContext);
  // Default fallback to prevent "undefined" crashes
  if (!context) return { 
    config: { players: [] }, 
    currentUser: { role: 'GUEST' },
    joinTournament: () => {},
    updatePlayerHandicap: () => {},
    removePlayer: () => {}
  };
  return context;
};