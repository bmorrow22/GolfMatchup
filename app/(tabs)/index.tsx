import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Player, useTournament } from '../../store/TournamentContext';

export default function LeaderboardScreen() {
  const { config } = useTournament();
  const router = useRouter();

  // FIX: Explicitly define players here so we can use it safely throughout the file
  const players: Player[] = config?.players || [];
  const hasMinPlayers = players.length >= 4;

  // Placeholder for point calculation logic
  const getPointsCount = (playerName: string): number => {
    return 0; 
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Tournament Live</Text>

      {/* 1. POINTS LEADERBOARD SECTION */}
      <View style={styles.card}>
        <Text style={styles.subHeader}>MATCH POINTS LEADERBOARD</Text>
        {players.length > 0 ? (
          players
            .sort((a: Player, b: Player) => getPointsCount(b.name) - getPointsCount(a.name))
            .map((player: Player, idx: number) => (
              <View key={player.id} style={styles.leaderboardRow}>
                <Text style={styles.rankText}>{idx + 1}</Text>
                <Text style={styles.playerNameText}>{player.name}</Text>
                <View style={styles.pointBadge}>
                  <Text style={styles.pointCountText}>{getPointsCount(player.name)} pts</Text>
                </View>
              </View>
            ))
        ) : (
          <Text style={styles.emptyText}>No players registered yet.</Text>
        )}
      </View>

      {/* 2. MATCHUPS SECTION */}
      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.subHeader}>CURRENT MATCHUPS</Text>
        {hasMinPlayers ? (
          <View style={styles.matchupItem}>
            <Text style={styles.matchupText}>
              {/* FIX: Using ?. ensures if players[0] is missing, it shows 'TBD' instead of crashing */}
              {players[0]?.name || 'TBD'} & {players[1]?.name || 'TBD'} 
              <Text style={{color: '#94a3b8'}}> vs </Text> 
              {players[2]?.name || 'TBD'} & {players[3]?.name || 'TBD'}
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Waiting for more players to join...</Text>
            <TouchableOpacity 
              style={styles.joinButton} 
              onPress={() => router.push('/join')}
            >
              <Text style={styles.joinButtonText}>I want to Join</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20 },
  header: { fontSize: 32, fontWeight: '900', marginTop: 40, marginBottom: 20, color: '#1e293b' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  subHeader: { fontSize: 12, fontWeight: '800', color: '#94a3b8', marginBottom: 15, letterSpacing: 1.5 },
  leaderboardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rankText: { width: 30, fontSize: 14, fontWeight: '700', color: '#64748b' },
  playerNameText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1e3a8a' },
  pointBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pointCountText: { color: '#0369a1', fontSize: 12, fontWeight: '700' },
  matchupItem: { paddingVertical: 10, alignItems: 'center' },
  matchupText: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  emptyState: { alignItems: 'center', paddingVertical: 10 },
  emptyText: { color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', marginBottom: 15 },
  joinButton: { backgroundColor: '#1e3a8a', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  joinButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 }
});