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
import { COURSES, HoleData } from '../../constants/TorreyData';
import { Player, useTournament } from '../../store/TournamentContext';
import { calculateNet, getHoleResult, getMatchStatus, getStrokesForHole } from '../../utils/golfLogic';

// We import MatchBanner conditionally in case it doesn't exist yet
let MatchBanner: any;
try { MatchBanner = require('../../components/MatchBanner').MatchBanner; } catch { MatchBanner = null; }

// ─── Score Cell ───────────────────────────────────────────────────────────────

function scoreBg(gross: number, par: number) {
  if (!gross) return { bg: '#f8f9fa', border: '#e2e8f0', circle: false, double: false };
  const d = gross - par;
  if (d <= -2) return { bg: '#1e3a8a', border: '#1e3a8a', circle: true,  double: true  };
  if (d === -1) return { bg: '#16a34a', border: '#16a34a', circle: true,  double: false };
  if (d === 0)  return { bg: '#fff',    border: '#94a3b8', circle: false, double: false };
  if (d === 1)  return { bg: '#fff',    border: '#dc2626', circle: false, double: false };
  return          { bg: '#dc2626', border: '#dc2626', circle: false, double: true  };
}

interface ScoreCellProps {
  gross: number; par: number; isEditable?: boolean;
  onPress?: () => void; size?: 'sm' | 'md' | 'lg';
}

