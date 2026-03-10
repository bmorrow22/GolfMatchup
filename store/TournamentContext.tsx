import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole   = 'OWNER' | 'ADMIN' | 'PLAYER';
export type TeamId     = 'A' | 'B' | 'C' | 'D' | 'UNASSIGNED';
export type FormatType = 'TOTALS' | 'SCRAMBLE' | 'ALT-SHOT' | 'SINGLES';
export type TeamNames  = Partial<Record<TeamId, string>>;

export interface Player {
  id: string;
  userId?: string;
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
  teamAId: TeamId;
  teamBId: TeamId;
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
  teamNames: TeamNames;
}

export type ScoreMap = Record<number, Record<number, Record<string, string>>>;

const ACTIVE_TOURNAMENT_KEY = 'golf_active_tournament_id';

interface TournamentContextType {
  myTournamentIds: string[];
  config: TournamentConfig | null;
  activeTournamentId: string | null;
  openTournament: (id: string) => Promise<void>;
  closeTournament: () => void;
  setConfig: (c: TournamentConfig | null) => void;
  currentUser: CurrentUser | null;
  setCurrentUser: (u: CurrentUser | null) => void;
  userRole: UserRole | null;
  myPlayer: Player | null;
  scores: ScoreMap;
  createTournament: (name: string) => Promise<TournamentConfig | null>;
  joinByCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  joinTournament: (player: Omit<Player, 'id'>) => Promise<void>;
  refreshTournament: () => Promise<void>;
  autoBalanceRoster: (teamCount: number, playersPerTeam: number) => Promise<void>;
  updatePlayerTeam: (playerId: string, team: TeamId) => void;
  updatePlayerHandicap: (playerId: string, hc: number) => void;
  updatePlayerGroup: (playerId: string, groupId: number | null) => void;
  removePlayer: (playerId: string) => void;
  updateTeamName: (teamId: TeamId, name: string) => void;
  savePairings: (pairings: Pairing[]) => Promise<void>;
  updateScore: (roundIndex: number, holeIndex: number, playerId: string, value: string) => void;
  syncScoresToSupabase: (roundIndex: number) => Promise<void>;
}

const TournamentContext = createContext<TournamentContextType | null>(null);

