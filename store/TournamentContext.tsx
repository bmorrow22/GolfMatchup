import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole   = 'OWNER' | 'ADMIN' | 'PLAYER';
export type TeamId     = 'A' | 'B' | 'C' | 'D' | 'UNASSIGNED';
export type FormatType = 'TOTALS' | 'SCRAMBLE' | 'ALT-SHOT' | 'SINGLES';

export interface Player {
  id: string;           // Real UUID from tournament_players table
  userId?: string;      // UUID from auth.users — undefined for placeholders
  name: string;
  email?: string;
  hc: number;
  role: UserRole;
  team: TeamId;
  groupId: number | null;
  isPlaceholder?: boolean;
}

export interface Pairing {
  id: string;
  roundIndex: number;
  segmentIndex: number;   
  teamAPlayers: string[]; 
  teamBPlayers: string[];
}

export interface CurrentUser {
  id: string;       
  name: string;
  email: string;
  hc: number;
  role: UserRole;
}

export interface RoundConfig {
  course: string;
  formats: FormatType[];
}

export interface TournamentConfig {
  id: string;
  ownerId: string;
  name?: string;
  rounds: number;
  roundsData: RoundConfig[];
  isMatchplay: boolean;
  isHandicapEnabled: boolean;
  pointsPerHole: number;
  pointsPerHolePush: number;
  pointsPerSegment: number;
  pointsPerSegmentPush: number;
  players: Player[];
  pairings: Pairing[];
  status: 'SETUP' | 'ACTIVE' | 'COMPLETE';
}

export type ScoreMap = Record<number, Record<number, Record<string, string>>>;

// ─── Context interface ────────────────────────────────────────────────────────

