import React, { createContext, useContext, useState } from 'react';

export interface Player {
  id: string;
  name: string;
  email: string;
  hc: number;
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

  // Fixed: Single, robust join function
  const joinTournament = (user: Player) => {
    setAllRegisteredPlayers(prev => [...prev, user]);
    // We add them to the active roster immediately but unassigned
    setConfig(prev => ({
      ...prev,
      players: [...prev.players, { ...user, team: 'UNASSIGNED', groupId: null }]
    }));
  };

  const [currentUser] = useState({ id: 'user_123', role: 'ADMIN' });

  return (
    <TournamentContext.Provider value={{ 
      config, 
      setConfig, 
      currentUser, 
      allRegisteredPlayers, 
      joinTournament 
    }}>
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournament = () => {
  const context = useContext(TournamentContext);
  if (!context) return { config: { players: [] }, currentUser: { role: 'GUEST' } };
  return context;
};