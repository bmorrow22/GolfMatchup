import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole   = 'OWNER' | 'ADMIN' | 'PLAYER';
export type TeamId     = 'A' | 'B' | 'C' | 'D' | 'UNASSIGNED';
export type FormatType = 'TOTALS' | 'SCRAMBLE' | 'ALT-SHOT' | 'SINGLES';

export interface Player {
  id: string;           // UUID from tournament_players
  userId?: string;      // UUID from auth.users (null for placeholders)
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
  segmentIndex: number;   // 0=front9, 1=back9
  teamAPlayers: string[]; // Player ids
  teamBPlayers: string[];
}

export interface CurrentUser {
  id: string;       // auth.users UUID
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

// scores[roundIndex][hole_number (0-based)][playerRosterId] = gross score string
export type ScoreMap = Record<number, Record<number, Record<string, string>>>;

// ─── Context Interface ────────────────────────────────────────────────────────

interface TournamentContextType {
  config: TournamentConfig | null;
  setConfig: (c: TournamentConfig | null) => void;
  currentUser: CurrentUser | null;
  setCurrentUser: (u: CurrentUser | null) => void;
  userRole: UserRole | null;
  myPlayer: Player | null;         // current user's Player row in the active tournament
  scores: ScoreMap;
  // Actions
  createTournament: (name: string) => Promise<TournamentConfig | null>;
  joinByCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  joinTournament: (player: Omit<Player, 'id'>) => void;
  updatePlayerTeam: (playerId: string, team: TeamId) => void;
  updatePlayerHandicap: (playerId: string, hc: number) => void;
  updatePlayerGroup: (playerId: string, groupId: number | null) => void;
  removePlayer: (playerId: string) => void;
  savePairings: (pairings: Pairing[]) => Promise<void>;
  updateScore: (roundIndex: number, holeIndex: number, playerId: string, value: string) => void;
  syncScoresToSupabase: (roundIndex: number) => Promise<void>;
  refreshTournament: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TournamentContext = createContext<TournamentContextType | null>(null);

export const TournamentProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, setConfig] = useState<TournamentConfig | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [scores, setScores] = useState<ScoreMap>({});

  // ── Derived values ──────────────────────────────────────────
  const userRole: UserRole | null = (() => {
    if (!currentUser || !config) return null;
    if (config.ownerId === currentUser.id) return 'OWNER';
    const found = config.players.find(p => p.userId === currentUser.id);
    return found?.role ?? 'PLAYER';
  })();

  const myPlayer: Player | null =
    config?.players.find(p => p.userId === currentUser?.id) ?? null;