export const TournamentProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, _setConfig]               = useState<TournamentConfig | null>(null);
  const [activeTournamentId, setActiveTId] = useState<string | null>(null);
  const [myTournamentIds, setMyTIds]       = useState<string[]>([]);
  const [currentUser, setCurrentUser]      = useState<CurrentUser | null>(null);
  const [scores, setScores]                = useState<ScoreMap>({});

  const configRef      = useRef<TournamentConfig | null>(null);
  const currentUserRef = useRef<CurrentUser | null>(null);
  const scoresRef      = useRef<ScoreMap>({});

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  const userRole: UserRole | null = (() => {
    if (!currentUser || !config) return null;
    if (config.ownerId === currentUser.id) return 'OWNER';
    const found = config.players.find(p => p.userId === currentUser.id);
    return (found?.role as UserRole) ?? 'PLAYER';
  })();

  const myPlayer: Player | null =
    config?.players.find(p => p.userId === currentUser?.id) ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) _hydrateUser(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        _hydrateUser(session.user);
      } else {
        setCurrentUser(null);
        _setConfig(null);
        setActiveTId(null);
        setMyTIds([]);
        setScores({});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const _hydrateUser = async (authUser: any) => {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (error) { console.error('[hydrate]', error.message); return; }
    if (data) {
      const user: CurrentUser = {
        id: data.id, name: data.name, email: data.email,
        hc: data.handicap ?? 0, role: 'PLAYER',
      };
      setCurrentUser(user);
      await _loadMyTournaments(user);
    } else {
      console.warn('[hydrate] No profile row for:', authUser.id);
    }
  };

  const _loadMyTournaments = async (user: CurrentUser) => {
    try {
      const [{ data: playerRows }, { data: ownedRows }] = await Promise.all([
        supabase.from('tournament_players').select('tournament_id').eq('user_id', user.id),
        supabase.from('tournaments').select('id').eq('owner_id', user.id),
      ]);
      const ids = Array.from(new Set([
        ...(playerRows ?? []).map((r: any) => r.tournament_id),
        ...(ownedRows ?? []).map((r: any) => r.id),
      ]));
      setMyTIds(ids);
      const storedId = await AsyncStorage.getItem(ACTIVE_TOURNAMENT_KEY);
      if (storedId && ids.includes(storedId) && !configRef.current) {
        await _loadTournamentById(storedId);
      }
    } catch (err) {
      console.warn('[loadMyTournaments]', err);
    }
  };

  const _loadTournamentById = async (id: string) => {
    const { data } = await supabase
      .from('tournaments')
      .select('*, tournament_players(*), pairings(*)')
      .eq('id', id).single();
    if (!data) return;
    const cfg = _mapTournament(data);
    _setConfig(cfg);
    setActiveTId(id);
    await _loadScores(cfg);
  };

  const openTournament = async (id: string) => {
    setScores({});
    await _loadTournamentById(id);
    await AsyncStorage.setItem(ACTIVE_TOURNAMENT_KEY, id);
  };

  const closeTournament = () => {
    _setConfig(null);
    setActiveTId(null);
    setScores({});
    AsyncStorage.removeItem(ACTIVE_TOURNAMENT_KEY);
  };

  useEffect(() => {
    if (!config) return;
    const channel = supabase.channel(`tournament:${config.id}`)
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
      }, () => refreshTournament())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [config?.id]);

  const createTournament = async (name: string): Promise<TournamentConfig | null> => {
    if (!currentUser) return null;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const defaultRoundsData: RoundConfig[] = [{ course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] }];
    const defaultTeamNames: TeamNames = { A: 'Team A', B: 'Team B', C: 'Team C', D: 'Team D' };

    const { error: tErr } = await supabase.from('tournaments').insert({
      id: code,
      owner_id: currentUser.id,
      name: name || `${currentUser.name.split(' ')[0]}'s Tournament`,
      rounds: 1, rounds_data: defaultRoundsData,
      is_matchplay: true, is_handicap_enabled: true,
      points_per_hole: 1, points_per_hole_push: 0,
      points_per_segment: 2, points_per_segment_push: 1,
      status: 'SETUP', team_names: defaultTeamNames,
    });
    if (tErr) { console.error('[createTournament]', tErr.message); return null; }

    const { data: playerRow, error: pErr } = await supabase
      .from('tournament_players')
      .insert({
        tournament_id: code, user_id: currentUser.id,
        display_name: currentUser.name, handicap: currentUser.hc,
        team: 'UNASSIGNED', role: 'OWNER', is_placeholder: false, group_id: null,
      }).select().single();
    if (pErr) { console.error('[createTournament player]', pErr.message); return null; }

    const newConfig: TournamentConfig = {
      id: code, ownerId: currentUser.id,
      name: name || `${currentUser.name.split(' ')[0]}'s Tournament`,
      rounds: 1, roundsData: defaultRoundsData,
      isMatchplay: true, isHandicapEnabled: true,
      pointsPerHole: 1, pointsPerHolePush: 0,
      pointsPerSegment: 2, pointsPerSegmentPush: 1,
      players: [{ id: playerRow.id, userId: currentUser.id, name: currentUser.name,
        email: currentUser.email, hc: currentUser.hc, role: 'OWNER',
        team: 'UNASSIGNED', groupId: null, isPlaceholder: false }],
      pairings: [], status: 'SETUP', teamNames: defaultTeamNames,
    };
    _setConfig(newConfig);
    setActiveTId(code);
    setMyTIds(prev => Array.from(new Set([...prev, code])));
    await AsyncStorage.setItem(ACTIVE_TOURNAMENT_KEY, code);
    return newConfig;
  };

  // Smart roster balance: snake-draft unassigned real players by HC, fill rest with placeholders
  const autoBalanceRoster = async (teamCount: number, playersPerTeam: number) => {
    const cfg = configRef.current;
    if (!cfg || !currentUser) return;
    const tc = Math.min(Math.max(teamCount, 1), 4);
    const pc = Math.max(playersPerTeam, 1);
    const teamLabels = (['A', 'B', 'C', 'D'] as TeamId[]).slice(0, tc);

    const realPlayers = cfg.players.filter(p => !p.isPlaceholder);
    const placeholders = cfg.players.filter(p => p.isPlaceholder);

    if (placeholders.length > 0) {
      await supabase.from('tournament_players')
        .delete().in('id', placeholders.map(p => p.id));
    }

    // Snake-draft assignment for unassigned players sorted by HC
    const unassigned = realPlayers.filter(p => p.team === 'UNASSIGNED').sort((a, b) => a.hc - b.hc);
    const assignments: { playerId: string; team: TeamId }[] = [];
    unassigned.forEach((p, i) => {
      const forward = i % (tc * 2) < tc;
      const pos = forward ? i % (tc * 2) : (tc * 2 - 1) - (i % (tc * 2));
      assignments.push({ playerId: p.id, team: teamLabels[pos % tc] });
    });

    for (const { playerId, team } of assignments) {
      await supabase.from('tournament_players').update({ team }).eq('id', playerId);
    }

    const updatedReal = realPlayers.map(p => {
      const a = assignments.find(x => x.playerId === p.id);
      return a ? { ...p, team: a.team } : p;
    });

    const teamCounts = Object.fromEntries(teamLabels.map(t => [
      t, updatedReal.filter(p => p.team === t).length
    ]));
    const rowsToInsert: any[] = [];
    for (const team of teamLabels) {
      const existing = teamCounts[team] ?? 0;
      const needed = pc - existing;
      for (let i = 1; i <= needed; i++) {
        rowsToInsert.push({
          tournament_id: cfg.id, user_id: null,
          display_name: `${cfg.teamNames?.[team] ?? `Team ${team}`} · Slot ${existing + i}`,
          handicap: 0, team, role: 'PLAYER', is_placeholder: true, group_id: null,
        });
      }
    }

    let newPlaceholders: Player[] = [];
    if (rowsToInsert.length > 0) {
      const { data: inserted, error } = await supabase
        .from('tournament_players').insert(rowsToInsert).select();
      if (error) console.error('[autoBalance]', error.message);
      newPlaceholders = (inserted ?? []).map((row: any): Player => ({
        id: row.id, userId: undefined, name: row.display_name, hc: 0,
        role: 'PLAYER', team: row.team as TeamId, groupId: null, isPlaceholder: true,
      }));
    }
    _setConfig({ ...cfg, players: [...updatedReal, ...newPlaceholders] });
  };

  const joinByCode = async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Not signed in' };
    const { data: tournament, error } = await supabase
      .from('tournaments').select('*, tournament_players(*), pairings(*)')
      .eq('id', code.toUpperCase()).single();
    if (error || !tournament) return { success: false, error: 'Tournament not found' };

    const existing = (tournament.tournament_players ?? []).find((p: any) => p.user_id === currentUser.id);
    if (!existing) {
      const placeholder = (tournament.tournament_players ?? []).find((p: any) => p.is_placeholder && !p.user_id);
      if (placeholder) {
        await supabase.from('tournament_players').update({
          user_id: currentUser.id, display_name: currentUser.name,
          handicap: currentUser.hc, is_placeholder: false,
        }).eq('id', placeholder.id);
      } else {
        await supabase.from('tournament_players').insert({
          tournament_id: code.toUpperCase(), user_id: currentUser.id,
          display_name: currentUser.name, handicap: currentUser.hc,
          team: 'UNASSIGNED', role: 'PLAYER', is_placeholder: false, group_id: null,
        });
      }
    }
    const { data: refreshed } = await supabase
      .from('tournaments').select('*, tournament_players(*), pairings(*)')
      .eq('id', code.toUpperCase()).single();
    const cfg = _mapTournament(refreshed ?? tournament);
    _setConfig(cfg);
    setActiveTId(code.toUpperCase());
    await _loadScores(cfg);
    setMyTIds(prev => Array.from(new Set([...prev, code.toUpperCase()])));
    await AsyncStorage.setItem(ACTIVE_TOURNAMENT_KEY, code.toUpperCase());
    return { success: true };
  };

  const refreshTournament = async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    const { data } = await supabase
      .from('tournaments').select('*, tournament_players(*), pairings(*)')
      .eq('id', cfg.id).single();
    if (data) { const updated = _mapTournament(data); _setConfig(updated); await _loadScores(updated); }
  };

  const _loadScores = async (cfg: TournamentConfig) => {
    const { data } = await supabase.from('scores').select('*').eq('tournament_id', cfg.id);
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
    id: data.id, ownerId: data.owner_id, name: data.name, rounds: data.rounds,
    roundsData: data.rounds_data ?? [],
    isMatchplay: data.is_matchplay, isHandicapEnabled: data.is_handicap_enabled,
    pointsPerHole: data.points_per_hole, pointsPerHolePush: data.points_per_hole_push,
    pointsPerSegment: data.points_per_segment, pointsPerSegmentPush: data.points_per_segment_push,
    status: data.status,
    teamNames: (data.team_names as TeamNames) ?? { A: 'Team A', B: 'Team B', C: 'Team C', D: 'Team D' },
    players: (data.tournament_players ?? []).map((p: any): Player => ({
      id: p.id, userId: p.user_id ?? undefined, name: p.display_name,
      hc: p.handicap ?? 0, role: (p.role ?? 'PLAYER') as UserRole,
      team: (p.team ?? 'UNASSIGNED') as TeamId, groupId: p.group_id ?? null,
      isPlaceholder: p.is_placeholder ?? false,
    })),
    pairings: (data.pairings ?? []).map((p: any): Pairing => ({
      id: p.id, roundIndex: p.round_index, segmentIndex: p.segment_index,
      teamAId: (p.team_a_id ?? 'A') as TeamId, teamBId: (p.team_b_id ?? 'B') as TeamId,
      teamAPlayers: p.team_a_players ?? [], teamBPlayers: p.team_b_players ?? [],
    })),
  });

  const setConfig = async (cfg: TournamentConfig | null) => {
    _setConfig(cfg);
    if (!cfg) return;
    await supabase.from('tournaments').update({
      name: cfg.name, rounds: cfg.rounds, rounds_data: cfg.roundsData,
      is_matchplay: cfg.isMatchplay, is_handicap_enabled: cfg.isHandicapEnabled,
      points_per_hole: cfg.pointsPerHole, points_per_hole_push: cfg.pointsPerHolePush,
      points_per_segment: cfg.pointsPerSegment, points_per_segment_push: cfg.pointsPerSegmentPush,
      status: cfg.status, team_names: cfg.teamNames,
    }).eq('id', cfg.id);
  };

  const joinTournament = async (player: Omit<Player, 'id'>) => {
    const cfg = configRef.current;
    if (!cfg) return;

    // Avoid duplicate inserts
    const alreadyIn = cfg.players.find(p => p.userId === player.userId);
    if (alreadyIn) return;

    const { data: inserted, error } = await supabase
      .from('tournament_players')
      .insert({
        tournament_id: cfg.id,
        user_id: player.userId ?? null,
        display_name: player.name,
        handicap: player.hc,
        team: player.team ?? 'UNASSIGNED',
        role: player.role ?? 'PLAYER',
        is_placeholder: false,
        group_id: player.groupId ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[joinTournament]', error.message);
      return;
    }

    const newPlayer: Player = {
      id: inserted.id,
      userId: inserted.user_id ?? undefined,
      name: inserted.display_name,
      hc: inserted.handicap ?? 0,
      role: (inserted.role ?? 'PLAYER') as UserRole,
      team: (inserted.team ?? 'UNASSIGNED') as TeamId,
      groupId: inserted.group_id ?? null,
      isPlaceholder: false,
    };

    _setConfig({ ...cfg, players: [...cfg.players, newPlayer] });
    setMyTIds(prev => Array.from(new Set([...prev, cfg.id])));
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

  const updateTeamName = (teamId: TeamId, name: string) => {
    const cfg = configRef.current;
    if (!cfg) return;
    const newNames = { ...cfg.teamNames, [teamId]: name };
    _setConfig({ ...cfg, teamNames: newNames });
    supabase.from('tournaments').update({ team_names: newNames }).eq('id', cfg.id).then(() => {});
  };

  const savePairings = async (pairings: Pairing[]) => {
    const cfg = configRef.current;
    if (!cfg) return;

    // Only accept pairings where every player id is a real UUID from the DB.
    // Temp ids like 'local-...', 'auto-...', 'manual-...' are rejected.
    const isRealId = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const valid = pairings.filter(p => {
      const aOk = p.teamAPlayers.length > 0 && p.teamAPlayers.every(isRealId);
      const bOk = p.teamBPlayers.length > 0 && p.teamBPlayers.every(isRealId);
      if (!aOk || !bOk) {
        console.warn('[savePairings] skipping pairing with non-UUID player ids:', p);
      }
      return aOk && bOk;
    });

    // Guard: never wipe existing pairings if nothing valid to save
    if (valid.length === 0) {
      console.warn('[savePairings] no valid pairings — aborting to protect existing data');
      return;
    }

    const { error: delErr } = await supabase
      .from('pairings').delete().eq('tournament_id', cfg.id);
    if (delErr) { console.error('[savePairings delete]', delErr.message); return; }

    const { data: inserted, error: insErr } = await supabase
      .from('pairings').insert(valid.map(p => ({
        tournament_id: cfg.id, round_index: p.roundIndex, segment_index: p.segmentIndex,
        team_a_id: p.teamAId, team_b_id: p.teamBId,
        team_a_players: p.teamAPlayers, team_b_players: p.teamBPlayers,
      }))).select();
    if (insErr) { console.error('[savePairings insert]', insErr.message); return; }

    const saved: Pairing[] = (inserted ?? []).map((p: any) => ({
      id: p.id, roundIndex: p.round_index, segmentIndex: p.segment_index,
      teamAId: p.team_a_id ?? 'A', teamBId: p.team_b_id ?? 'B',
      teamAPlayers: p.team_a_players ?? [], teamBPlayers: p.team_b_players ?? [],
    }));
    _setConfig({ ...cfg, pairings: saved });
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
    const user = currentUserRef.current;
    if (!cfg || !user) return;
    const isOwner = cfg.ownerId === user.id;
    const myPlayerRow = cfg.players.find(p => p.userId === user.id);
    if (!myPlayerRow && !isOwner) return;
    const roundScores = scoresRef.current[roundIndex] ?? {};
    const upserts: any[] = [];
    Object.entries(roundScores).forEach(([holeIdx, players]) => {
      Object.entries(players).forEach(([pid, val]) => {
        if (!isOwner && pid !== myPlayerRow?.id) return;
        const gross = parseInt(val);
        if (!isNaN(gross) && gross > 0) {
          upserts.push({
            tournament_id: cfg.id, tournament_player_id: pid,
            round_index: roundIndex, hole_number: parseInt(holeIdx) + 1, gross_score: gross,
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
      myTournamentIds, config, activeTournamentId, openTournament, closeTournament,
      setConfig, currentUser, setCurrentUser, userRole, myPlayer, scores,
      createTournament, joinByCode, joinTournament, refreshTournament,
      autoBalanceRoster, updatePlayerTeam, updatePlayerHandicap, updatePlayerGroup,
      removePlayer, updateTeamName, savePairings, updateScore, syncScoresToSupabase,
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