function ScoreCell({ gross, par, isEditable, onPress, size = 'md' }: ScoreCellProps) {
  const s   = scoreBg(gross, par);
  const dim = size === 'sm' ? 28 : size === 'lg' ? 56 : 38;
  const fs  = size === 'sm' ? 11 : size === 'lg' ? 22 : 15;
  const textWhite = s.bg !== '#fff' && s.bg !== '#f8f9fa';
  const isBogey   = gross > 0 && gross - par === 1;

  return (
    <TouchableOpacity onPress={onPress} disabled={!isEditable} activeOpacity={0.7}
      style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={[
        styles.scoreCell,
        { width: dim, height: dim, borderRadius: s.circle ? dim / 2 : 5 },
        s.double && styles.doubleBorder,
        { backgroundColor: s.bg, borderColor: s.border },
        isEditable && !gross && { borderStyle: 'dashed' },
      ]}>
        <Text style={[
          styles.scoreCellText, { fontSize: fs },
          textWhite ? { color: '#fff' } : isBogey ? { color: '#dc2626' } : { color: '#1e293b' },
        ]}>
          {gross > 0 ? gross : '–'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScorecardScreen() {
  const { config, currentUser, myPlayer, userRole, scores, updateScore, syncScoresToSupabase } = useTournament();

  const [viewMode, setViewMode]           = useState<'GRID' | 'FOCUS'>('GRID');
  const [focusHole, setFocusHole]         = useState(0);
  const [activeRound, setActiveRound]     = useState(0);
  const [activeSegment, setActiveSegment] = useState(0);
  const [editingHole, setEditingHole]     = useState<{ holeIdx: number; playerId: string } | null>(null);
  const [editValue, setEditValue]         = useState('');

  const isOwner = userRole === 'OWNER';

  const roundData  = config?.roundsData?.[activeRound] ?? { course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] };
  const course     = COURSES[roundData.course as keyof typeof COURSES] ?? COURSES['SOUTH'];
  const format     = roundData.formats?.[activeSegment] ?? 'TOTALS';
  const holeData: HoleData[] = activeSegment === 0 ? course.front9 : course.back9;
  const segOffset  = activeSegment === 0 ? 0 : 9;

  // ── Pairing awareness ──────────────────────────────────────────────────────

  const myPairing = useMemo(() => {
    if (!myPlayer) return null;
    return config?.pairings.find(p =>
      p.roundIndex === activeRound &&
      p.segmentIndex === activeSegment &&
      (p.teamAPlayers.includes(myPlayer.id) || p.teamBPlayers.includes(myPlayer.id))
    ) ?? null;
  }, [config?.pairings, myPlayer, activeRound, activeSegment]);

  const visiblePlayers: Player[] = useMemo(() => {
    // Owner sees all players; others see only their pairing (or all if no pairing)
    if (isOwner) return config?.players.filter(p => !p.isPlaceholder) ?? [];
    if (!myPairing) return config?.players.filter(p => !p.isPlaceholder) ?? [];
    const allIds = [...myPairing.teamAPlayers, ...myPairing.teamBPlayers];
    return config?.players.filter(p => allIds.includes(p.id)) ?? [];
  }, [myPairing, config?.players, isOwner]);

  // FIX #3 + #6: editablePlayers
  // - Owner can edit ALL players (fix #6)
  // - Non-owner with no pairing: can edit their own team
  // - Non-owner with pairing: can edit their side of the pairing
  const editablePlayers: Set<string> = useMemo(() => {
    // FIX #6: Owner edits everyone
    if (isOwner) {
      return new Set((config?.players ?? []).filter(p => !p.isPlaceholder).map(p => p.id));
    }
    if (!myPlayer) return new Set<string>();

    if (myPairing) {
      const myTeamIds = myPairing.teamAPlayers.includes(myPlayer.id)
        ? myPairing.teamAPlayers
        : myPairing.teamBPlayers;
      return new Set(myTeamIds);
    }

    // FIX #3: No pairing — editable set includes self + same-team players
    // Previously fell back to empty Set when myPlayer wasn't in a pairing,
    // causing the focus view to show 0 editable players and no score inputs.
    const sameTeam = (config?.players ?? [])
      .filter(p => p.team === myPlayer.team && !p.isPlaceholder)
      .map(p => p.id);
    return new Set([myPlayer.id, ...sameTeam]);
  }, [myPlayer, myPairing, config?.players, isOwner]);

  const teamAPlayers = myPairing
    ? config?.players.filter(p => myPairing.teamAPlayers.includes(p.id)) ?? []
    : config?.players.filter(p => p.team === 'A' && !p.isPlaceholder) ?? [];

  const teamBPlayers = myPairing
    ? config?.players.filter(p => myPairing.teamBPlayers.includes(p.id)) ?? []
    : config?.players.filter(p => p.team === 'B' && !p.isPlaceholder) ?? [];

  // ── Score helpers ──────────────────────────────────────────────────────────

  const getScore = useCallback((playerId: string, holeIdx: number): number => {
    return parseInt(scores?.[activeRound]?.[segOffset + holeIdx]?.[playerId] ?? '') || 0;
  }, [scores, activeRound, segOffset]);

  const handleScoreEdit = (holeIdx: number, playerId: string) => {
    if (!editablePlayers.has(playerId)) {
      Alert.alert('Read Only', isOwner
        ? 'Something went wrong — owner should be able to edit all scores.'
        : 'You can only enter scores for your own team.');
      return;
    }
    setEditValue(scores?.[activeRound]?.[segOffset + holeIdx]?.[playerId] ?? '');
    setEditingHole({ holeIdx, playerId });
  };

  const commitEdit = () => {
    if (!editingHole) return;
    updateScore(activeRound, segOffset + editingHole.holeIdx, editingHole.playerId, editValue.trim());
    setEditingHole(null);
    setTimeout(() => syncScoresToSupabase(activeRound), 1200);
  };

  // ── Match history ──────────────────────────────────────────────────────────

  const matchHistory = useMemo(() => {
    return holeData.map((hole, idx) => {
      const aS = teamAPlayers.map(p => getScore(p.id, idx));
      const bS = teamBPlayers.map(p => getScore(p.id, idx));
      if ([...aS, ...bS].filter(s => s > 0).length < 2) return null;
      return getHoleResult(format, [...aS, ...bS], [...teamAPlayers.map(p => p.hc), ...teamBPlayers.map(p => p.hc)], hole.si);
    }).filter((r): r is 'WIN' | 'LOSS' | 'PUSH' => r !== null);
  }, [holeData, teamAPlayers, teamBPlayers, scores, activeRound, segOffset]);

  const segLabel = `R${activeRound + 1} · ${activeSegment === 0 ? 'Front 9' : 'Back 9'} · ${format}`;

  if (!config || !config.players?.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Active Tournament</Text>
        <Text style={styles.emptyText}>Create or join a tournament from the Home tab.</Text>
      </View>
    );
  }

  // ── GRID VIEW ─────────────────────────────────────────────────────────────

  const renderGrid = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
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

        <ScrollView style={{ maxHeight: 500 }}>
          {visiblePlayers.map((player, pIdx) => {
            const canEdit    = editablePlayers.has(player.id);
            const grossTotal = holeData.reduce((s, _, i) => s + getScore(player.id, i), 0);
            const netTotal   = holeData.reduce((s, hole, i) => {
              const g = getScore(player.id, i);
              return s + (g > 0 ? calculateNet(g, player.hc, hole.si) : 0);
            }, 0);

            return (
              <View key={player.id}>
                {/* Gross row */}
                <View style={[styles.gridRow, !canEdit && styles.gridRowOpponent, pIdx === 0 && styles.gridRowFirst]}>
                  <View style={[styles.gridPlayerCol, styles.gridPlayerCell]}>
                    <View style={[styles.teamDot, { backgroundColor: player.team === 'A' ? '#1e3a8a' : player.team === 'B' ? '#dc2626' : '#64748b' }]} />
                    <Text style={styles.gridPlayerName} numberOfLines={1}>{player.name.split(' ')[0]}</Text>
                    {isOwner && canEdit && (
                      <Text style={styles.ownerTag}>✏️</Text>
                    )}
                  </View>
                  <View style={styles.gridMetricCol}>
                    <Text style={styles.gridMetricText}>Gross</Text>
                  </View>
                  {holeData.map((hole, i) => (
                    <View key={i} style={styles.gridHoleCol}>
                      <ScoreCell
                        gross={getScore(player.id, i)} par={hole.par}
                        isEditable={canEdit}
                        onPress={() => handleScoreEdit(i, player.id)}
                        size="sm"
                      />
                    </View>
                  ))}
                  <View style={styles.gridTotalCol}>
                    <Text style={styles.gridTotalText}>{grossTotal > 0 ? grossTotal : '—'}</Text>
                  </View>
                </View>

                {/* Net row */}
                {config.isHandicapEnabled && (
                  <View style={[styles.gridRow, styles.gridRowNet, !canEdit && styles.gridRowOpponent]}>
                    <View style={styles.gridPlayerCol} />
                    <View style={styles.gridMetricCol}>
                      <Text style={[styles.gridMetricText, { color: '#1e3a8a' }]}>Net</Text>
                    </View>
                    {holeData.map((hole, i) => {
                      const g = getScore(player.id, i);
                      const net  = g > 0 ? calculateNet(g, player.hc, hole.si) : 0;
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

                {/* Match points row */}
                <View style={[styles.gridRow, styles.gridRowPoints, !canEdit && styles.gridRowOpponent]}>
                  <View style={styles.gridPlayerCol} />
                  <View style={styles.gridMetricCol}>
                    <Text style={[styles.gridMetricText, { color: '#16a34a', fontSize: 9 }]}>Pts</Text>
                  </View>
                  {holeData.map((_, i) => {
                    const result  = matchHistory[i];
                    const isTeamA = teamAPlayers.some(p => p.id === player.id);
                    let pts = '';
                    if (result === 'WIN'  && isTeamA)  pts = '1';
                    else if (result === 'LOSS' && !isTeamA) pts = '1';
                    else if (result === 'PUSH') pts = '½';
                    else if (result)            pts = '0';
                    return (
                      <View key={i} style={styles.gridHoleCol}>
                        <Text style={[styles.gridNetText, {
                          color: pts === '1' ? '#16a34a' : pts === '0' ? '#dc2626' : '#94a3b8',
                        }]}>{pts}</Text>
                      </View>
                    );
                  })}
                  <View style={styles.gridTotalCol} />
                </View>

                <View style={styles.playerDivider} />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
  );

  // ── FOCUS VIEW ────────────────────────────────────────────────────────────

  const focusHoleData = holeData[focusHole];

  // FIX #3: Always derive focus editable/opponent from the corrected editablePlayers set.
  // When no pairing is set, editablePlayers now correctly includes same-team players,
  // so this will always show score inputs for the current user and teammates.
  const focusEditablePlayers = visiblePlayers.filter(p => editablePlayers.has(p.id));
  const focusOpponents       = visiblePlayers.filter(p => !editablePlayers.has(p.id));

  const renderFocus = () => (
    <ScrollView contentContainerStyle={styles.focusContainer}>
      {/* Hole nav */}
      <View style={styles.focusNav}>
        <TouchableOpacity onPress={() => setFocusHole(h => Math.max(0, h - 1))}
          disabled={focusHole === 0} style={styles.navBtn}>
          <Text style={[styles.navArrow, focusHole === 0 && styles.navDisabled]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.focusHoleInfo}>
          <Text style={styles.focusHoleNum}>Hole {focusHoleData?.hole}</Text>
          <Text style={styles.focusHoleMeta}>
            Par {focusHoleData?.par} · SI {focusHoleData?.si} · {focusHoleData?.yardage} yds
          </Text>
        </View>
        <TouchableOpacity onPress={() => setFocusHole(h => Math.min(8, h + 1))}
          disabled={focusHole === 8} style={styles.navBtn}>
          <Text style={[styles.navArrow, focusHole === 8 && styles.navDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Hole card */}
      <View style={styles.focusCard}>
        <Text style={styles.focusYardage}>{focusHoleData?.yardage}</Text>
        <Text style={styles.focusYardageLabel}>YARDS</Text>
        <View style={styles.focusParRow}>
          <Text style={styles.focusBadge}>PAR {focusHoleData?.par}</Text>
          <Text style={styles.focusBadge}>SI {focusHoleData?.si}</Text>
        </View>
        <Text style={styles.focusGps}>📍 GPS · Distance to Pin Coming Soon</Text>
      </View>

      {/* YOUR TEAM / Owner sees all as editable */}
      {focusEditablePlayers.length === 0 ? (
        <View style={styles.noPlayerCard}>
          <Text style={styles.noPlayerText}>
            No players assigned yet.{'\n'}
            {isOwner
              ? 'Add players in Setup → Roster.'
              : 'The tournament owner needs to configure pairings.'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.focusSectionLabel}>
            {isOwner ? 'ALL PLAYERS (OWNER)' : 'YOUR TEAM'}
          </Text>
          {focusEditablePlayers.map(player => {
            const g      = getScore(player.id, focusHole);
            const pops   = getStrokesForHole(player.hc, focusHoleData?.si ?? 0);
            const net    = g > 0 ? calculateNet(g, player.hc, focusHoleData?.si ?? 0) : 0;
            const isEdit = editingHole?.holeIdx === focusHole && editingHole?.playerId === player.id;

            return (
              <View key={player.id} style={styles.focusPlayerRow}>
                <View style={[styles.teamColorBar, {
                  backgroundColor: player.team === 'A' ? '#1e3a8a' : player.team === 'B' ? '#dc2626' : '#64748b'
                }]} />
                <View style={styles.focusPlayerInfo}>
                  <Text style={styles.focusPlayerName}>{player.name}</Text>
                  <Text style={styles.focusPlayerMeta}>
                    HC {player.hc}
                    {pops > 0 ? ` · +${pops} pop${pops > 1 ? 's' : ''}` : ' · no pops'}
                    {net > 0 ? ` · Net ${net}` : ''}
                  </Text>
                </View>

                {isEdit ? (
                  <View style={styles.editBox}>
                    <TextInput
                      style={styles.focusInput}
                      keyboardType="number-pad"
                      autoFocus
                      value={editValue}
                      onChangeText={setEditValue}
                      maxLength={2}
                      onSubmitEditing={commitEdit}
                      onBlur={commitEdit}
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => handleScoreEdit(focusHole, player.id)} activeOpacity={0.7}>
                    <ScoreCell gross={g} par={focusHoleData?.par ?? 4} isEditable size="lg" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </>
      )}

      {/* OPPONENTS — read only (not shown to owner since they see all) */}
      {!isOwner && focusOpponents.length > 0 && (
        <>
          <Text style={[styles.focusSectionLabel, { color: '#dc2626', marginTop: 20 }]}>
            OPPONENTS (read-only)
          </Text>
          {focusOpponents.map(player => {
            const g = getScore(player.id, focusHole);
            return (
              <View key={player.id} style={[styles.focusPlayerRow, styles.focusPlayerRowOpp]}>
                <View style={[styles.teamColorBar, {
                  backgroundColor: player.team === 'A' ? '#1e3a8a' : player.team === 'B' ? '#dc2626' : '#64748b'
                }]} />
                <View style={styles.focusPlayerInfo}>
                  <Text style={[styles.focusPlayerName, { color: '#64748b' }]}>{player.name}</Text>
                  <Text style={styles.focusPlayerMeta}>HC {player.hc}</Text>
                </View>
                <ScoreCell gross={g} par={focusHoleData?.par ?? 4} isEditable={false} size="md" />
              </View>
            );
          })}
        </>
      )}

      {/* Progress dots */}
      <View style={styles.progressRow}>
        {holeData.map((_, i) => {
          const filled = getScore(myPlayer?.id ?? (isOwner ? visiblePlayers[0]?.id : ''), i) > 0;
          return (
            <TouchableOpacity key={i} onPress={() => setFocusHole(i)}>
              <View style={[
                styles.progressDot,
                i === focusHole && styles.progressDotActive,
                filled && i !== focusHole && styles.progressDotFilled,
              ]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  // ── MAIN RENDER ───────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {MatchBanner && (
        <MatchBanner segmentName={segLabel} status={getMatchStatus(matchHistory)} />
      )}

      {config.rounds > 1 && (
        <View style={styles.roundRow}>
          {Array.from({ length: config.rounds }).map((_, i) => (
            <TouchableOpacity key={i}
              style={[styles.roundPill, activeRound === i && styles.roundPillActive]}
              onPress={() => { setActiveRound(i); setFocusHole(0); }}
            >
              <Text style={activeRound === i ? styles.roundPillTextActive : styles.roundPillText}>R{i + 1}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.segRow}>
        {(['Front 9', 'Back 9'] as const).map((label, sIdx) => (
          <TouchableOpacity key={sIdx}
            style={[styles.segBtn, activeSegment === sIdx && styles.segBtnActive]}
            onPress={() => { setActiveSegment(sIdx); setFocusHole(0); }}
          >
            <Text style={activeSegment === sIdx ? styles.segBtnTextActive : styles.segBtnText}>{label}</Text>
            <Text style={styles.segFormat}>{roundData.formats?.[sIdx] ?? '—'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toggle}>
        {(['GRID', 'FOCUS'] as const).map(m => (
          <TouchableOpacity key={m}
            style={[styles.toggleBtn, viewMode === m && styles.toggleBtnActive]}
            onPress={() => setViewMode(m)}
          >
            <Text style={viewMode === m ? styles.toggleTextActive : styles.toggleText}>
              {m === 'GRID' ? '⊞ Full Scorecard' : '◎ Hole Focus'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Grid edit modal */}
      {editingHole && viewMode === 'GRID' && (
        <View style={styles.editOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>
              Hole {holeData[editingHole.holeIdx]?.hole} ·{' '}
              {config.players.find(p => p.id === editingHole.playerId)?.name}
            </Text>
            <TextInput
              style={styles.editModalInput}
              keyboardType="number-pad"
              autoFocus value={editValue}
              onChangeText={setEditValue} maxLength={2}
              onSubmitEditing={commitEdit} returnKeyType="done" selectTextOnFocus
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  roundRow: { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: '#f8f9fa' },
  roundPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#e2e8f0' },
  roundPillActive: { backgroundColor: '#1e3a8a' },
  roundPillText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  roundPillTextActive: { fontSize: 12, fontWeight: '700', color: '#fff' },
  segRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  segBtnActive: { borderBottomWidth: 2.5, borderBottomColor: '#1e3a8a' },
  segBtnText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  segBtnTextActive: { fontSize: 13, fontWeight: '700', color: '#1e3a8a' },
  segFormat: { fontSize: 9, color: '#94a3b8', marginTop: 1, fontWeight: '700' },
  toggle: { flexDirection: 'row', padding: 8, backgroundColor: '#f1f5f9', gap: 6 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  toggleText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  toggleTextActive: { fontSize: 13, color: '#1e3a8a', fontWeight: '800' },
  gridHeader: { flexDirection: 'row', backgroundColor: '#2d5016', paddingVertical: 8 },
  gridHeaderText: { fontSize: 9, fontWeight: '800', color: '#a3e635', letterSpacing: 0.8, textAlign: 'center' },
  gridHeaderHole: { fontSize: 11, fontWeight: '900', color: '#fff', textAlign: 'center' },
  gridHeaderPar: { fontSize: 9, color: '#86efac', textAlign: 'center' },
  gridPlayerCol: { width: 88, paddingHorizontal: 6, justifyContent: 'center' },
  gridMetricCol: { width: 52, paddingHorizontal: 4, justifyContent: 'center' },
  gridHoleCol: { width: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  gridTotalCol: { width: 40, alignItems: 'center', justifyContent: 'center' },
  gridRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 2 },
  gridRowFirst: { paddingTop: 5 },
  gridRowNet: { backgroundColor: '#f8faff' },
  gridRowPoints: { backgroundColor: '#f0fdf4', paddingBottom: 2 },
  gridRowOpponent: { opacity: 0.75 },
  gridPlayerCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  teamDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  gridPlayerName: { fontSize: 10, fontWeight: '700', color: '#1e293b', flex: 1 },
  ownerTag: { fontSize: 9 },
  gridMetricText: { fontSize: 9, fontWeight: '600', color: '#94a3b8', textAlign: 'center' },
  gridNetText: { fontSize: 10, fontWeight: '600', color: '#64748b', textAlign: 'center' },
  popDot: { fontSize: 6, color: '#1e3a8a', textAlign: 'center' },
  gridTotalText: { fontSize: 12, fontWeight: '800', color: '#1e293b', textAlign: 'center' },
  playerDivider: { height: 1, backgroundColor: '#e2e8f0', marginHorizontal: 8 },
  scoreCell: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scoreCellText: { fontWeight: '800' },
  doubleBorder: { borderWidth: 3 },
  focusContainer: { padding: 16, paddingBottom: 100 },
  focusNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 42, color: '#1e3a8a', fontWeight: '300' },
  navDisabled: { color: '#cbd5e1' },
  focusHoleInfo: { alignItems: 'center' },
  focusHoleNum: { fontSize: 26, fontWeight: '900', color: '#1e293b' },
  focusHoleMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  focusCard: { backgroundColor: '#1e3a8a', borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 20 },
  focusYardage: { fontSize: 54, fontWeight: '900', color: '#fff' },
  focusYardageLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', letterSpacing: 2, marginTop: -4 },
  focusParRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  focusBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, color: '#fff', fontWeight: '700', fontSize: 13 },
  focusGps: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 10 },
  focusSectionLabel: { fontSize: 10, fontWeight: '800', color: '#1e3a8a', letterSpacing: 1.5, marginBottom: 8 },
  focusPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 0, backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  focusPlayerRowOpp: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  teamColorBar: { width: 4, alignSelf: 'stretch' },
  focusPlayerInfo: { flex: 1, padding: 14 },
  focusPlayerName: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  focusPlayerMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  editBox: { alignItems: 'center', paddingRight: 14 },
  focusInput: { width: 64, height: 64, borderWidth: 2.5, borderColor: '#1e3a8a', borderRadius: 14, textAlign: 'center', fontSize: 28, fontWeight: '900', color: '#1e3a8a', backgroundColor: '#f0f4ff' },
  noPlayerCard: { backgroundColor: '#f8f9fa', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1' },
  noPlayerText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 24 },
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