interface TournamentContextType {
  config: TournamentConfig | null;
  setConfig: (c: TournamentConfig | null) => void;
  currentUser: CurrentUser | null;
  setCurrentUser: (u: CurrentUser | null) => void;
  userRole: UserRole | null;
  myPlayer: Player | null;
  scores: ScoreMap;
  createTournament: (name: string) => Promise<TournamentConfig | null>;
  joinByCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  joinTournament: (player: Omit<Player, 'id'>) => void;
  refreshTournament: () => Promise<void>;
  addPlaceholders: (teamCount: number, playersPerTeam: number) => Promise<void>;
  updatePlayerTeam: (playerId: string, team: TeamId) => void;
  updatePlayerHandicap: (playerId: string, hc: number) => void;
  updatePlayerGroup: (playerId: string, groupId: number | null) => void;
  removePlayer: (playerId: string) => void;
  savePairings: (pairings: Pairing[]) => Promise<void>;
  updateScore: (roundIndex: number, holeIndex: number, playerId: string, value: string) => void;
  syncScoresToSupabase: (roundIndex: number) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TournamentContext = createContext<TournamentContextType | null>(null);

export const TournamentProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, _setConfig] = useState<TournamentConfig | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [scores, setScores] = useState<ScoreMap>({});

  const configRef = useRef<TournamentConfig | null>(null);
  useEffect(() => { configRef.current = config; }, [config]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const userRole: UserRole | null = (() => {
    if (!currentUser || !config) return null;
    if (config.ownerId === currentUser.id) return 'OWNER';
    const found = config.players.find(p => p.userId === currentUser.id);
    return (found?.role as UserRole) ?? 'PLAYER';
  })();

  const myPlayer: Player | null =
    config?.players.find(p => p.userId === currentUser?.id) ?? null;

  // ── Auth listener ───────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) _hydrateUser(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) _hydrateUser(session.user);
      else setCurrentUser(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const _hydrateUser = async (authUser: any) => {
    // FIX: Using maybeSingle() to handle brand new users who don't have a profile row yet
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle(); 
    
    if (error) { console.error('[hydrate] profile error:', error.message); return; }
    
    if (data) {
      setCurrentUser({
        id: data.id,
        name: data.name,
        email: data.email,
        hc: data.handicap ?? 0,
        role: 'PLAYER',
      });
    } else {
      console.warn("User has no profile row. Sign-up flow should insert into profiles table.");
    }
  };

  // ── Realtime: live scores + roster changes ──────────────────────────────────

  useEffect(() => {
    if (!config) return;
    const channel = supabase
      .channel(`tournament:${config.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'scores',
        filter: `tournament_id=eq.${config.id}`,
      }, (payload: any) => {
        const s = payload.new;
        if (!s) return;
        setScores(prev => {
          const next = { ...prev };
          if (!next[s.round_index]) next[s.round_index] = {};
          if (!next[s.round_index][s.hole_number - 1]) next[s.round_index][s.hole_number - 1] = {};
          next[s.round_index][s.hole_number - 1][s.tournament_player_id] = String(s.gross_score ?? '');
          return next;
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tournament_players',
        filter: `tournament_id=eq.${config.id}`,
      }, () => {
        refreshTournament();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [config?.id]);

  // ── Create Tournament ───────────────────────────────────────────────────────

  const createTournament = async (name: string): Promise<TournamentConfig | null> => {
    if (!currentUser) return null;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const defaultRoundsData: RoundConfig[] = [{ course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] }];

    const { error: tErr } = await supabase.from('tournaments').insert({
      id: code,
      owner_id: currentUser.id,
      name: name || `${currentUser.name.split(' ')[0]}'s Tournament`,
      rounds: 1,
      rounds_data: defaultRoundsData,
      is_matchplay: true,
      is_handicap_enabled: true,
      points_per_hole: 1,
      points_per_hole_push: 0,
      points_per_segment: 2,
      points_per_segment_push: 1,
      status: 'SETUP',
    });

    if (tErr) return null;

    // FIX: Insert owner and immediately SELECT back to get the database's UUID
    const { data: playerRow, error: pErr } = await supabase
      .from('tournament_players')
      .insert({
        tournament_id: code,
        user_id: currentUser.id,        
        display_name: currentUser.name,
        handicap: currentUser.hc,
        team: 'UNASSIGNED',
        role: 'OWNER',
        is_placeholder: false,
        group_id: null,
      })
      .select()
      .single();

    if (pErr) return null;

    const newConfig: TournamentConfig = {
      id: code,
      ownerId: currentUser.id,
      name: name || `${currentUser.name.split(' ')[0]}'s Tournament`,
      rounds: 1,
      roundsData: defaultRoundsData,
      isMatchplay: true,
      isHandicapEnabled: true,
      pointsPerHole: 1,
      pointsPerHolePush: 0,
      pointsPerSegment: 2,
      pointsPerSegmentPush: 1,
      players: [{
        id: playerRow.id,         // Real DB UUID
        userId: currentUser.id,   
        name: currentUser.name,
        email: currentUser.email,
        hc: currentUser.hc,
        role: 'OWNER',
        team: 'UNASSIGNED',
        groupId: null,
        isPlaceholder: false,
      }],
      pairings: [],
      status: 'SETUP',
    };

    _setConfig(newConfig);
    return newConfig;
  };

  // ── Add Placeholder Slots ───────────────────────────────────────────────────

  const addPlaceholders = async (teamCount: number, playersPerTeam: number) => {
    const cfg = configRef.current;
    if (!cfg || !currentUser) return;

    const tCount = Math.min(Math.max(teamCount, 1), 4);
    const pCount = Math.max(playersPerTeam, 1);
    const teamLabels = (['A', 'B', 'C', 'D'] as TeamId[]).slice(0, tCount);

    const realPlayers = cfg.players.filter(p => !p.isPlaceholder);

    const rowsToInsert: any[] = [];
    for (const team of teamLabels) {
      const existing = realPlayers.filter(p => p.team === team).length;
      const needed = pCount - existing;
      for (let i = 1; i <= needed; i++) {
        rowsToInsert.push({
          tournament_id: cfg.id,
          user_id: null,
          display_name: `Team ${team} · Slot ${existing + i}`,
          handicap: 0,
          team,
          role: 'PLAYER',
          is_placeholder: true,
          group_id: null,
        });
      }
    }

    if (rowsToInsert.length === 0) return;

    // FIX: Insert and select back real UUIDs for placeholders
    const { data: inserted, error } = await supabase
      .from('tournament_players')
      .insert(rowsToInsert)
      .select();

    if (error) return;

    const newPlayers: Player[] = (inserted ?? []).map((row: any): Player => ({
      id: row.id,             
      userId: undefined,
      name: row.display_name,
      hc: 0,
      role: 'PLAYER',
      team: row.team as TeamId,
      groupId: null,
      isPlaceholder: true,
    }));

    _setConfig({ ...cfg, players: [...realPlayers, ...newPlayers] });
  };

  // ── Join by Invite Code ─────────────────────────────────────────────────────

  const joinByCode = async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Not signed in' };

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('*, tournament_players(*), pairings(*)')
      .eq('id', code.toUpperCase())
      .single();

    if (error || !tournament) return { success: false, error: 'Tournament not found' };

    const existing = (tournament.tournament_players ?? []).find(
      (p: any) => p.user_id === currentUser.id
    );

    if (!existing) {
      const placeholder = (tournament.tournament_players ?? []).find(
        (p: any) => p.is_placeholder && !p.user_id
      );
      if (placeholder) {
        await supabase.from('tournament_players').update({
          user_id: currentUser.id,
          display_name: currentUser.name,
          handicap: currentUser.hc,
          is_placeholder: false,
        }).eq('id', placeholder.id);
      } else {
        await supabase.from('tournament_players').insert({
          tournament_id: code.toUpperCase(),
          user_id: currentUser.id,
          display_name: currentUser.name,
          handicap: currentUser.hc,
          team: 'UNASSIGNED',
          role: 'PLAYER',
          is_placeholder: false,
          group_id: null,
        });
      }
    }

    const { data: refreshed } = await supabase
      .from('tournaments')
      .select('*, tournament_players(*), pairings(*)')
      .eq('id', code.toUpperCase())
      .single();

    const cfg = _mapTournament(refreshed ?? tournament);
    _setConfig(cfg);
    await _loadScores(cfg);
    return { success: true };
  };

  const refreshTournament = async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    const { data } = await supabase
      .from('tournaments')
      .select('*, tournament_players(*), pairings(*)')
      .eq('id', cfg.id)
      .single();
    if (data) {
      const updated = _mapTournament(data);
      _setConfig(updated);
      await _loadScores(updated);
    }
  };

  const _loadScores = async (cfg: TournamentConfig) => {
    const { data } = await supabase
      .from('scores')
      .select('*')
      .eq('tournament_id', cfg.id);
    if (!data) return;
    const map: ScoreMap = {};
    data.forEach((s: any) => {
      if (!map[s.round_index]) map[s.round_index] = {};
      if (!map[s.round_index][s.hole_number - 1]) map[s.round_index][s.hole_number - 1] = {};
      map[s.round_index][s.hole_number - 1][s.tournament_player_id] = String(s.gross_score ?? '');
    });
    setScores(map);
  };

  const _mapTournament = (data: any): TournamentConfig => ({
    id: data.id,
    ownerId: data.owner_id,
    name: data.name,
    rounds: data.rounds,
    roundsData: data.rounds_data ?? [],
    isMatchplay: data.is_matchplay,
    isHandicapEnabled: data.is_handicap_enabled,
    pointsPerHole: data.points_per_hole,
    pointsPerHolePush: data.points_per_hole_push,
    pointsPerSegment: data.points_per_segment,
    pointsPerSegmentPush: data.points_per_segment_push,
    status: data.status,
    players: (data.tournament_players ?? []).map((p: any): Player => ({
      id: p.id,                        
      userId: p.user_id ?? undefined,  
      name: p.display_name,
      hc: p.handicap ?? 0,
      role: (p.role ?? 'PLAYER') as UserRole,
      team: (p.team ?? 'UNASSIGNED') as TeamId,
      groupId: p.group_id ?? null,
      isPlaceholder: p.is_placeholder ?? false,
    })),
    pairings: (data.pairings ?? []).map((p: any): Pairing => ({
      id: p.id,
      roundIndex: p.round_index,
      segmentIndex: p.segment_index,
      teamAPlayers: p.team_a_players ?? [],
      teamBPlayers: p.team_b_players ?? [],
    })),
  });

  const setConfig = async (cfg: TournamentConfig | null) => {
    _setConfig(cfg);
    if (!cfg) return;
    await supabase.from('tournaments').update({
      name: cfg.name,
      rounds: cfg.rounds,
      rounds_data: cfg.roundsData,
      is_matchplay: cfg.isMatchplay,
      is_handicap_enabled: cfg.isHandicapEnabled,
      points_per_hole: cfg.pointsPerHole,
      points_per_hole_push: cfg.pointsPerHolePush,
      points_per_segment: cfg.pointsPerSegment,
      points_per_segment_push: cfg.pointsPerSegmentPush,
      status: cfg.status,
    }).eq('id', cfg.id);
  };

  const joinTournament = (player: Omit<Player, 'id'>) => {
    const cfg = configRef.current;
    if (!cfg) return;
    _setConfig({ ...cfg, players: [...cfg.players, { ...player, id: `local-${Date.now()}` }] });
  };

  const updatePlayerTeam = (playerId: string, team: TeamId) => {
    const cfg = configRef.current;
    if (!cfg) return;
    _setConfig({ ...cfg, players: cfg.players.map(p => p.id === playerId ? { ...p, team } : p) });
    supabase.from('tournament_players').update({ team }).eq('id', playerId).then(() => {});
  };

  const updatePlayerHandicap = (playerId: string, hc: number) => {
    const cfg = configRef.current;
    if (!cfg) return;
    _setConfig({ ...cfg, players: cfg.players.map(p => p.id === playerId ? { ...p, hc } : p) });
    supabase.from('tournament_players').update({ handicap: hc }).eq('id', playerId).then(() => {});
  };

  const updatePlayerGroup = (playerId: string, groupId: number | null) => {
    const cfg = configRef.current;
    if (!cfg) return;
    _setConfig({ ...cfg, players: cfg.players.map(p => p.id === playerId ? { ...p, groupId } : p) });
    supabase.from('tournament_players').update({ group_id: groupId }).eq('id', playerId).then(() => {});
  };

  const removePlayer = (playerId: string) => {
    const cfg = configRef.current;
    if (!cfg) return;
    _setConfig({ ...cfg, players: cfg.players.filter(p => p.id !== playerId) });
    supabase.from('tournament_players').delete().eq('id', playerId).then(() => {});
  };

  const savePairings = async (pairings: Pairing[]) => {
    const cfg = configRef.current;
    if (!cfg) return;

    // FIX: Guard against any lingering local- IDs before inserting into DB
    const valid = pairings.filter(p =>
      p.teamAPlayers.every(id => !id.startsWith('local-')) &&
      p.teamBPlayers.every(id => !id.startsWith('local-'))
    );

    _setConfig({ ...cfg, pairings: valid });

    await supabase.from('pairings').delete().eq('tournament_id', cfg.id);

    if (valid.length === 0) return;

    await supabase.from('pairings').insert(
      valid.map(p => ({
        tournament_id: cfg.id,
        round_index: p.roundIndex,
        segment_index: p.segmentIndex,
        team_a_players: p.teamAPlayers,
        team_b_players: p.teamBPlayers,
      }))
    );
  };

  const updateScore = (roundIndex: number, holeIndex: number, playerId: string, value: string) => {
    setScores(prev => {
      const next = { ...prev };
      if (!next[roundIndex]) next[roundIndex] = {};
      if (!next[roundIndex][holeIndex]) next[roundIndex][holeIndex] = {};
      next[roundIndex][holeIndex][playerId] = value;
      return next;
    });
  };

  const syncScoresToSupabase = async (roundIndex: number) => {
    const cfg = configRef.current;
    const player = cfg?.players.find(p => p.userId === currentUser?.id);
    if (!cfg || !player) return;

    const roundScores = scores[roundIndex] ?? {};
    const upserts: any[] = [];

    Object.entries(roundScores).forEach(([holeIdx, players]) => {
      Object.entries(players).forEach(([pid, val]) => {
        if (pid !== player.id) return; 
        const gross = parseInt(val);
        if (!isNaN(gross) && gross > 0) {
          upserts.push({
            tournament_id: cfg.id,
            tournament_player_id: pid,
            round_index: roundIndex,
            hole_number: parseInt(holeIdx) + 1,
            gross_score: gross,
          });
        }
      });
    });

    if (upserts.length === 0) return;
    await supabase.from('scores').upsert(upserts, {
      onConflict: 'tournament_id,tournament_player_id,round_index,hole_number',
    });
  };

  return (
    <TournamentContext.Provider value={{
      config,
      setConfig,
      currentUser,
      setCurrentUser,
      userRole,
      myPlayer,
      scores,
      createTournament,
      joinByCode,
      joinTournament,
      refreshTournament,
      addPlaceholders,
      updatePlayerTeam,
      updatePlayerHandicap,
      updatePlayerGroup,
      removePlayer,
      savePairings,
      updateScore,
      syncScoresToSupabase,
    }}>
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournament = (): TournamentContextType => {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error('useTournament must be used within TournamentProvider');
  return ctx;
};