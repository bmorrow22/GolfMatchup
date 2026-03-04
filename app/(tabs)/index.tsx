import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTournament } from '../../store/TournamentContext';

export default function LeaderboardScreen() {
  const { config } = useTournament();
  const router = useRouter();

  // Safety check: if we don't have enough players to show a matchup, show a placeholder
  const hasMinPlayers = config.players && config.players.length >= 4;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Tournament Live</Text>

      <View style={styles.card}>
        <Text style={styles.subHeader}>Current Matchups</Text>
        
        {hasMinPlayers ? (
          <View style={styles.matchupItem}>
            <Text style={styles.matchupText}>
              {config.players[0]?.name} & {config.players[1]?.name} 
              <Text style={{color: '#999'}}> vs. </Text> 
              {config.players[2]?.name} & {config.players[3]?.name}
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Waiting for players to join and teams to be optimized...</Text>
            
            {/* The Join Button lives inside the "empty" state logic */}
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
  header: { fontSize: 28, fontWeight: '800', marginTop: 40, marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 },
  subHeader: { fontSize: 14, fontWeight: '700', color: '#888', marginBottom: 15, letterSpacing: 1 },
  matchupItem: { paddingVertical: 10 },
  matchupText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', textAlign: 'center' },
  emptyState: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', marginBottom: 15 },
  joinButton: { 
    backgroundColor: '#1e3a8a', 
    paddingVertical: 12, 
    paddingHorizontal: 24, 
    borderRadius: 10,
    marginTop: 10 
  },
  joinButtonText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 16 
  }
});