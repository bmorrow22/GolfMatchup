import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTournament } from '../../store/TournamentContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamSummary {
  team: string;
  totalPoints: number;
  segmentPoints: number;
  color: string;
}

// ─── Leaderboard Screen ───────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const { config } = useTournament();

  // Placeholder scoring aggregation.
  // Replace with real score data once scorecard persists results to context.
  const teams: TeamSummary[] = useMemo(() => {
    if (!config) return [];

    // Collect unique teams from roster
    const teamIds = [...new Set(config.players.map(p => p.team).filter(t => t !== 'UNASSIGNED'))];
    const teamColors: Record<string, string> = { A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309' };

    return teamIds.map(teamId => ({
      team: `Team ${teamId}`,
      totalPoints: 0,   // TODO: derive from persisted scores
      segmentPoints: 0, // TODO: derive from segment results
      color: teamColors[teamId as string] ?? '#64748b',
    }));
  }, [config]);

  const playersByTeam = useMemo(() => {
    if (!config) return {};
    return config.players.reduce<Record<string, typeof config.players>>((acc, p) => {
      const key = p.team ?? 'UNASSIGNED';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});
  }, [config]);

  if (!config) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Active Tournament</Text>
        <Text style={styles.emptySubtitle}>Create or join a tournament from the Home tab.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Leaderboard</Text>
      <Text style={styles.subHeader}>{config.id} · {config.rounds} Round{config.rounds > 1 ? 's' : ''}</Text>

      {/* ── Overall Team Standings ── */}
      <Text style={styles.sectionLabel}>OVERALL STANDINGS</Text>
      {teams.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>Teams not yet assigned. Go to Setup to build your roster.</Text>
        </View>
      ) : (
        <View style={styles.standingsGrid}>
          {teams
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .map((team, i) => (
              <View key={team.team} style={[styles.teamCard, { borderTopColor: team.color }]}>
                <Text style={styles.rankText}>#{i + 1}</Text>
                <Text style={[styles.teamName, { color: team.color }]}>{team.team}</Text>
                <Text style={styles.pointsValue}>{team.totalPoints}</Text>
                <Text style={styles.pointsLabel}>pts</Text>
              </View>
            ))}
        </View>
      )}

      {/* ── Segment Results ── */}
      <Text style={styles.sectionLabel}>SEGMENTS</Text>
      {Array.from({ length: config.rounds }).map((_, rIdx) => {
        const round = config.roundsData?.[rIdx];
        return (
          <View key={rIdx} style={styles.roundCard}>
            <Text style={styles.roundTitle}>Round {rIdx + 1} · {round?.course ?? '—'}</Text>
            {(['Front 9', 'Back 9'] as const).map((side, sIdx) => (
              <View key={side} style={styles.segmentRow}>
                <View style={styles.segmentLeft}>
                  <Text style={styles.segmentSide}>{side}</Text>
                  <Text style={styles.segmentFormat}>{round?.formats?.[sIdx] ?? '—'}</Text>
                </View>
                <View style={styles.segmentResult}>
                  <Text style={styles.segmentResultText}>—</Text>
                  <Text style={styles.segmentResultSub}>Pending</Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}

      {/* ── Roster by Team ── */}
      <Text style={styles.sectionLabel}>ROSTER</Text>
      {Object.entries(playersByTeam).map(([teamId, players]) => {
        const teamColors: Record<string, string> = { A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309', UNASSIGNED: '#64748b' };
        const color = teamColors[teamId] ?? '#64748b';
        return (
          <View key={teamId} style={styles.rosterCard}>
            <View style={[styles.rosterTeamHeader, { backgroundColor: color }]}>
              <Text style={styles.rosterTeamLabel}>
                {teamId === 'UNASSIGNED' ? 'Unassigned' : `Team ${teamId}`}
              </Text>
            </View>
            {players.map(player => (
              <View key={player.id} style={styles.rosterRow}>
                <Text style={styles.rosterName}>{player.name}</Text>
                <Text style={styles.rosterHC}>HC {player.hc}</Text>
                {player.isPlaceholder && (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>PENDING</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center' },

  header: { fontSize: 30, fontWeight: '900', color: '#1e293b' },
  subHeader: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1.5, marginBottom: 10, marginTop: 16 },

  standingsGrid: { flexDirection: 'row', gap: 12 },
  teamCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', borderTopWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  rankText: { fontSize: 11, fontWeight: '800', color: '#94a3b8' },
  teamName: { fontSize: 16, fontWeight: '900', marginVertical: 4 },
  pointsValue: { fontSize: 32, fontWeight: '900', color: '#1e293b' },
  pointsLabel: { fontSize: 11, color: '#94a3b8' },

  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  emptyCardText: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },

  roundCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  roundTitle: { fontSize: 13, fontWeight: '900', color: '#1e3a8a', padding: 14, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  segmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#f8f9fa' },
  segmentLeft: {},
  segmentSide: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  segmentFormat: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  segmentResult: { alignItems: 'flex-end' },
  segmentResultText: { fontSize: 18, fontWeight: '900', color: '#1e293b' },
  segmentResultSub: { fontSize: 10, color: '#94a3b8' },

  rosterCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  rosterTeamHeader: { padding: 10, paddingHorizontal: 14 },
  rosterTeamLabel: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderColor: '#f1f5f9' },
  rosterName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1e293b' },
  rosterHC: { fontSize: 12, color: '#64748b', marginRight: 8 },
  pendingBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pendingBadgeText: { fontSize: 9, fontWeight: '900', color: '#d97706', letterSpacing: 0.5 },
});