  // ── Supabase session listener ───────────────────────────────
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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();
    if (data) {
      setCurrentUser({
        id: data.id,
        name: data.name,
        email: data.email,
        hc: data.handicap ?? 0,
        role: 'PLAYER',
      });
    }
  };

  // ── Realtime score subscription ─────────────────────────────
  useEffect(() => {
    if (!config) return;
    const channel = supabase
      .channel(`scores:${config.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scores',
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [config?.id]);

  // ── Create Tournament ───────────────────────────────────────
  const createTournament = async (name: string): Promise<TournamentConfig | null> => {
    if (!currentUser) return null;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const newTournament: TournamentConfig = {
      id: code,
      ownerId: currentUser.id,
      name,
      rounds: 1,
      roundsData: [{ course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] }],
      isMatchplay: true,
      isHandicapEnabled: true,
      pointsPerHole: 1,
      pointsPerHolePush: 0,
      pointsPerSegment: 2,
      pointsPerSegmentPush: 1,
      players: [{
        id: `local-${currentUser.id}`,
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

    const { error } = await supabase.from('tournaments').insert({
      id: code,
      owner_id: currentUser.id,
      name,
      rounds: newTournament.rounds,
      rounds_data: newTournament.roundsData,
      is_matchplay: newTournament.isMatchplay,
      is_handicap_enabled: newTournament.isHandicapEnabled,
      points_per_hole: newTournament.pointsPerHole,
      points_per_hole_push: newTournament.pointsPerHolePush,
      points_per_segment: newTournament.pointsPerSegment,
      points_per_segment_push: newTournament.pointsPerSegmentPush,
      status: 'SETUP',
    });

    if (error) { console.error('createTournament error', error); return null; }

    // Add owner to roster
    await supabase.from('tournament_players').insert({
      tournament_id: code,
      user_id: currentUser.id,
      display_name: currentUser.name,
      handicap: currentUser.hc,
      team: 'UNASSIGNED',
      role: 'OWNER',
      is_placeholder: false,
    });

    setConfig(newTournament);
    return newTournament;
  };

  // ── Join by Code ────────────────────────────────────────────
  const joinByCode = async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Not signed in' };

    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('*, tournament_players(*), pairings(*)')
      .eq('id', code.toUpperCase())
      .single();

    if (error || !tournament) return { success: false, error: 'Tournament not found' };

    // Upsert the player into the roster
    await supabase.from('tournament_players').upsert({
      tournament_id: code.toUpperCase(),
      user_id: currentUser.id,
      display_name: currentUser.name,
      handicap: currentUser.hc,
      team: 'UNASSIGNED',
      role: 'PLAYER',
      is_placeholder: false,
    }, { onConflict: 'tournament_id,user_id' });

    const cfg = _mapTournament(tournament);
    setConfig(cfg);
    await _loadScores(cfg);
    return { success: true };
  };

  // ── Refresh from Supabase ───────────────────────────────────
  const refreshTournament = async () => {
    if (!config) return;
    const { data } = await supabase
      .from('tournaments')
      .select('*, tournament_players(*), pairings(*)')
      .eq('id', config.id)
      .single();
    if (data) {
      const cfg = _mapTournament(data);
      setConfig(cfg);
      await _loadScores(cfg);
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
      userId: p.user_id,
      name: p.display_name,
      hc: p.handicap ?? 0,
      role: p.role ?? 'PLAYER',
      team: p.team ?? 'UNASSIGNED',
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

  // ── Local config mutations (synced to Supabase on save) ─────

  const joinTournament = (player: Omit<Player, 'id'>) => {
    if (!config) return;
    const newPlayer: Player = { ...player, id: `local-${Date.now()}` };
    setConfig({ ...config, players: [...config.players, newPlayer] });
  };

  const updatePlayerTeam = (playerId: string, team: TeamId) => {
    if (!config) return;
    const players = config.players.map(p => p.id === playerId ? { ...p, team } : p);
    setConfig({ ...config, players });
    supabase.from('tournament_players').update({ team }).eq('id', playerId).then(() => {});
  };

  const updatePlayerHandicap = (playerId: string, hc: number) => {
    if (!config) return;
    const players = config.players.map(p => p.id === playerId ? { ...p, hc } : p);
    setConfig({ ...config, players });
    supabase.from('tournament_players').update({ handicap: hc }).eq('id', playerId).then(() => {});
  };

  const updatePlayerGroup = (playerId: string, groupId: number | null) => {
    if (!config) return;
    const players = config.players.map(p => p.id === playerId ? { ...p, groupId } : p);
    setConfig({ ...config, players });
    supabase.from('tournament_players').update({ group_id: groupId }).eq('id', playerId).then(() => {});
  };

  const removePlayer = (playerId: string) => {
    if (!config) return;
    setConfig({ ...config, players: config.players.filter(p => p.id !== playerId) });
    supabase.from('tournament_players').delete().eq('id', playerId).then(() => {});
  };

  const savePairings = async (pairings: Pairing[]) => {
    if (!config) return;
    setConfig({ ...config, pairings });
    await supabase.from('pairings')
      .delete()
      .eq('tournament_id', config.id);
    await supabase.from('pairings').insert(
      pairings.map(p => ({
        tournament_id: config.id,
        round_index: p.roundIndex,
        segment_index: p.segmentIndex,
        team_a_players: p.teamAPlayers,
        team_b_players: p.teamBPlayers,
      }))
    );
  };

  // ── Score management ────────────────────────────────────────

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
    if (!config || !myPlayer) return;
    const roundScores = scores[roundIndex] ?? {};
    const upserts = Object.entries(roundScores).flatMap(([holeIdx, players]) =>
      Object.entries(players)
        .filter(([pid]) => pid === myPlayer.id) // only sync own scores
        .map(([pid, val]) => ({
          tournament_id: config.id,
          tournament_player_id: pid,
          round_index: roundIndex,
          hole_number: parseInt(holeIdx) + 1,
          gross_score: parseInt(val) || null,
        }))
    );
    if (upserts.length > 0) {
      await supabase.from('scores').upsert(upserts, {
        onConflict: 'tournament_id,tournament_player_id,round_index,hole_number',
      });
    }
  };

  // ── Also persist config changes to Supabase ─────────────────
  const setConfigAndSync = async (cfg: TournamentConfig | null) => {
    setConfig(cfg);
    if (!cfg) return;
    await supabase.from('tournaments').update({
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

  return (
    <TournamentContext.Provider value={{
      config,
      setConfig: setConfigAndSync,
      currentUser,
      setCurrentUser,
      userRole,
      myPlayer,
      scores,
      createTournament,
      joinByCode,
      joinTournament,
      updatePlayerTeam,
      updatePlayerHandicap,
      updatePlayerGroup,
      removePlayer,
      savePairings,
      updateScore,
      syncScoresToSupabase,
      refreshTournament,
    }}>
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournament = (): TournamentContextType => {
  const ctx = useContext(TournamentContext);
  if (!ctx) return {
    config: null, setConfig: () => {}, currentUser: null, setCurrentUser: () => {},
    userRole: null, myPlayer: null, scores: {},
    createTournament: async () => null,
    joinByCode: async () => ({ success: false }),
    joinTournament: () => {}, updatePlayerTeam: () => {}, updatePlayerHandicap: () => {},
    updatePlayerGroup: () => {}, removePlayer: () => {},
    savePairings: async () => {}, updateScore: () => {}, syncScoresToSupabase: async () => {},
    refreshTournament: async () => {},
  };
  return ctx;
};