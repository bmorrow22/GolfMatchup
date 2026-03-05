import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MatchBanner } from '../../components/MatchBanner';
import { COURSES, HoleData } from '../../constants/TorreyData';
import { Player, useTournament } from '../../store/TournamentContext';
import { calculateNet, getHoleResult, getMatchStatus, getStrokesForHole } from '../../utils/golfLogic';

// ─── Score Cell Styling (birdie/par/bogey/eagle) ──────────────────────────────
function scoreCellStyle(gross: number, par: number) {
  if (!gross || gross === 0) return {};
  const diff = gross - par;
  if (diff <= -2) return { bg: '#1e3a8a', border: '#1e3a8a', double: true }; // eagle or better
  if (diff === -1) return { bg: '#16a34a', border: '#16a34a', circle: true }; // birdie
  if (diff === 0) return { bg: '#fff', border: '#94a3b8' }; // par (square)
  if (diff === 1) return { bg: '#fff', border: '#dc2626', bogey: true }; // bogey (single box)
  return { bg: '#dc2626', border: '#dc2626', double: true }; // double bogey+
}

interface ScoreCellProps {
  gross: number;
  par: number;
  net?: number;
  isEditable?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

function ScoreCell({ gross, par, isEditable, onPress, size = 'md' }: ScoreCellProps) {
  const style = scoreCellStyle(gross, par);
  const dim = size === 'sm' ? 28 : size === 'lg' ? 52 : 38;
  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 22 : 15;

  return (
    <TouchableOpacity onPress={onPress} disabled={!isEditable} style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={[
          styles.scoreCell,
          { width: dim, height: dim, borderRadius: style.circle ? dim / 2 : 4 },
          style.double && styles.doubleBorder,
          { backgroundColor: style.bg || '#f8f9fa', borderColor: style.border || '#e2e8f0' },
          isEditable && { borderStyle: 'dashed' },
        ]}
      >
        <Text
          style={[
            styles.scoreCellText,
            { fontSize },
            (style.bg && style.bg !== '#fff') ? { color: '#fff' } : { color: '#1e293b' },
            style.bogey && { color: '#dc2626' },
          ]}
        >
          {gross > 0 ? gross : '-'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Scorecard Screen ────────────────────────────────────────────────────
export default function ScorecardScreen() {
  const { config, currentUser, myPlayer, scores, updateScore, syncScoresToSupabase } = useTournament();

  // ── ALL HOOKS FIRST ────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'GRID' | 'FOCUS'>('GRID');
  const [focusHole, setFocusHole] = useState(0);
  const [activeRound, setActiveRound] = useState(0);
  const [activeSegment, setActiveSegment] = useState(0); // 0=front, 1=back
  const [editingHole, setEditingHole] = useState<{ holeIdx: number; playerId: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // ── Derived values & memos (safe to access config?.) ───────────────────────
  const roundData = config?.roundsData?.[activeRound] ?? { course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] };
  const course = COURSES[roundData.course as keyof typeof COURSES] ?? COURSES['SOUTH'];
  const format = roundData.formats?.[activeSegment] ?? 'TOTALS';
  const holeData: HoleData[] = activeSegment === 0 ? course.front9 : course.back9;
  const segOffset = activeSegment === 0 ? 0 : 9;

  const myPairing = useMemo(() => {
    if (!myPlayer) return null;
    return config?.pairings.find(p =>
      p.roundIndex === activeRound &&
      p.segmentIndex === activeSegment &&
      (p.teamAPlayers.includes(myPlayer.id) || p.teamBPlayers.includes(myPlayer.id))
    ) ?? null;
  }, [config?.pairings, myPlayer, activeRound, activeSegment]);

  const visiblePlayers: Player[] = useMemo(() => {
    if (!myPairing) {
      // No pairing yet — show all players (setup/admin view)
      return config?.players ?? [];
    }
    const allIds = [...myPairing.teamAPlayers, ...myPairing.teamBPlayers];
    return config?.players.filter(p => allIds.includes(p.id)) ?? [];
  }, [myPairing, config?.players]);

  const editablePlayers: Set<string> = useMemo(() => {
    if (!myPlayer || !myPairing) return new Set(myPlayer ? [myPlayer.id] : []);
    const myTeamPlayers = myPairing.teamAPlayers.includes(myPlayer.id)
      ? myPairing.teamAPlayers
      : myPairing.teamBPlayers;
    return new Set(myTeamPlayers);
  }, [myPlayer, myPairing]);

  const teamAPlayers = myPairing
    ? config?.players.filter(p => myPairing.teamAPlayers.includes(p.id)) ?? []
    : config?.players.filter(p => p.team === 'A') ?? [];

  const teamBPlayers = myPairing
    ? config?.players.filter(p => myPairing.teamBPlayers.includes(p.id)) ?? []
    : config?.players.filter(p => p.team === 'B') ?? [];

  // ── Score helper ───────────────────────────────────────────────────────────
  const getScore = useCallback((playerId: string, holeIdx: number): number => {
    return parseInt(scores?.[activeRound]?.[segOffset + holeIdx]?.[playerId] ?? '') || 0;
  }, [scores, activeRound, segOffset]);

  const handleScoreEdit = (holeIdx: number, playerId: string) => {
    if (!editablePlayers.has(playerId)) {
      Alert.alert('Read Only', "You can only enter scores for your own team.");
      return;
    }
    const current = scores?.[activeRound]?.[segOffset + holeIdx]?.[playerId] ?? '';
    setEditValue(current);
    setEditingHole({ holeIdx, playerId });
  };

  const commitEdit = () => {
    if (!editingHole) return;
    const val = editValue.trim();
    updateScore(activeRound, segOffset + editingHole.holeIdx, editingHole.playerId, val);
    setEditingHole(null);
    // Debounced sync
    setTimeout(() => syncScoresToSupabase(activeRound), 1500);
  };

  // ── Match history ──────────────────────────────────────────────────────────
  const matchHistory = useMemo(() => {
    return holeData.map((hole, idx) => {
      const aScores = teamAPlayers.map(p => getScore(p.id, idx));
      const bScores = teamBPlayers.map(p => getScore(p.id, idx));
      const aHcs = teamAPlayers.map(p => p.hc);
      const bHcs = teamBPlayers.map(p => p.hc);
      const allScores = [...aScores, ...bScores];
      const allHcs = [...aHcs, ...bHcs];
      const filled = allScores.filter(s => s > 0).length;
      if (filled < 2) return null;
      return getHoleResult(format, allScores, allHcs, hole.si);
    }).filter((r): r is 'WIN' | 'LOSS' | 'PUSH' => r !== null);
  }, [holeData, teamAPlayers, teamBPlayers, scores, activeRound, segOffset]);

  const segLabel = `R${activeRound + 1} · ${activeSegment === 0 ? 'Front 9' : 'Back 9'} · ${format}`;

  // ── EARLY RETURN ONLY AFTER ALL HOOKS ──────────────────────────────────────
  if (!config || !config.players?.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Active Tournament</Text>
        <Text style={styles.emptyText}>Create or join a tournament from the Home tab.</Text>
      </View>
    );
  }

  // ── GRID VIEW ──────────────────────────────────────────────────────────────
  const renderGrid = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Header row */}
        <View style={styles.gridHeader}>
          <View style={styles.gridPlayerCol}>
            <Text style={styles.gridHeaderText}>PLAYER</Text>
          </View>
          <View style={styles.gridMetricCol}>
            <Text style={styles.gridHeaderText}>METRIC</Text>
          </View>
          {holeData.map((hole, i) => (
            <View key={i} style={styles.gridHoleCol}>
              <Text style={styles.gridHeaderHole}>{hole.hole}</Text>
              <Text style={styles.gridHeaderPar}>P{hole.par}</Text>
            </View>
          ))}
          <View style={styles.gridTotalCol}>
            <Text style={styles.gridHeaderText}>TOT</Text>
          </View>
        </View>

        <ScrollView style={{ maxHeight: 480 }}>
          {visiblePlayers.map((player, pIdx) => {
            const isMyTeam = editablePlayers.has(player.id);
            const isOpponent = !isMyTeam;
            const netTotal = holeData.reduce((sum, hole, i) => {
              const g = getScore(player.id, i);
              return sum + (g > 0 ? calculateNet(g, player.hc, hole.si) : 0);
            }, 0);
            const grossTotal = holeData.reduce((sum, _, i) => sum + getScore(player.id, i), 0);

            return (
              <View key={player.id}>
                {/* Actual Score row */}
                <View style={[styles.gridRow, isOpponent && styles.gridRowOpponent, pIdx === 0 && styles.gridRowFirst]}>
                  <View style={[styles.gridPlayerCol, styles.gridPlayerCell]}>
                    <Text style={styles.gridPlayerName} numberOfLines={1}>{player.name}</Text>
                    <View style={[styles.teamDot, { backgroundColor: player.team === 'A' ? '#1e3a8a' : player.team === 'B' ? '#dc2626' : '#64748b' }]} />
                  </View>
                  <View style={styles.gridMetricCol}>
                    <Text style={styles.gridMetricText}>Gross</Text>
                  </View>
                  {holeData.map((hole, i) => {
                    const g = getScore(player.id, i);
                    const canEdit = editablePlayers.has(player.id);
                    return (
                      <View key={i} style={styles.gridHoleCol}>
                        <ScoreCell
                          gross={g}
                          par={hole.par}
                          isEditable={canEdit}
                          onPress={() => handleScoreEdit(i, player.id)}
                          size="sm"
                        />
                      </View>
                    );
                  })}
                  <View style={styles.gridTotalCol}>
                    <Text style={styles.gridTotalText}>{grossTotal > 0 ? grossTotal : '—'}</Text>
                  </View>
                </View>

                {/* Net Score row */}
                {config.isHandicapEnabled && (
                  <View style={[styles.gridRow, styles.gridRowNet, isOpponent && styles.gridRowOpponent]}>
                    <View style={styles.gridPlayerCol} />
                    <View style={styles.gridMetricCol}>
                      <Text style={[styles.gridMetricText, { color: '#1e3a8a' }]}>Net</Text>
                    </View>
                    {holeData.map((hole, i) => {
                      const g = getScore(player.id, i);
                      const net = g > 0 ? calculateNet(g, player.hc, hole.si) : 0;
                      const pops = getStrokesForHole(player.hc, hole.si);
                      return (
                        <View key={i} style={styles.gridHoleCol}>
                          <Text style={styles.gridNetText}>{net > 0 ? net : '—'}</Text>
                          {pops > 0 && <Text style={styles.popDot}>{'•'.repeat(pops)}</Text>}
                        </View>
                      );
                    })}
                    <View style={styles.gridTotalCol}>
                      <Text style={[styles.gridTotalText, { color: '#1e3a8a' }]}>{netTotal > 0 ? netTotal : '—'}</Text>
                    </View>
                  </View>
                )}

                {/* Match Points row (only at end, after all scores) */}
                <View style={[styles.gridRow, styles.gridRowPoints, isOpponent && styles.gridRowOpponent]}>
                  <View style={styles.gridPlayerCol} />
                  <View style={styles.gridMetricCol}>
                    <Text style={[styles.gridMetricText, { color: '#16a34a', fontSize: 9 }]}>Match Pts</Text>
                  </View>
                  {holeData.map((hole, i) => {
                    const result = matchHistory[i];
                    const isTeamA = teamAPlayers.some(p => p.id === player.id);
                    let pts = '';
                    if (result === 'WIN' && isTeamA) pts = '1';
                    else if (result === 'LOSS' && !isTeamA) pts = '1';
                    else if (result === 'PUSH') pts = '½';
                    else if (result) pts = '0';
                    return (
                      <View key={i} style={styles.gridHoleCol}>
                        <Text style={[styles.gridNetText, { color: pts === '1' ? '#16a34a' : pts === '0' ? '#dc2626' : '#94a3b8' }]}>
                          {pts}
                        </Text>
                      </View>
                    );
                  })}
                  <View style={styles.gridTotalCol} />
                </View>

                {/* Divider between players */}
                <View style={styles.playerDivider} />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
  );

  // ── FOCUS VIEW (own scores only) ───────────────────────────────────────────
  const focusHoleData = holeData[focusHole];

  const renderFocus = () => (
    <ScrollView contentContainerStyle={styles.focusContainer}>
      {/* Hole nav */}
      <View style={styles.focusNav}>
        <TouchableOpacity onPress={() => setFocusHole(Math.max(0, focusHole - 1))} disabled={focusHole === 0}>
          <Text style={[styles.navArrow, focusHole === 0 && styles.navDisabled]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.focusHoleInfo}>
          <Text style={styles.focusHoleNum}>Hole {focusHoleData?.hole}</Text>
          <Text style={styles.focusHoleMeta}>
            Par {focusHoleData?.par} · SI {focusHoleData?.si} · {focusHoleData?.yardage} yds
          </Text>
        </View>
        <TouchableOpacity onPress={() => setFocusHole(Math.min(8, focusHole + 1))} disabled={focusHole === 8}>
          <Text style={[styles.navArrow, focusHole === 8 && styles.navDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Hole card */}
      <View style={styles.focusCard}>
        <Text style={styles.focusYardage}>{focusHoleData?.yardage}</Text>
        <Text style={styles.focusYardageLabel}>YARDS</Text>
        <View style={styles.focusParRow}>
          <Text style={styles.focusParBadge}>PAR {focusHoleData?.par}</Text>
          <Text style={styles.focusSIBadge}>SI {focusHoleData?.si}</Text>
        </View>
        {/* Future: GPS distance to pin here */}
        <Text style={styles.focusGpsPlaceholder}>📍 GPS · Distance to Pin Coming Soon</Text>
      </View>

      {/* Score inputs — EDITABLE players only (your team) */}
      <Text style={styles.focusSectionLabel}>YOUR TEAM</Text>
      {config.players
        .filter(p => editablePlayers.has(p.id))
        .map(player => {
          const g = getScore(player.id, focusHole);
          const pops = getStrokesForHole(player.hc, focusHoleData?.si ?? 0);
          const net = g > 0 ? calculateNet(g, player.hc, focusHoleData?.si ?? 0) : 0;
          const isEditing = editingHole?.holeIdx === focusHole && editingHole?.playerId === player.id;

          return (
            <View key={player.id} style={styles.focusPlayerRow}>
              <View style={styles.focusPlayerInfo}>
                <Text style={styles.focusPlayerName}>{player.name}</Text>
                <Text style={styles.focusPlayerMeta}>
                  HC {player.hc} · {pops > 0 ? `+${pops} pop${pops > 1 ? 's' : ''}` : 'no pops'}
                  {net > 0 ? ` · Net ${net}` : ''}
                </Text>
              </View>
              {isEditing ? (
                <View style={styles.editBox}>
                  <TextInput
                    style={styles.focusInput}
                    keyboardType="numeric"
                    autoFocus
                    value={editValue}
                    onChangeText={setEditValue}
                    maxLength={2}
                    onSubmitEditing={commitEdit}
                    onBlur={commitEdit}
                    returnKeyType="done"
                  />
                </View>
              ) : (
                <TouchableOpacity onPress={() => handleScoreEdit(focusHole, player.id)}>
                  <ScoreCell gross={g} par={focusHoleData?.par} isEditable size="lg" />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

      {/* Opponent scores — READ ONLY */}
      {config.players.filter(p => !editablePlayers.has(p.id) && visiblePlayers.some(v => v.id === p.id)).length > 0 && (
        <>
          <Text style={[styles.focusSectionLabel, { color: '#dc2626', marginTop: 20 }]}>OPPONENTS (read-only)</Text>
          {config.players
            .filter(p => !editablePlayers.has(p.id) && visiblePlayers.some(v => v.id === p.id))
            .map(player => {
              const g = getScore(player.id, focusHole);
              return (
                <View key={player.id} style={[styles.focusPlayerRow, styles.focusPlayerRowOpponent]}>
                  <View style={styles.focusPlayerInfo}>
                    <Text style={[styles.focusPlayerName, { color: '#64748b' }]}>{player.name}</Text>
                    <Text style={styles.focusPlayerMeta}>HC {player.hc}</Text>
                  </View>
                  <ScoreCell gross={g} par={focusHoleData?.par} isEditable={false} size="md" />
                </View>
              );
            })}
        </>
      )}

      {/* Hole progress dots */}
      <View style={styles.progressRow}>
        {holeData.map((_, i) => {
          const myScore = getScore(myPlayer?.id ?? '', i);
          const filled = myScore > 0;
          return (
            <TouchableOpacity key={i} onPress={() => setFocusHole(i)}>
              <View style={[styles.progressDot, i === focusHole && styles.progressDotActive, filled && styles.progressDotFilled]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  // ── MAIN RETURN ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <MatchBanner segmentName={segLabel} status={getMatchStatus(matchHistory)} />

      {/* Round selector */}
      {config.rounds > 1 && (
        <View style={styles.roundRow}>
          {Array.from({ length: config.rounds }).map((_, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.roundPill, activeRound === i && styles.roundPillActive]}
              onPress={() => { setActiveRound(i); setFocusHole(0); }}
            >
              <Text style={activeRound === i ? styles.roundPillTextActive : styles.roundPillText}>R{i + 1}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Segment selector */}
      <View style={styles.segRow}>
        {(['Front 9', 'Back 9'] as const).map((label, sIdx) => (
          <TouchableOpacity
            key={sIdx}
            style={[styles.segBtn, activeSegment === sIdx && styles.segBtnActive]}
            onPress={() => { setActiveSegment(sIdx); setFocusHole(0); }}
          >
            <Text style={activeSegment === sIdx ? styles.segBtnTextActive : styles.segBtnText}>{label}</Text>
            <Text style={styles.segFormat}>{roundData.formats?.[sIdx] ?? '—'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* View mode toggle */}
      <View style={styles.toggle}>
        {(['GRID', 'FOCUS'] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.toggleBtn, viewMode === m && styles.toggleBtnActive]}
            onPress={() => setViewMode(m)}
          >
            <Text style={viewMode === m ? styles.toggleTextActive : styles.toggleText}>
              {m === 'GRID' ? '⊞ Full Scorecard' : '◎ Hole Focus'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Score edit modal overlay */}
      {editingHole && viewMode === 'GRID' && (
        <View style={styles.editOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>
              Hole {holeData[editingHole.holeIdx]?.hole} · {config.players.find(p => p.id === editingHole.playerId)?.name}
            </Text>
            <TextInput
              style={styles.editModalInput}
              keyboardType="numeric"
              autoFocus
              value={editValue}
              onChangeText={setEditValue}
              maxLength={2}
              onSubmitEditing={commitEdit}
              returnKeyType="done"
            />
            <View style={styles.editModalBtns}>
              <TouchableOpacity onPress={() => setEditingHole(null)} style={styles.editCancelBtn}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={commitEdit} style={styles.editConfirmBtn}>
                <Text style={styles.editConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {viewMode === 'GRID' ? renderGrid() : renderFocus()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  roundRow: { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: '#f8f9fa' },
  roundPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: '#e2e8f0' },
  roundPillActive: { backgroundColor: '#1e3a8a' },
  roundPillText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  roundPillTextActive: { fontSize: 12, fontWeight: '700', color: '#fff' },
  segRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  segBtnActive: { borderBottomWidth: 2, borderBottomColor: '#1e3a8a' },
  segBtnText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  segBtnTextActive: { fontSize: 13, fontWeight: '700', color: '#1e3a8a' },
  segFormat: { fontSize: 9, color: '#94a3b8', marginTop: 1, fontWeight: '700', letterSpacing: 0.5 },
  toggle: { flexDirection: 'row', padding: 8, backgroundColor: '#f1f5f9', gap: 6 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  toggleText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  toggleTextActive: { fontSize: 13, color: '#1e3a8a', fontWeight: '800' },
  // Grid
  gridHeader: { flexDirection: 'row', backgroundColor: '#2d5016', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#1a3a08' },
  gridHeaderText: { fontSize: 9, fontWeight: '800', color: '#a3e635', letterSpacing: 0.8, textAlign: 'center' },
  gridHeaderHole: { fontSize: 11, fontWeight: '900', color: '#fff', textAlign: 'center' },
  gridHeaderPar: { fontSize: 9, color: '#86efac', textAlign: 'center' },
  gridPlayerCol: { width: 100, paddingHorizontal: 8, justifyContent: 'center' },
  gridMetricCol: { width: 68, paddingHorizontal: 4, justifyContent: 'center' },
  gridHoleCol: { width: 38, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  gridTotalCol: { width: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  gridRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 3 },
  gridRowFirst: { paddingTop: 6 },
  gridRowNet: { backgroundColor: '#f8faff' },
  gridRowPoints: { backgroundColor: '#f0fdf4', paddingBottom: 2 },
  gridRowOpponent: { opacity: 0.85 },
  gridPlayerCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridPlayerName: { fontSize: 11, fontWeight: '700', color: '#1e293b', flex: 1 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  gridMetricText: { fontSize: 9, fontWeight: '600', color: '#94a3b8', textAlign: 'center' },
  gridNetText: { fontSize: 11, fontWeight: '600', color: '#64748b', textAlign: 'center' },
  popDot: { fontSize: 7, color: '#1e3a8a', textAlign: 'center', marginTop: -2 },
  gridTotalText: { fontSize: 12, fontWeight: '800', color: '#1e293b', textAlign: 'center' },
  playerDivider: { height: 1, backgroundColor: '#e2e8f0', marginHorizontal: 8 },
  scoreCell: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scoreCellText: { fontWeight: '800' },
  doubleBorder: { borderWidth: 2.5 },
  // Focus view
  focusContainer: { padding: 16, paddingBottom: 80 },
  focusNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  focusHoleInfo: { alignItems: 'center' },
  focusHoleNum: { fontSize: 28, fontWeight: '900', color: '#1e293b' },
  focusHoleMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  navArrow: { fontSize: 44, color: '#1e3a8a', paddingHorizontal: 8 },
  navDisabled: { color: '#cbd5e1' },
  focusCard: { backgroundColor: '#1e3a8a', borderRadius: 20, padding: 30, alignItems: 'center', marginBottom: 20 },
  focusYardage: { fontSize: 56, fontWeight: '900', color: '#fff' },
  focusYardageLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginTop: -4 },
  focusParRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  focusParBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, color: '#fff', fontWeight: '700', fontSize: 13 },
  focusSIBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, color: '#fff', fontWeight: '700', fontSize: 13 },
  focusGpsPlaceholder: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 10 },
  focusSectionLabel: { fontSize: 10, fontWeight: '800', color: '#1e3a8a', letterSpacing: 1.5, marginBottom: 8 },
  focusPlayerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  focusPlayerRowOpponent: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  focusPlayerInfo: { flex: 1 },
  focusPlayerName: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  focusPlayerMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  editBox: { alignItems: 'center' },
  focusInput: { width: 64, height: 64, borderWidth: 2, borderColor: '#1e3a8a', borderRadius: 12, textAlign: 'center', fontSize: 28, fontWeight: '900', color: '#1e3a8a', backgroundColor: '#f0f4ff' },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 20 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e2e8f0' },
  progressDotActive: { backgroundColor: '#1e3a8a', width: 20, borderRadius: 4 },
  progressDotFilled: { backgroundColor: '#86efac' },
  editOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, justifyContent: 'center', alignItems: 'center' },
  editModal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: 260, alignItems: 'center' },
  editModalTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 16, textAlign: 'center' },
  editModalInput: { width: 80, height: 80, borderWidth: 2.5, borderColor: '#1e3a8a', borderRadius: 16, textAlign: 'center', fontSize: 36, fontWeight: '900', color: '#1e3a8a', marginBottom: 20 },
  editModalBtns: { flexDirection: 'row', gap: 12 },
  editCancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  editCancelText: { fontWeight: '700', color: '#64748b' },
  editConfirmBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#1e3a8a', alignItems: 'center' },
  editConfirmText: { fontWeight: '700', color: '#fff' },
} as any);