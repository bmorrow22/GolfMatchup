import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { MatchBanner } from '../../components/MatchBanner';
import { PlayerAvatar } from '../../components/Playeravatar';
import { COURSES, HoleData } from '../../constants/TorreyData';
import { Player, useTournament } from '../../store/TournamentContext';
import {
  calculateNet, getHoleResult, getMatchStatus, getStrokesForHole, holeResultLabel,
} from '../../utils/golfLogic';

// ── Score cell ────────────────────────────────────────────────────────────────
function scoreCellStyle(gross: number, par: number) {
  if (!gross) return {};
  const d = gross - par;
  if (d <= -2) return { bg: '#1e3a8a', border: '#1e3a8a', double: true, circle: true };
  if (d === -1) return { bg: '#16a34a', border: '#16a34a', circle: true };
  if (d === 0)  return { bg: '#fff',    border: '#94a3b8' };
  if (d === 1)  return { bg: '#fff',    border: '#dc2626', bogey: true };
  return              { bg: '#dc2626', border: '#dc2626', double: true };
}

function ScoreCell({
  gross, par, isEditable, onPress, size = 'md',
}: {
  gross: number; par: number; isEditable?: boolean; onPress?: () => void; size?: 'sm' | 'md' | 'lg';
}) {
  const s   = scoreCellStyle(gross, par) as any;
  const dim = size === 'sm' ? 30 : size === 'lg' ? 60 : 40;
  const fs  = size === 'sm' ? 11 : size === 'lg' ? 24 : 15;
  return (
    <TouchableOpacity onPress={onPress} disabled={!isEditable}
      style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={[
        styles.scoreCell,
        { width: dim, height: dim, borderRadius: s.circle ? dim / 2 : 5 },
        s.double && styles.doubleBorder,
        { backgroundColor: s.bg || '#f8f9fa', borderColor: s.border || '#e2e8f0' },
        isEditable && !gross && { borderStyle: 'dashed' },
      ]}>
        <Text style={[
          styles.scoreCellText, { fontSize: fs },
          (s.bg && s.bg !== '#fff') ? { color: '#fff' } : { color: '#1e293b' },
          s.bogey && { color: '#dc2626' },
        ]}>
          {gross > 0 ? gross : '–'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const isCombined = (fmt: string) => fmt === 'SCRAMBLE' || fmt === 'ALT-SHOT';

export default function ScorecardScreen() {
  const { config, currentUser, myPlayer, scores, updateScore, syncScoresToSupabase } = useTournament();

  const [viewMode, setViewMode]           = useState<'GRID' | 'FOCUS'>('FOCUS');
  const [focusHole, setFocusHole]         = useState(0);
  const [activeRound, setActiveRound]     = useState(0);
  const [activeSegment, setActiveSegment] = useState(0);
  const [editingHole, setEditingHole]     = useState<{ holeIdx: number; playerId: string } | null>(null);
  const [editValue, setEditValue]         = useState('');

  const roundData = config?.roundsData?.[activeRound] ?? { course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] };
  const course    = COURSES[roundData.course as keyof typeof COURSES] ?? COURSES['SOUTH'];
  const format    = roundData.formats?.[activeSegment] ?? 'TOTALS';
  const holeData: HoleData[] = activeSegment === 0 ? course.front9 : course.back9;
  const segOffset = activeSegment === 0 ? 0 : 9;
  const combined  = isCombined(format);
  const isOwner   = config?.ownerId === currentUser?.id;

  // ── Pairing awareness ──────────────────────────────────────────────────────
  const myPairing = useMemo(() => {
    if (!myPlayer) return null;
    return config?.pairings.find(p =>
      p.roundIndex === activeRound && p.segmentIndex === activeSegment &&
      (p.teamAPlayers.includes(myPlayer.id) || p.teamBPlayers.includes(myPlayer.id))
    ) ?? null;
  }, [config?.pairings, myPlayer, activeRound, activeSegment]);

  const visiblePlayers: Player[] = useMemo(() => {
    if (!myPairing) return config?.players.filter(p => !p.isPlaceholder) ?? [];
    const ids = [...myPairing.teamAPlayers, ...myPairing.teamBPlayers];
    return config?.players.filter(p => ids.includes(p.id)) ?? [];
  }, [myPairing, config?.players]);

  // FIX: If owner OR user is in tournament (even without pairing), allow editing.
  // Previously, myPlayer being null when no pairing was set blocked all score entry.
  const editablePlayers: Set<string> = useMemo(() => {
    if (isOwner) return new Set(config?.players.map(p => p.id) ?? []);
    if (!myPlayer) return new Set<string>();
    if (myPairing) {
      const myIds = myPairing.teamAPlayers.includes(myPlayer.id)
        ? myPairing.teamAPlayers : myPairing.teamBPlayers;
      return new Set(myIds);
    }
    // No pairing yet — can still edit own score + teammates
    const sameTeam = config?.players
      .filter(p => p.team === myPlayer.team && !p.isPlaceholder)
      .map(p => p.id) ?? [];
    return new Set([myPlayer.id, ...sameTeam]);
  }, [isOwner, myPlayer, myPairing, config?.players]);

  const teamAPlayers = myPairing
    ? config?.players.filter(p => myPairing.teamAPlayers.includes(p.id)) ?? []
    : config?.players.filter(p => (p.team === 'A' || p.team === 'C') && !p.isPlaceholder) ?? [];

  const teamBPlayers = myPairing
    ? config?.players.filter(p => myPairing.teamBPlayers.includes(p.id)) ?? []
    : config?.players.filter(p => (p.team === 'B' || p.team === 'D') && !p.isPlaceholder) ?? [];

  // ── Score helpers ─────────────────────────────────────────────────────────
  const getScore = useCallback((playerId: string, holeIdx: number): number => {
    return parseInt(scores?.[activeRound]?.[segOffset + holeIdx]?.[playerId] ?? '') || 0;
  }, [scores, activeRound, segOffset]);

  const handleScoreEdit = (holeIdx: number, playerId: string) => {
    if (!editablePlayers.has(playerId)) {
      Alert.alert('Read Only', 'You can only enter scores for your own team.');
      return;
    }
    setEditValue(scores?.[activeRound]?.[segOffset + holeIdx]?.[playerId] ?? '');
    setEditingHole({ holeIdx, playerId });
  };

  const commitEdit = () => {
    if (!editingHole) return;
    const val = editValue.trim();
    updateScore(activeRound, segOffset + editingHole.holeIdx, editingHole.playerId, val);
    if (combined) {
      const side = teamAPlayers.some(p => p.id === editingHole.playerId) ? teamAPlayers : teamBPlayers;
      side.forEach(p => {
        if (p.id !== editingHole.playerId)
          updateScore(activeRound, segOffset + editingHole.holeIdx, p.id, val);
      });
    }
    setEditingHole(null);
    setTimeout(() => syncScoresToSupabase(activeRound), 1500);
  };

  // ── Match history (null-preserving) ───────────────────────────────────────
  const matchHistory = useMemo((): (('WIN' | 'LOSS' | 'PUSH') | null)[] => {
    return holeData.map((hole, idx) => {
      if (combined) {
        const aScore = getScore(teamAPlayers[0]?.id ?? '', idx);
        const bScore = getScore(teamBPlayers[0]?.id ?? '', idx);
        if (!aScore || !bScore) return null;
        const aHc = teamAPlayers.length ? Math.min(...teamAPlayers.map(p => p.hc)) : 0;
        const bHc = teamBPlayers.length ? Math.min(...teamBPlayers.map(p => p.hc)) : 0;
        return getHoleResult(format, [aScore, aScore, bScore, bScore], [aHc, aHc, bHc, bHc], hole.si);
      }
      const aS  = teamAPlayers.map(p => getScore(p.id, idx));
      const bS  = teamBPlayers.map(p => getScore(p.id, idx));
      const aHc = teamAPlayers.map(p => p.hc);
      const bHc = teamBPlayers.map(p => p.hc);
      return getHoleResult(format, [...aS, ...bS], [...aHc, ...bHc], hole.si);
    });
  }, [holeData, teamAPlayers, teamBPlayers, scores, activeRound, segOffset, format, combined]);

  const segLabel = `R${activeRound + 1} · ${activeSegment === 0 ? 'Front 9' : 'Back 9'} · ${format}`;

  if (!config || !config.players?.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Active Tournament</Text>
        <Text style={styles.emptyText}>Open a tournament from the Home tab to view the scorecard.</Text>
      </View>
    );
  }

  // ── Grid rows ──────────────────────────────────────────────────────────────
  interface GridRow {
    key: string; primaryPlayer: Player; partnerPlayer?: Player;
    scorePlayerId: string; hc: number; canEdit: boolean; isTeamA: boolean;
  }

  const gridRows: GridRow[] = useMemo(() => {
    if (!combined) {
      return visiblePlayers.map(p => ({
        key: p.id, primaryPlayer: p, scorePlayerId: p.id, hc: p.hc,
        canEdit: editablePlayers.has(p.id),
        isTeamA: teamAPlayers.some(tp => tp.id === p.id),
      }));
    }
    const rows: GridRow[] = [];
    [{ side: teamAPlayers, isA: true }, { side: teamBPlayers, isA: false }].forEach(({ side, isA }) => {
      if (!side.length) return;
      rows.push({
        key: side.map(p => p.id).join('-'),
        primaryPlayer: side[0], partnerPlayer: side[1],
        scorePlayerId: side[0].id, hc: Math.min(...side.map(p => p.hc)),
        canEdit: side.some(p => editablePlayers.has(p.id)), isTeamA: isA,
      });
    });
    return rows;
  }, [combined, visiblePlayers, teamAPlayers, teamBPlayers, editablePlayers]);

  // ── GRID VIEW ─────────────────────────────────────────────────────────────
  const TEAM_COLORS_GRID: Record<string, string> = {
    A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309', UNASSIGNED: '#64748b',
  };

  const renderGrid = () => {
    // Group rows into Team A side and Team B side for side-by-side layout
    const teamARows = gridRows.filter(r => r.isTeamA);
    const teamBRows = gridRows.filter(r => !r.isTeamA);

    const teamAId  = myPairing?.teamAId ?? teamAPlayers[0]?.team ?? 'A';
    const teamBId  = myPairing?.teamBId ?? teamBPlayers[0]?.team ?? 'B';
    const teamADisplayName = config.teamNames?.[teamAId] ?? `Team ${teamAId}`;
    const teamBDisplayName = config.teamNames?.[teamBId] ?? `Team ${teamBId}`;
    const teamAColor = TEAM_COLORS_GRID[teamAId] ?? '#1e3a8a';
    const teamBColor = TEAM_COLORS_GRID[teamBId] ?? '#b91c1c';

    const renderRows = (rows: typeof gridRows, teamColor: string) =>
      rows.map((row, rIdx) => {
        const grossTotal = holeData.reduce((s, _, i) => s + getScore(row.scorePlayerId, i), 0);
        const netTotal   = holeData.reduce((s, hole, i) => {
          const g = getScore(row.scorePlayerId, i);
          return s + (g > 0 ? calculateNet(g, row.hc, hole.si) : 0);
        }, 0);
        return (
          <View key={row.key}>
            {/* Gross row */}
            <View style={[styles.gridRow, rIdx === 0 && styles.gridRowFirst]}>
              <View style={[styles.gridPlayerCol, styles.gridPlayerCell]}>
                <View style={styles.avatarStack}>
                  <PlayerAvatar userId={row.primaryPlayer.userId} name={row.primaryPlayer.name} team={row.primaryPlayer.team} size={44} showRing />
                  {row.partnerPlayer && (
                    <View style={styles.avatarOverlap}>
                      <PlayerAvatar userId={row.partnerPlayer.userId} name={row.partnerPlayer.name} team={row.partnerPlayer.team} size={30} showRing />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gridPlayerName} numberOfLines={1}>
                    {row.primaryPlayer.name.split(' ')[0]}
                    {row.partnerPlayer ? ` / ${row.partnerPlayer.name.split(' ')[0]}` : ''}
                  </Text>
                  {!row.canEdit && <Text style={{ fontSize: 8, color: '#94a3b8', fontStyle: 'italic' }}>read-only</Text>}
                </View>
              </View>
              <View style={styles.gridMetricCol}><Text style={styles.gridMetricText}>Gross</Text></View>
              {holeData.map((hole, i) => (
                <View key={i} style={styles.gridHoleCol}>
                  <ScoreCell gross={getScore(row.scorePlayerId, i)} par={hole.par}
                    isEditable={row.canEdit} onPress={() => handleScoreEdit(i, row.scorePlayerId)} size="sm" />
                </View>
              ))}
              <View style={styles.gridTotalCol}>
                <Text style={styles.gridTotalText}>{grossTotal > 0 ? grossTotal : '—'}</Text>
              </View>
            </View>

            {/* Net row */}
            {config.isHandicapEnabled && (
              <View style={[styles.gridRow, styles.gridRowNet]}>
                <View style={styles.gridPlayerCol} />
                <View style={styles.gridMetricCol}><Text style={[styles.gridMetricText, { color: teamColor }]}>Net</Text></View>
                {holeData.map((hole, i) => {
                  const g = getScore(row.scorePlayerId, i);
                  const net = g > 0 ? calculateNet(g, row.hc, hole.si) : 0;
                  const pops = getStrokesForHole(row.hc, hole.si);
                  return (
                    <View key={i} style={styles.gridHoleCol}>
                      <Text style={styles.gridNetText}>{net > 0 ? net : '—'}</Text>
                      {pops > 0 && <Text style={styles.popDot}>{'•'.repeat(pops)}</Text>}
                    </View>
                  );
                })}
                <View style={styles.gridTotalCol}>
                  <Text style={[styles.gridTotalText, { color: teamColor }]}>{netTotal > 0 ? netTotal : '—'}</Text>
                </View>
              </View>
            )}

            {/* W/L/H row */}
            <View style={[styles.gridRow, styles.gridRowWLH]}>
              <View style={styles.gridPlayerCol} />
              <View style={styles.gridMetricCol}><Text style={[styles.gridMetricText, { color: '#64748b', fontSize: 9 }]}>W/L/H</Text></View>
              {holeData.map((_, i) => {
                const { text, color } = holeResultLabel(matchHistory[i], row.isTeamA);
                return (
                  <View key={i} style={styles.gridHoleCol}>
                    <Text style={[styles.gridNetText, { color, fontWeight: '900' }]}>{text}</Text>
                  </View>
                );
              })}
              <View style={styles.gridTotalCol} />
            </View>
            <View style={styles.playerDivider} />
          </View>
        );
      });

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Hole header */}
          <View style={styles.gridHeader}>
            <View style={styles.gridPlayerCol}><Text style={styles.gridHeaderText}>PLAYER</Text></View>
            <View style={styles.gridMetricCol}><Text style={styles.gridHeaderText}>METRIC</Text></View>
            {holeData.map((hole, i) => (
              <View key={i} style={styles.gridHoleCol}>
                <Text style={styles.gridHeaderHole}>{hole.hole}</Text>
                <Text style={styles.gridHeaderPar}>P{hole.par}</Text>
              </View>
            ))}
            <View style={styles.gridTotalCol}><Text style={styles.gridHeaderText}>TOT</Text></View>
          </View>

          <ScrollView style={{ maxHeight: 520 }}>
            {/* Team A section */}
            {teamARows.length > 0 && (
              <View>
                <View style={[styles.gridTeamHeader, { backgroundColor: teamAColor }]}>
                  <View style={styles.gridPlayerCol}>
                    <Text style={styles.gridTeamHeaderText}>{teamADisplayName.toUpperCase()}</Text>
                  </View>
                  <View style={styles.gridMetricCol} />
                  {holeData.map((_, i) => <View key={i} style={styles.gridHoleCol} />)}
                  <View style={styles.gridTotalCol} />
                </View>
                {renderRows(teamARows, teamAColor)}
              </View>
            )}

            {/* VS divider between teams */}
            {teamARows.length > 0 && teamBRows.length > 0 && (
              <View style={styles.gridVsDivider}>
                <View style={[styles.gridVsLine, { backgroundColor: teamAColor }]} />
                <View style={styles.gridVsBubble}>
                  <Text style={styles.gridVsText}>VS</Text>
                </View>
                <View style={[styles.gridVsLine, { backgroundColor: teamBColor }]} />
              </View>
            )}

            {/* Team B section */}
            {teamBRows.length > 0 && (
              <View>
                <View style={[styles.gridTeamHeader, { backgroundColor: teamBColor }]}>
                  <View style={styles.gridPlayerCol}>
                    <Text style={styles.gridTeamHeaderText}>{teamBDisplayName.toUpperCase()}</Text>
                  </View>
                  <View style={styles.gridMetricCol} />
                  {holeData.map((_, i) => <View key={i} style={styles.gridHoleCol} />)}
                  <View style={styles.gridTotalCol} />
                </View>
                {renderRows(teamBRows, teamBColor)}
              </View>
            )}
          </ScrollView>
        </View>
      </ScrollView>
    );
  };

  // ── FOCUS VIEW ────────────────────────────────────────────────────────────
  const focusHoleData  = holeData[focusHole];
  const currentHoleResult = matchHistory[focusHole];

  interface FocusGroup {
    key: string; players: Player[]; scorePlayerId: string;
    hc: number; canEdit: boolean; isTeamA: boolean; isOpponent: boolean;
  }

  const focusGroups: FocusGroup[] = useMemo(() => {
    if (!combined) {
      const editList = visiblePlayers.filter(p => editablePlayers.has(p.id));
      const oppList  = visiblePlayers.filter(p => !editablePlayers.has(p.id));
      return [...editList, ...oppList].map(p => ({
        key: p.id, players: [p], scorePlayerId: p.id, hc: p.hc,
        canEdit: editablePlayers.has(p.id),
        isTeamA: teamAPlayers.some(tp => tp.id === p.id),
        isOpponent: !editablePlayers.has(p.id),
      }));
    }
    const groups: FocusGroup[] = [];
    [{ side: teamAPlayers, isA: true }, { side: teamBPlayers, isA: false }].forEach(({ side, isA }) => {
      if (!side.length) return;
      const canEdit = side.some(p => editablePlayers.has(p.id));
      groups.push({
        key: side.map(p => p.id).join('-'), players: side,
        scorePlayerId: side[0].id, hc: Math.min(...side.map(p => p.hc)),
        canEdit, isTeamA: isA, isOpponent: !canEdit,
      });
    });
    return groups;
  }, [combined, visiblePlayers, teamAPlayers, teamBPlayers, editablePlayers]);

  const renderFocus = () => (
    <ScrollView contentContainerStyle={styles.focusContainer}>
      {/* Hole nav */}
      <View style={styles.focusNav}>
        <TouchableOpacity onPress={() => setFocusHole(h => Math.max(0, h - 1))} disabled={focusHole === 0} style={styles.navBtn}>
          <Text style={[styles.navArrow, focusHole === 0 && styles.navDisabled]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.focusHoleInfo}>
          <Text style={styles.focusHoleNum}>Hole {focusHoleData?.hole}</Text>
          <Text style={styles.focusHoleMeta}>Par {focusHoleData?.par} · SI {focusHoleData?.si} · {focusHoleData?.yardage} yds</Text>
        </View>
        <TouchableOpacity onPress={() => setFocusHole(h => Math.min(8, h + 1))} disabled={focusHole === 8} style={styles.navBtn}>
          <Text style={[styles.navArrow, focusHole === 8 && styles.navDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Hole info card */}
      <View style={styles.focusCard}>
        <Text style={styles.focusYardage}>{focusHoleData?.yardage}</Text>
        <Text style={styles.focusYardageLabel}>YARDS</Text>
        <View style={styles.focusParRow}>
          <Text style={styles.focusBadge}>PAR {focusHoleData?.par}</Text>
          <Text style={styles.focusBadge}>SI {focusHoleData?.si}</Text>
          {currentHoleResult && (
            <View style={[styles.focusResultBadge, {
              backgroundColor: currentHoleResult === 'WIN' ? 'rgba(22,163,74,0.3)'
                : currentHoleResult === 'LOSS' ? 'rgba(220,38,38,0.3)'
                : 'rgba(255,255,255,0.15)',
            }]}>
              <Text style={styles.focusResultText}>
                {currentHoleResult === 'WIN' ? '✓ Your team wins'
                  : currentHoleResult === 'LOSS' ? '✗ Opponents win'
                  : '= Halved'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {combined && (
        <View style={styles.combinedBanner}>
          <Text style={styles.combinedBannerText}>{format} · one shared score per team side</Text>
        </View>
      )}

      {focusGroups.length === 0 ? (
        <View style={styles.noPlayerCard}>
          <Text style={styles.noPlayerText}>
            No players in this pairing.{'\n'}
            The tournament owner needs to configure pairings in Setup.
          </Text>
        </View>
      ) : (
        focusGroups.map((group, gIdx) => {
          const g    = getScore(group.scorePlayerId, focusHole);
          const pops = getStrokesForHole(group.hc, focusHoleData?.si ?? 0);
          const net  = g > 0 ? calculateNet(g, group.hc, focusHoleData?.si ?? 0) : 0;
          const isEdit = editingHole?.holeIdx === focusHole &&
            group.players.some(p => p.id === editingHole?.playerId);
          const showYourTeam = gIdx === 0 && !group.isOpponent;
          const prevIsEdit   = gIdx > 0 && !focusGroups[gIdx - 1].isOpponent;
          const showOpp      = group.isOpponent && (!gIdx || prevIsEdit);

          return (
            <View key={group.key}>
              {showYourTeam && <Text style={styles.focusSectionLabel}>YOUR TEAM</Text>}
              {showOpp && <Text style={[styles.focusSectionLabel, { color: '#dc2626', marginTop: 16 }]}>OPPONENTS</Text>}

              <View style={[styles.focusPlayerRow, group.isOpponent && styles.focusPlayerRowOpp]}>
                {/* Larger avatar area */}
                <View style={styles.focusAvatarCol}>
                  {group.players.map((p, pi) => (
                    <View key={p.id} style={pi > 0 ? { marginTop: -10 } : {}}>
                      <PlayerAvatar userId={p.userId} name={p.name} team={p.team} size={80} showRing />
                    </View>
                  ))}
                </View>

                <View style={styles.focusPlayerInfo}>
                  <Text style={[styles.focusPlayerName, group.isOpponent && { color: '#64748b' }]}>
                    {group.players.map(p => p.name).join(' / ')}
                  </Text>
                  <Text style={styles.focusPlayerMeta}>
                    HC {group.hc}
                    {pops > 0 ? ` · +${pops} pop${pops > 1 ? 's' : ''}` : ' · no pops'}
                    {net > 0 ? ` · Net ${net}` : ''}
                  </Text>
                  {!group.canEdit && (
                    <Text style={styles.readOnlyTag}>read-only</Text>
                  )}
                </View>

                {group.canEdit ? (
                  isEdit ? (
                    <View style={styles.editBox}>
                      <TextInput
                        style={styles.focusInput}
                        keyboardType="number-pad" autoFocus
                        value={editValue} onChangeText={setEditValue}
                        maxLength={2} onSubmitEditing={commitEdit}
                        onBlur={commitEdit} returnKeyType="done" selectTextOnFocus
                      />
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => handleScoreEdit(focusHole, group.scorePlayerId)} activeOpacity={0.7}>
                      <ScoreCell gross={g} par={focusHoleData?.par ?? 4} isEditable size="lg" />
                    </TouchableOpacity>
                  )
                ) : (
                  <ScoreCell gross={g} par={focusHoleData?.par ?? 4} isEditable={false} size="md" />
                )}
              </View>
            </View>
          );
        })
      )}

      {/* Progress dots */}
      <View style={styles.progressRow}>
        {holeData.map((_, i) => {
          const refId  = focusGroups[0]?.scorePlayerId ?? myPlayer?.id ?? '';
          const filled = getScore(refId, i) > 0;
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
      <MatchBanner segmentName={segLabel} status={getMatchStatus(matchHistory)} />

      {config.rounds > 1 && (
        <View style={styles.roundRow}>
          {Array.from({ length: config.rounds }).map((_, i) => (
            <TouchableOpacity key={i}
              style={[styles.roundPill, activeRound === i && styles.roundPillActive]}
              onPress={() => { setActiveRound(i); setFocusHole(0); }}>
              <Text style={activeRound === i ? styles.roundPillTextActive : styles.roundPillText}>R{i + 1}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.segRow}>
        {(['Front 9', 'Back 9'] as const).map((label, sIdx) => (
          <TouchableOpacity key={sIdx}
            style={[styles.segBtn, activeSegment === sIdx && styles.segBtnActive]}
            onPress={() => { setActiveSegment(sIdx); setFocusHole(0); }}>
            <Text style={activeSegment === sIdx ? styles.segBtnTextActive : styles.segBtnText}>{label}</Text>
            <Text style={styles.segFormat}>{roundData.formats?.[sIdx] ?? '—'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toggle}>
        {(['FOCUS', 'GRID'] as const).map(m => (
          <TouchableOpacity key={m}
            style={[styles.toggleBtn, viewMode === m && styles.toggleBtnActive]}
            onPress={() => setViewMode(m)}>
            <Text style={viewMode === m ? styles.toggleTextActive : styles.toggleText}>
              {m === 'FOCUS' ? '◎ Hole Focus' : '⊞ Full Scorecard'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Score entry modal (grid mode) */}
      {editingHole && viewMode === 'GRID' && (
        <View style={styles.editOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>
              Hole {holeData[editingHole.holeIdx]?.hole} · {config.players.find(p => p.id === editingHole.playerId)?.name}
            </Text>
            <TextInput
              style={styles.editModalInput}
              keyboardType="number-pad" autoFocus
              value={editValue} onChangeText={setEditValue}
              maxLength={2} onSubmitEditing={commitEdit}
              returnKeyType="done" selectTextOnFocus
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
  segFormat: { fontSize: 9, color: '#94a3b8', marginTop: 1, fontWeight: '700', letterSpacing: 0.5 },
  toggle: { flexDirection: 'row', padding: 8, backgroundColor: '#f1f5f9', gap: 6 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  toggleText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  toggleTextActive: { fontSize: 13, color: '#1e3a8a', fontWeight: '800' },
  // Grid
  gridHeader: { flexDirection: 'row', backgroundColor: '#2d5016', paddingVertical: 8 },
  gridHeaderText: { fontSize: 9, fontWeight: '800', color: '#a3e635', letterSpacing: 0.8, textAlign: 'center' },
  gridHeaderHole: { fontSize: 11, fontWeight: '900', color: '#fff', textAlign: 'center' },
  gridHeaderPar: { fontSize: 9, color: '#86efac', textAlign: 'center' },
  gridPlayerCol: { width: 108, paddingHorizontal: 5, justifyContent: 'center' },
  gridMetricCol: { width: 52, paddingHorizontal: 4, justifyContent: 'center' },
  gridHoleCol: { width: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  gridTotalCol: { width: 40, alignItems: 'center', justifyContent: 'center' },
  gridRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 2 },
  gridRowFirst: { paddingTop: 5 },
  gridRowNet: { backgroundColor: '#f8faff' },
  gridRowWLH: { backgroundColor: '#fafafa', paddingBottom: 4 },
  gridRowOpponent: { opacity: 0.8 },
  gridPlayerCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarStack: { width: 48, height: 48, position: 'relative' },
  avatarOverlap: { position: 'absolute', bottom: -6, right: -8 },
  gridPlayerName: { fontSize: 11, fontWeight: '700', color: '#1e293b', flex: 1 },
  gridMetricText: { fontSize: 9, fontWeight: '600', color: '#94a3b8', textAlign: 'center' },
  gridNetText: { fontSize: 10, fontWeight: '600', color: '#64748b', textAlign: 'center' },
  popDot: { fontSize: 6, color: '#1e3a8a', textAlign: 'center' },
  gridTotalText: { fontSize: 12, fontWeight: '800', color: '#1e293b', textAlign: 'center' },
  playerDivider: { height: 1, backgroundColor: '#e2e8f0', marginHorizontal: 8 },
  scoreCell: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scoreCellText: { fontWeight: '800' },
  doubleBorder: { borderWidth: 3 },
  // Focus
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
  focusParRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  focusBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, color: '#fff', fontWeight: '700', fontSize: 13 },
  focusResultBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  focusResultText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  combinedBanner: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#fde68a' },
  combinedBannerText: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  focusSectionLabel: { fontSize: 10, fontWeight: '800', color: '#1e3a8a', letterSpacing: 1.5, marginBottom: 8 },
  focusPlayerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  focusPlayerRowOpp: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  focusAvatarCol: { alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  focusPlayerInfo: { flex: 1 },
  focusPlayerName: { fontSize: 17, fontWeight: '800', color: '#1e293b' },
  focusPlayerMeta: { fontSize: 12, color: '#64748b', marginTop: 3 },
  readOnlyTag: { fontSize: 10, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' },
  editBox: { alignItems: 'center' },
  focusInput: { width: 68, height: 68, borderWidth: 2.5, borderColor: '#1e3a8a', borderRadius: 14, textAlign: 'center', fontSize: 30, fontWeight: '900', color: '#1e3a8a', backgroundColor: '#f0f4ff' },
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
  // Grid team grouping
  gridTeamHeader: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 4,
  },
  gridTeamHeaderText: {
    fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 1.5,
  },
  gridVsDivider: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 6, paddingHorizontal: 4,
  },
  gridVsLine: { flex: 1, height: 2, opacity: 0.4 },
  gridVsBubble: {
    backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
    marginHorizontal: 8,
  },
  gridVsText: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 1 },
} as any);