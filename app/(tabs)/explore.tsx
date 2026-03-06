import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COURSES } from '../../constants/TorreyData';
import { useTournament } from '../../store/TournamentContext';
import { calculateNet, getSegmentResult } from '../../utils/golfLogic';

const TEAM_COLORS: Record<string, string> = {
  A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309', UNASSIGNED: '#64748b',
};

type LeaderboardTab = 'STANDINGS' | 'SEGMENTS' | 'PAIRINGS' | 'ROSTER';

export default function LeaderboardScreen() {
  const { config, scores, refreshTournament } = useTournament();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('STANDINGS');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshTournament();
    setRefreshing(false);
  };

  // ── Compute live standings from scores in context ───────────────────────────
  const standings = useMemo(() => {
    if (!config || !config.pairings.length) return [];

    const teamIds = ['A', 'B', 'C', 'D'].filter(t =>
      config.players.some(p => p.team === t && !p.isPlaceholder)
    );

    return teamIds.map(teamId => {
      let totalPoints = 0;
      const segBreakdown: { label: string; result: string; pts: number }[] = [];

      for (let r = 0; r < config.rounds; r++) {
        for (let s = 0; s < 2; s++) {
          const pairing = config.pairings.find(
            p => p.roundIndex === r && p.segmentIndex === s
          );
          if (!pairing) continue;

          const course = COURSES[config.roundsData?.[r]?.course ?? 'SOUTH'] ?? COURSES.SOUTH;
          const holes = s === 0 ? course.front9 : course.back9;
          const segOffset = s === 0 ? 0 : 9;

          const teamAPlayers = config.players.filter(p => pairing.teamAPlayers.includes(p.id));
          const teamBPlayers = config.players.filter(p => pairing.teamBPlayers.includes(p.id));

          const myTeamIsA = teamAPlayers.some(p => p.team === teamId);
          const myTeamIsB = teamBPlayers.some(p => p.team === teamId);
          if (!myTeamIsA && !myTeamIsB) continue;

          // Score each hole
          const holeResults: ('WIN' | 'LOSS' | 'PUSH')[] = holes.map((hole, i) => {
            const aNet = teamAPlayers.reduce((min, p) => {
              const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
              if (!g) return min;
              const net = calculateNet(g, p.hc, hole.si);
              return Math.min(min, net);
            }, 99);
            const bNet = teamBPlayers.reduce((min, p) => {
              const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
              if (!g) return min;
              const net = calculateNet(g, p.hc, hole.si);
              return Math.min(min, net);
            }, 99);
            if (aNet === 99 || bNet === 99) return 'PUSH';
            if (aNet < bNet) return 'WIN';
            if (aNet > bNet) return 'LOSS';
            return 'PUSH';
          });

          const seg = getSegmentResult(
            holeResults,
            config.pointsPerSegment,
            config.pointsPerSegmentPush
          );

          const myPts = myTeamIsA ? seg.teamAPoints : seg.teamBPoints;
          totalPoints += myPts;
          segBreakdown.push({
            label: `R${r + 1} ${s === 0 ? 'Front' : 'Back'}`,
            result: seg.winner === 'PUSH' ? 'TIE' : (myTeamIsA ? seg.winner === 'TEAM_A' : seg.winner === 'TEAM_B') ? 'WIN' : 'LOSS',
            pts: myPts,
          });
        }
      }

      return { teamId, totalPoints, segBreakdown };
    }).sort((a, b) => b.totalPoints - a.totalPoints);
  }, [config, scores]);

  if (!config) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Active Tournament</Text>
        <Text style={styles.emptySub}>Create or join a tournament from Home.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Text style={styles.headerSub}>{config.id} · {config.rounds} Round{config.rounds > 1 ? 's' : ''}</Text>
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
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a8a" />}
      >
        {/* ── STANDINGS ── */}
        {activeTab === 'STANDINGS' && (
          <View>
            {standings.length === 0 ? (
              <EmptyCard text="No pairings yet. Set up pairings in Setup → Pairings tab to see live scores here." />
            ) : (
              standings.map((team, i) => (
                <View key={team.teamId} style={[styles.standingCard, { borderLeftColor: TEAM_COLORS[team.teamId] }]}>
                  <View style={styles.standingRank}>
                    <Text style={styles.rankNum}>#{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.teamName, { color: TEAM_COLORS[team.teamId] }]}>Team {team.teamId}</Text>
                    <Text style={styles.teamPlayers}>
                      {config.players.filter(p => p.team === team.teamId && !p.isPlaceholder).map(p => p.name).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.ptsBox}>
                    <Text style={styles.ptsNum}>{team.totalPoints}</Text>
                    <Text style={styles.ptsLabel}>pts</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── SEGMENTS ── */}
        {activeTab === 'SEGMENTS' && (
          <View>
            {Array.from({ length: config.rounds }).map((_, r) => (
              <View key={r} style={styles.roundCard}>
                <Text style={styles.roundTitle}>Round {r + 1} · {config.roundsData?.[r]?.course ?? '—'}</Text>
                {[0, 1].map(s => {
                  const fmt = config.roundsData?.[r]?.formats?.[s] ?? '—';
                  const pairing = config.pairings.find(p => p.roundIndex === r && p.segmentIndex === s);
                  const label = s === 0 ? 'Front 9' : 'Back 9';

                  if (!pairing) {
                    return (
                      <View key={s} style={styles.segRow}>
                        <View>
                          <Text style={styles.segSide}>{label}</Text>
                          <Text style={styles.segFmt}>{fmt}</Text>
                        </View>
                        <Text style={styles.segPending}>No pairing</Text>
                      </View>
                    );
                  }

                  const teamAPlayers = config.players.filter(p => pairing.teamAPlayers.includes(p.id));
                  const teamBPlayers = config.players.filter(p => pairing.teamBPlayers.includes(p.id));
                  const teamAName = teamAPlayers[0]?.team ? `Team ${teamAPlayers[0].team}` : 'Team A';
                  const teamBName = teamBPlayers[0]?.team ? `Team ${teamBPlayers[0].team}` : 'Team B';

                  const course = COURSES[config.roundsData?.[r]?.course ?? 'SOUTH'] ?? COURSES.SOUTH;
                  const holes = s === 0 ? course.front9 : course.back9;
                  const segOffset = s === 0 ? 0 : 9;

                  const aWins = holes.filter((hole, i) => {
                    const aNet = teamAPlayers.reduce((mn, p) => {
                      const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
                      return g ? Math.min(mn, calculateNet(g, p.hc, hole.si)) : mn;
                    }, 99);
                    const bNet = teamBPlayers.reduce((mn, p) => {
                      const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
                      return g ? Math.min(mn, calculateNet(g, p.hc, hole.si)) : mn;
                    }, 99);
                    return aNet !== 99 && bNet !== 99 && aNet < bNet;
                  }).length;
                  const bWins = holes.filter((hole, i) => {
                    const aNet = teamAPlayers.reduce((mn, p) => {
                      const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
                      return g ? Math.min(mn, calculateNet(g, p.hc, hole.si)) : mn;
                    }, 99);
                    const bNet = teamBPlayers.reduce((mn, p) => {
                      const g = parseInt(scores?.[r]?.[segOffset + i]?.[p.id] ?? '') || 0;
                      return g ? Math.min(mn, calculateNet(g, p.hc, hole.si)) : mn;
                    }, 99);
                    return aNet !== 99 && bNet !== 99 && bNet < aNet;
                  }).length;

                  const result = aWins > bWins ? `${teamAName} leads ${aWins - bWins} up`
                    : bWins > aWins ? `${teamBName} leads ${bWins - aWins} up`
                    : 'All Square';

                  return (
                    <View key={s} style={styles.segRow}>
                      <View>
                        <Text style={styles.segSide}>{label}</Text>
                        <Text style={styles.segFmt}>{fmt}</Text>
                      </View>
                      <View style={styles.segRight}>
                        <Text style={styles.segResult}>{result}</Text>
                        <Text style={styles.segMatchup}>
                          {teamAPlayers.map(p => p.name).join('/')} vs {teamBPlayers.map(p => p.name).join('/')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* ── PAIRINGS (read-only view for all players) ── */}
        {activeTab === 'PAIRINGS' && (
          <View>
            <Text style={styles.pairNote}>
              Your matchup groups for each round and segment. Contact the tournament owner to make changes.
            </Text>
            {config.pairings.length === 0 ? (
              <EmptyCard text="No pairings set yet. The tournament owner can set them up in the Setup tab." />
            ) : (
              Array.from({ length: config.rounds }).map((_, r) => (
                <View key={r} style={styles.roundCard}>
                  <Text style={styles.roundTitle}>Round {r + 1}</Text>
                  {[0, 1].map(s => {
                    const pairs = config.pairings.filter(p => p.roundIndex === r && p.segmentIndex === s);
                    const fmt = config.roundsData?.[r]?.formats?.[s] ?? '—';
                    const getName = (id: string) => config.players.find(p => p.id === id)?.name ?? '?';
                    return (
                      <View key={s}>
                        <Text style={styles.segLabel}>{s === 0 ? 'Front 9' : 'Back 9'} · {fmt}</Text>
                        {pairs.length === 0
                          ? <Text style={styles.noPairText}>No pairing for this segment.</Text>
                          : pairs.map(pair => (
                            <View key={pair.id} style={styles.pairCard}>
                              <View style={styles.pairTeam}>
                                <View style={[styles.dot, { backgroundColor: '#1e3a8a' }]} />
                                <Text style={styles.pairNames} numberOfLines={1}>
                                  {pair.teamAPlayers.map(getName).join(' & ')}
                                </Text>
                              </View>
                              <Text style={styles.vsText}>vs</Text>
                              <View style={styles.pairTeam}>
                                <View style={[styles.dot, { backgroundColor: '#dc2626' }]} />
                                <Text style={styles.pairNames} numberOfLines={1}>
                                  {pair.teamBPlayers.map(getName).join(' & ')}
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
            {['A','B','C','D','UNASSIGNED']
              .filter(t => config.players.some(p => p.team === t))
              .map(t => (
                <View key={t} style={styles.rosterCard}>
                  <View style={[styles.rosterHeader, { backgroundColor: TEAM_COLORS[t] ?? '#64748b' }]}>
                    <Text style={styles.rosterTeamLabel}>
                      {t === 'UNASSIGNED' ? 'Unassigned' : `Team ${t}`}
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
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingBadgeText}>OPEN</Text>
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

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyCardText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#1e293b' },
  headerSub: { fontSize: 13, color: '#64748b', marginTop: 3 },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: '#1e3a8a' },
  tabText: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { fontSize: 11, fontWeight: '800', color: '#1e3a8a' },
  content: { padding: 16, paddingBottom: 100 },
  standingCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderLeftWidth: 5, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', alignItems: 'center' },
  standingRank: { marginRight: 12 },
  rankNum: { fontSize: 20, fontWeight: '900', color: '#94a3b8' },
  teamName: { fontSize: 18, fontWeight: '900' },
  teamPlayers: { fontSize: 12, color: '#64748b', marginTop: 2 },
  ptsBox: { alignItems: 'center', minWidth: 52 },
  ptsNum: { fontSize: 32, fontWeight: '900', color: '#1e293b' },
  ptsLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '700' },
  roundCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  roundTitle: { fontSize: 13, fontWeight: '900', color: '#1e3a8a', padding: 14, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  segRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#f8f9fa' },
  segSide: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  segFmt: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  segRight: { alignItems: 'flex-end' },
  segResult: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  segMatchup: { fontSize: 10, color: '#94a3b8', marginTop: 2, maxWidth: 180, textAlign: 'right' },
  segPending: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  pairNote: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  segLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 1, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f8f9fa' },
  noPairText: { fontSize: 12, color: '#94a3b8', paddingHorizontal: 14, paddingBottom: 10, fontStyle: 'italic' },
  pairCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderColor: '#f1f5f9' },
  pairTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  pairNames: { fontSize: 13, fontWeight: '700', color: '#1e293b', flex: 1 },
  vsText: { fontSize: 11, fontWeight: '900', color: '#94a3b8', marginHorizontal: 6 },
  rosterCard: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  rosterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14 },
  rosterTeamLabel: { color: '#fff', fontWeight: '900', fontSize: 13 },
  rosterHCAvg: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  rosterRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderColor: '#f1f5f9' },
  rosterName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1e293b' },
  rosterHC: { fontSize: 12, color: '#64748b', marginRight: 8 },
  pendingBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pendingBadgeText: { fontSize: 9, fontWeight: '900', color: '#d97706' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  emptyCardText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 19 },
});