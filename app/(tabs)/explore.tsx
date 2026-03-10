import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COURSES } from '../../constants/TorreyData';
import { TeamId, useTournament } from '../../store/TournamentContext';
import { calculateNet, getSegmentResult } from '../../utils/golfLogic';

const TEAM_COLORS: Record<string, string> = {
  A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309', UNASSIGNED: '#64748b',
};

type LeaderboardTab = 'STANDINGS' | 'SEGMENTS' | 'PAIRINGS' | 'ROSTER';

// ── Animated Standing Row ────────────────────────────────────────────────────

interface StandingEntry {
  teamId: string;
  displayName: string;
  totalPoints: number;
  segBreakdown: { label: string; result: string; pts: number }[];
  playerNames: string;
  holesPlayed: number;
  recentResults: string[]; // last 3 hole results for streak detection
}

function FireBadge() {
  const flicker = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 0.6, duration: 400, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 1,   duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.Text style={{ fontSize: 18, opacity: flicker }}>🔥</Animated.Text>
  );
}

function IceBadge() {
  return <Text style={{ fontSize: 18 }}>🥶</Text>;
}

interface StandingRowProps {
  entry: StandingEntry;
  rank: number;
  prevRank: number | null;
  isNew: boolean;
}

function StandingRow({ entry, rank, prevRank, isNew }: StandingRowProps) {
  const slideAnim = useRef(new Animated.Value(isNew ? 60 : 0)).current;
  const fadeAnim  = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;
  const prevRankRef = useRef(prevRank);

  // Animate in on first mount
  useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  // Animate position change
  useEffect(() => {
    if (prevRankRef.current !== null && prevRankRef.current !== rank) {
      const movedUp = rank < (prevRankRef.current ?? rank);
      // Flash green/red background
      bgAnim.setValue(1);
      Animated.timing(bgAnim, { toValue: 0, duration: 1200, useNativeDriver: false }).start();
      // Bounce scale
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: movedUp ? 1.04 : 0.97, duration: 180, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
      ]).start();
    }
    prevRankRef.current = rank;
  }, [rank]);

  const rankMoved = prevRank !== null && prevRank !== rank;
  const movedUp   = rankMoved && rank < (prevRank ?? rank);
  const movedDown = rankMoved && rank > (prevRank ?? rank);

  // Hot streak: last 3 segments all wins
  const onFire = entry.recentResults.length >= 3 &&
    entry.recentResults.slice(-3).every(r => r === 'WIN');

  // Cold streak: last 3 segments all losses
  const iceCold = entry.recentResults.length >= 3 &&
    entry.recentResults.slice(-3).every(r => r === 'LOSS');

  const flashBg = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0)', movedUp ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.08)'],
  });

  const teamColor = TEAM_COLORS[entry.teamId] ?? '#64748b';

  return (
    <Animated.View style={[
      styles.standingCard,
      { borderLeftColor: teamColor },
      { transform: [{ translateY: slideAnim }, { scale: scaleAnim }], opacity: fadeAnim },
    ]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: flashBg, borderRadius: 14 }]} />

      {/* Rank */}
      <View style={styles.rankBox}>
        <Text style={styles.rankNum}>#{rank}</Text>
        {rankMoved && (
          <Text style={[styles.rankChange, movedUp ? styles.rankUp : styles.rankDown]}>
            {movedUp ? '▲' : '▼'}
          </Text>
        )}
      </View>

      {/* Team info */}
      <View style={{ flex: 1 }}>
        <View style={styles.teamNameRow}>
          <Text style={[styles.teamName, { color: teamColor }]}>{entry.displayName}</Text>
          {onFire  && <FireBadge />}
          {iceCold && <IceBadge />}
        </View>
        <Text style={styles.teamPlayers} numberOfLines={1}>{entry.playerNames}</Text>
        <View style={styles.segDotsRow}>
          {entry.segBreakdown.map((seg, i) => (
            <View key={i} style={[
              styles.segDot,
              seg.result === 'WIN'  && styles.segDotWin,
              seg.result === 'LOSS' && styles.segDotLoss,
              seg.result === 'TIE'  && styles.segDotTie,
            ]}>
              <Text style={styles.segDotText}>{seg.label.split(' ')[1]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Points */}
      <View style={styles.ptsBox}>
        <Text style={styles.ptsNum}>{entry.totalPoints}</Text>
        <Text style={styles.ptsLabel}>PTS</Text>
        {entry.holesPlayed > 0 && (
          <Text style={styles.thruLabel}>THRU {entry.holesPlayed}</Text>
        )}
      </View>
    </Animated.View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const { config, scores, refreshTournament } = useTournament();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('STANDINGS');
  const [refreshing, setRefreshing] = useState(false);

  // Track previous ranks for animation
  const prevRanksRef = useRef<Record<string, number>>({});
  const isFirstRender = useRef(true);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshTournament();
    setRefreshing(false);
  };

  // ── Compute standings ───────────────────────────────────────────────────────

  const standings: StandingEntry[] = useMemo(() => {
    if (!config) return [];

    const teamIds = ['A', 'B', 'C', 'D'].filter(t =>
      config.players.some(p => p.team === t && !p.isPlaceholder)
    );

    // FIX #2: Show standings even without pairings — use team assignments directly.
    // Previously standings returned [] when pairings.length === 0. Now we either
    // use pairings if available, or fall back to team-vs-team scoring.
    const hasPairings = config.pairings.length > 0;

    return teamIds.map(teamId => {
      let totalPoints = 0;
      let holesPlayed = 0;
      const segBreakdown: { label: string; result: string; pts: number }[] = [];
      const recentResults: string[] = [];

      for (let r = 0; r < config.rounds; r++) {
        for (let s = 0; s < 2; s++) {
          const course    = COURSES[config.roundsData?.[r]?.course ?? 'SOUTH'] ?? COURSES.SOUTH;
          const holes     = s === 0 ? course.front9 : course.back9;
          const segOffset = s === 0 ? 0 : 9;

          let teamAPlayers, teamBPlayers, myTeamIsA, myTeamIsB;

          if (hasPairings) {
            const pairing = config.pairings.find(p => p.roundIndex === r && p.segmentIndex === s);
            if (!pairing) continue;
            teamAPlayers = config.players.filter(p => pairing.teamAPlayers.includes(p.id));
            teamBPlayers = config.players.filter(p => pairing.teamBPlayers.includes(p.id));
            myTeamIsA = teamAPlayers.some(p => p.team === teamId);
            myTeamIsB = teamBPlayers.some(p => p.team === teamId);
          } else {
            // No pairings — Team A vs Team B directly
            teamAPlayers = config.players.filter(p => p.team === 'A' && !p.isPlaceholder);
            teamBPlayers = config.players.filter(p => p.team === 'B' && !p.isPlaceholder);
            myTeamIsA = teamId === 'A';
            myTeamIsB = teamId === 'B';
          }

          if (!myTeamIsA && !myTeamIsB) continue;

          const holeResults = holes.map((hole, i) => {
            const aNet = teamAPlayers.reduce((min, p) => {
              const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
              if (!g) return min;
              return Math.min(min, calculateNet(g, p.hc, hole.si));
            }, 99);
            const bNet = teamBPlayers.reduce((min, p) => {
              const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
              if (!g) return min;
              return Math.min(min, calculateNet(g, p.hc, hole.si));
            }, 99);
            if (aNet === 99 || bNet === 99) return 'PUSH' as const;
            if (aNet < bNet) return 'WIN' as const;
            if (aNet > bNet) return 'LOSS' as const;
            return 'PUSH' as const;
          });

          // Count holes actually played (non-push due to no scores)
          const played = holeResults.filter((_, i) => {
            const aHasScore = teamAPlayers.some(p => parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') > 0);
            const bHasScore = teamBPlayers.some(p => parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') > 0);
            return aHasScore && bHasScore;
          }).length;
          holesPlayed += played;

          const seg = getSegmentResult(holeResults, config.pointsPerSegment, config.pointsPerSegmentPush);
          const myPts = myTeamIsA ? seg.teamAPoints : seg.teamBPoints;
          totalPoints += myPts;

          const resultLabel =
            seg.winner === 'PUSH' ? 'TIE' :
            (myTeamIsA ? seg.winner === 'TEAM_A' : seg.winner === 'TEAM_B') ? 'WIN' : 'LOSS';

          segBreakdown.push({
            label: `R${r + 1} ${s === 0 ? 'Front' : 'Back'}`,
            result: resultLabel,
            pts: myPts,
          });
          recentResults.push(resultLabel);
        }
      }

      const playerNames = config.players
        .filter(p => p.team === teamId && !p.isPlaceholder)
        .map(p => p.name.split(' ')[0])
        .join(' · ');

      return { teamId, displayName: config.teamNames?.[teamId as TeamId] ?? `Team ${teamId}`, totalPoints, segBreakdown, playerNames, holesPlayed, recentResults };
    }).sort((a, b) => b.totalPoints - a.totalPoints);
  }, [config, scores]);

  // Capture previous ranks on each render
  const prevRanks = useRef<Record<string, number>>({});
  const currentRanks: Record<string, number> = {};
  standings.forEach((s, i) => { currentRanks[s.teamId] = i + 1; });

  const ranksBefore = { ...prevRanks.current };
  useEffect(() => {
    prevRanks.current = { ...currentRanks };
    isFirstRender.current = false;
  });

  if (!config) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Active Tournament</Text>
        <Text style={styles.emptySub}>Create or join a tournament from Home.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      {/* PGA-style dark header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>⛳ Leaderboard</Text>
          <Text style={styles.headerSub}>{config.name ?? config.id} · {config.rounds} Round{config.rounds > 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.liveChip}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['STANDINGS', 'SEGMENTS', 'PAIRINGS', 'ROSTER'] as LeaderboardTab[]).map(tab => (
          <TouchableOpacity key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={activeTab === tab ? styles.tabTextActive : styles.tabText}>
              {tab === 'STANDINGS' ? '🏆' : tab === 'SEGMENTS' ? '📊' : tab === 'PAIRINGS' ? '🔀' : '👥'}
              {' '}{tab.charAt(0) + tab.slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ backgroundColor: '#f8f9fa' }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a8a" />}
      >
        {/* ── STANDINGS ── */}
        {activeTab === 'STANDINGS' && (
          <View>
            {/* Column headers (PGA style) */}
            <View style={styles.colHeader}>
              <Text style={[styles.colHeaderText, { width: 40 }]}>POS</Text>
              <Text style={[styles.colHeaderText, { flex: 1 }]}>TEAM</Text>
              <Text style={[styles.colHeaderText, { width: 52, textAlign: 'right' }]}>THRU</Text>
              <Text style={[styles.colHeaderText, { width: 52, textAlign: 'right' }]}>PTS</Text>
            </View>

            {standings.length === 0 ? (
              <EmptyCard text="Scores will appear here once players start entering them." />
            ) : (
              standings.map((entry, i) => (
                <StandingRow
                  key={entry.teamId}
                  entry={entry}
                  rank={i + 1}
                  prevRank={isFirstRender.current ? null : (ranksBefore[entry.teamId] ?? null)}
                  isNew={isFirstRender.current}
                />
              ))
            )}

            {/* Legend */}
            <View style={styles.legend}>
              <LegendItem color="#16a34a" label="Win" />
              <LegendItem color="#94a3b8" label="Tie" />
              <LegendItem color="#dc2626" label="Loss" />
              <Text style={styles.legendFire}>🔥 = 3-seg streak  🥶 = 3-seg cold</Text>
            </View>
          </View>
        )}

        {/* ── SEGMENTS ── */}
        {activeTab === 'SEGMENTS' && (
          <View>
            {Array.from({ length: config.rounds }).map((_, r) => (
              <View key={r} style={styles.roundCard}>
                <Text style={styles.roundTitle}>
                  Round {r + 1} · {config.roundsData?.[r]?.course ?? '—'}
                </Text>
                {[0, 1].map(s => {
                  const fmt     = config.roundsData?.[r]?.formats?.[s] ?? '—';
                  const label   = s === 0 ? 'Front 9' : 'Back 9';
                  const pairing = config.pairings.find(p => p.roundIndex === r && p.segmentIndex === s);

                  if (!pairing) {
                    return (
                      <View key={s} style={styles.segRow}>
                        <View>
                          <Text style={styles.segSide}>{label}</Text>
                          <Text style={styles.segFmt}>{fmt}</Text>
                        </View>
                        <Text style={styles.segPending}>No pairing set</Text>
                      </View>
                    );
                  }

                  const teamAPlayers = config.players.filter(p => pairing.teamAPlayers.includes(p.id));
                  const teamBPlayers = config.players.filter(p => pairing.teamBPlayers.includes(p.id));
                  const course  = COURSES[config.roundsData?.[r]?.course ?? 'SOUTH'] ?? COURSES.SOUTH;
                  const holes   = s === 0 ? course.front9 : course.back9;
                  const offset  = s === 0 ? 0 : 9;

                  let aWins = 0, bWins = 0;
                  holes.forEach((hole, i) => {
                    const aNet = teamAPlayers.reduce((mn, p) => {
                      const g = parseInt(scores?.[r]?.[offset + i]?.[p.id] ?? '') || 0;
                      return g ? Math.min(mn, calculateNet(g, p.hc, hole.si)) : mn;
                    }, 99);
                    const bNet = teamBPlayers.reduce((mn, p) => {
                      const g = parseInt(scores?.[r]?.[offset + i]?.[p.id] ?? '') || 0;
                      return g ? Math.min(mn, calculateNet(g, p.hc, hole.si)) : mn;
                    }, 99);
                    if (aNet !== 99 && bNet !== 99) {
                      if (aNet < bNet) aWins++;
                      else if (bNet < aNet) bWins++;
                    }
                  });

                  const teamAName = teamAPlayers[0]?.team
                    ? (config.teamNames?.[teamAPlayers[0].team] ?? `Team ${teamAPlayers[0].team}`)
                    : 'A';
                  const teamBName = teamBPlayers[0]?.team
                    ? (config.teamNames?.[teamBPlayers[0].team] ?? `Team ${teamBPlayers[0].team}`)
                    : 'B';
                  const result = aWins > bWins
                    ? `${teamAName} leads ${aWins - bWins} up`
                    : bWins > aWins
                    ? `${teamBName} leads ${bWins - aWins} up`
                    : aWins === 0 && bWins === 0 ? 'Not started'
                    : 'All Square';

                  const totalHoles = aWins + bWins;
                  const remaining  = 9 - totalHoles;

                  return (
                    <View key={s} style={styles.segRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.segSide}>{label}</Text>
                        <Text style={styles.segFmt}>{fmt}</Text>
                        <Text style={styles.segMatchup} numberOfLines={1}>
                          {teamAPlayers.map(p => p.name.split(' ')[0]).join('/')} vs{' '}
                          {teamBPlayers.map(p => p.name.split(' ')[0]).join('/')}
                        </Text>
                      </View>
                      <View style={styles.segRight}>
                        <Text style={[
                          styles.segResult,
                          aWins > bWins ? { color: TEAM_COLORS[teamAPlayers[0]?.team ?? 'A'] } :
                          bWins > aWins ? { color: TEAM_COLORS[teamBPlayers[0]?.team ?? 'B'] } :
                          { color: '#64748b' }
                        ]}>{result}</Text>
                        {totalHoles > 0 && (
                          <Text style={styles.thruSmall}>
                            {remaining > 0 ? `${remaining} to play` : 'Complete'}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* ── PAIRINGS ── */}
        {activeTab === 'PAIRINGS' && (
          <View>
            <Text style={styles.pairNote}>
              Matchup groups for each round and segment.
            </Text>
            {config.pairings.length === 0 ? (
              <EmptyCard text="No pairings set yet. The owner can configure them in Setup → Pairings." />
            ) : (
              Array.from({ length: config.rounds }).map((_, r) => (
                <View key={r} style={styles.roundCard}>
                  <Text style={styles.roundTitle}>Round {r + 1}</Text>
                  {[0, 1].map(s => {
                    const pairs = config.pairings.filter(p => p.roundIndex === r && p.segmentIndex === s);
                    const fmt   = config.roundsData?.[r]?.formats?.[s] ?? '—';
                    const getName = (id: string) => config.players.find(p => p.id === id)?.name ?? '?';
                    return (
                      <View key={s}>
                        <Text style={styles.segLabelBar}>{s === 0 ? 'Front 9' : 'Back 9'} · {fmt}</Text>
                        {pairs.length === 0
                          ? <Text style={styles.noPairText}>No pairing for this segment.</Text>
                          : pairs.map(pair => (
                            <View key={pair.id} style={styles.pairCard}>
                              <View style={styles.pairTeam}>
                                <View style={[styles.dot, { backgroundColor: TEAM_COLORS[config.players.find(p => p.id === pair.teamAPlayers[0])?.team ?? 'A'] ?? '#1e3a8a' }]} />
                                <Text style={styles.pairNames} numberOfLines={2}>
                                  {pair.teamAPlayers.map(getName).join('\n& ')}
                                </Text>
                              </View>
                              <View style={styles.vsBubble}>
                                <Text style={styles.vsText}>VS</Text>
                              </View>
                              <View style={[styles.pairTeam, { alignItems: 'flex-end' }]}>
                                <View style={[styles.dot, { backgroundColor: TEAM_COLORS[config.players.find(p => p.id === pair.teamBPlayers[0])?.team ?? 'B'] ?? '#dc2626' }]} />
                                <Text style={[styles.pairNames, { textAlign: 'right' }]} numberOfLines={2}>
                                  {pair.teamBPlayers.map(getName).join('\n& ')}
                                </Text>
                              </View>
                            </View>
                          ))
                        }
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── ROSTER ── */}
        {activeTab === 'ROSTER' && (
          <View>
            {['A', 'B', 'C', 'D', 'UNASSIGNED']
              .filter(t => config.players.some(p => p.team === t))
              .map(t => (
                <View key={t} style={styles.rosterCard}>
                  <View style={[styles.rosterHeader, { backgroundColor: TEAM_COLORS[t] ?? '#64748b' }]}>
                    <Text style={styles.rosterTeamLabel}>
                      {t === 'UNASSIGNED' ? 'Unassigned' : (config.teamNames?.[t as TeamId] ?? `Team ${t}`)}
                    </Text>
                    <Text style={styles.rosterHCAvg}>
                      Avg HC {(
                        config.players.filter(p => p.team === t && !p.isPlaceholder)
                          .reduce((s, p) => s + p.hc, 0) /
                        Math.max(config.players.filter(p => p.team === t && !p.isPlaceholder).length, 1)
                      ).toFixed(1)}
                    </Text>
                  </View>
                  {config.players.filter(p => p.team === t).map(player => (
                    <View key={player.id} style={styles.rosterRow}>
                      <Text style={styles.rosterName}>{player.name}</Text>
                      <Text style={styles.rosterHC}>HC {player.hc}</Text>
                      {player.isPlaceholder && (
                        <View style={styles.openBadge}>
                          <Text style={styles.openBadgeText}>OPEN</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ))
            }
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyCardText}>{text}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#f8f9fa' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center' },

  // PGA dark header
  header: {
    paddingTop: 58, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#0f172a',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 3 },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 1 },

  tabRow: { flexDirection: 'row', backgroundColor: '#1e293b', borderBottomWidth: 1, borderColor: '#334155' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: '#a3e635' },
  tabText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  tabTextActive: { fontSize: 10, fontWeight: '800', color: '#a3e635' },

  content: { padding: 14, paddingBottom: 100 },

  colHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 8,
  },
  colHeaderText: { fontSize: 9, fontWeight: '900', color: '#64748b', letterSpacing: 1 },

  // Animated standing card
  standingCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    borderLeftWidth: 5, borderWidth: 1, borderColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  rankBox: { width: 40, alignItems: 'center', marginRight: 4 },
  rankNum: { fontSize: 20, fontWeight: '900', color: '#94a3b8' },
  rankChange: { fontSize: 11, fontWeight: '900' },
  rankUp:   { color: '#16a34a' },
  rankDown: { color: '#dc2626' },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { fontSize: 18, fontWeight: '900' },
  teamPlayers: { fontSize: 12, color: '#64748b', marginTop: 2 },
  segDotsRow: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  segDot: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#e2e8f0' },
  segDotWin:  { backgroundColor: '#dcfce7' },
  segDotLoss: { backgroundColor: '#fee2e2' },
  segDotTie:  { backgroundColor: '#f1f5f9' },
  segDotText: { fontSize: 8, fontWeight: '800', color: '#64748b' },
  ptsBox: { alignItems: 'center', minWidth: 52 },
  ptsNum: { fontSize: 28, fontWeight: '900', color: '#1e293b' },
  ptsLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '700' },
  thruLabel: { fontSize: 9, color: '#64748b', marginTop: 2, fontWeight: '600' },

  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingTop: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  legendFire: { fontSize: 11, color: '#64748b' },

  roundCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  roundTitle: { fontSize: 13, fontWeight: '900', color: '#1e3a8a', padding: 14, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  segRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: '#f8f9fa' },
  segSide: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  segFmt: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  segMatchup: { fontSize: 10, color: '#94a3b8', marginTop: 4, maxWidth: 160 },
  segRight: { alignItems: 'flex-end' },
  segResult: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  segPending: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  thruSmall: { fontSize: 10, color: '#64748b', marginTop: 2 },

  pairNote: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  segLabelBar: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f8f9fa' },
  noPairText: { fontSize: 12, color: '#94a3b8', paddingHorizontal: 14, paddingBottom: 10, fontStyle: 'italic' },
  pairCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderTopWidth: 1, borderColor: '#f1f5f9' },
  pairTeam: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 3, flexShrink: 0 },
  pairNames: { fontSize: 13, fontWeight: '700', color: '#1e293b', flex: 1 },
  vsBubble: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: 6 },
  vsText: { fontSize: 10, fontWeight: '900', color: '#94a3b8' },

  rosterCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  rosterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14 },
  rosterTeamLabel: { color: '#fff', fontWeight: '900', fontSize: 13 },
  rosterHCAvg: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  rosterRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderColor: '#f1f5f9' },
  rosterName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1e293b' },
  rosterHC: { fontSize: 12, color: '#64748b', marginRight: 8 },
  openBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  openBadgeText: { fontSize: 9, fontWeight: '900', color: '#d97706' },

  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  emptyCardText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 19 },
} as any);