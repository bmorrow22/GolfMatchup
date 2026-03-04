import React from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Player, useTournament } from '../../store/TournamentContext';

export default function SetupScreen() {
  const { config, setConfig, currentUser, updatePlayerHandicap, removePlayer } = useTournament();
  
  const players = config?.players || [];
  const isAdmin = currentUser?.role === 'ADMIN';

  const handleShareTournament = async () => {
    try {
      await Share.share({
        message: `Join my Golf Matchup tournament! Register here: https://your-app-link.com/join`,
      });
    } catch (error) {
      Alert.alert("Error", "Could not open share menu.");
    }
  };

  const handleOptimizeTournament = () => {
    if (players.length < 4) {
      Alert.alert("Error", "Need at least 4 players to balance groups.");
      return;
    }

    // ABCD / Snake Draft Logic
    // Sorts by handicap: 1st (Lowest) to 16th (Highest)
    const sorted = [...players].sort((a, b) => a.hc - b.hc);
    const numGroups = Math.floor(sorted.length / 4);
    const finalRoster: Player[] = [];

    for (let i = 0; i < numGroups; i++) {
      // The "Snake" Math:
      // Group 1: Best(1), Worst(16), 8th, and 9th.
      const p1 = sorted[i]; 
      const p2 = sorted[numGroups * 2 - 1 - i]; 
      const p3 = sorted[numGroups * 2 + i]; 
      const p4 = sorted[numGroups * 4 - 1 - i]; 

      finalRoster.push(
        { ...p1, groupId: i, team: 'A' },
        { ...p4, groupId: i, team: 'A' },
        { ...p2, groupId: i, team: 'B' },
        { ...p3, groupId: i, team: 'B' }
      );
    }

    setConfig({ ...config, players: finalRoster });
    Alert.alert("Success", `Created ${numGroups} balanced foursomes (Team A vs Team B).`);
  };

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <Text>Admin access required to modify tournament settings.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <Text style={styles.header}>Tournament Setup</Text>

      {/* SHARE SECTION */}
      <View style={styles.section}>
        <Text style={styles.label}>INVITE PLAYERS</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareTournament}>
          <Text style={styles.shareBtnText}>Share Tournament Link</Text>
        </TouchableOpacity>
      </View>

      {/* ROSTER & OPTIMIZATION */}
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.label}>ROSTER ({players.length}/16 PLAYERS)</Text>
          <TouchableOpacity onPress={handleOptimizeTournament} style={styles.optimizeBtn}>
            <Text style={styles.optimizeText}>Auto-Balance Teams</Text>
          </TouchableOpacity>
        </View>

        {players.length === 0 && (
          <Text style={styles.emptyNote}>No players registered yet. Share the link above!</Text>
        )}

        {/* GROUP DISPLAY */}
        {Array.from({ length: Math.ceil(players.length / 4) }).map((_, gIdx) => {
          const groupPlayers = players.filter((p: Player) => p.groupId === gIdx);
          
          return (
            <View key={gIdx} style={styles.groupCard}>
              <Text style={styles.groupTitle}>GROUP {gIdx + 1}</Text>
              {groupPlayers.length > 0 ? (
                groupPlayers.map((player: Player) => (
                  <View key={player.id} style={styles.playerRow}>
                    <View style={[styles.teamIndicator, { backgroundColor: player.team === 'A' ? '#1e3a8a' : '#b91c1c' }]} />
                    <Text style={styles.playerName}>{player.name}</Text>
                    
                    <View style={styles.hcContainer}>
                      <Text style={styles.hcLabel}>HC</Text>
                      <TextInput
                        style={styles.hcInput}
                        keyboardType="numeric"
                        value={String(player.hc)}
                        onChangeText={(text) => updatePlayerHandicap(player.id, parseFloat(text) || 0)}
                      />
                    </View>

                    <TouchableOpacity onPress={() => removePlayer(player.id)} style={styles.removeBtn}>
                      <Text style={styles.removeText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyNote}>Wait for "Auto-Balance" to assign groups.</Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  header: { fontSize: 32, fontWeight: '900', marginBottom: 25, marginTop: 40, color: '#1e293b' },
  section: { marginBottom: 30 },
  label: { fontSize: 12, color: '#94a3b8', fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  shareBtn: { backgroundColor: '#1e3a8a', padding: 16, borderRadius: 12, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  optimizeBtn: { backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  optimizeText: { color: '#0369a1', fontSize: 12, fontWeight: 'bold' },
  groupCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  groupTitle: { fontSize: 13, fontWeight: 'bold', color: '#64748b', marginBottom: 12 },
  playerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  teamIndicator: { width: 6, height: 30, borderRadius: 3, marginRight: 12 },
  playerName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1e293b' },
  hcContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 8, borderRadius: 6, marginRight: 8 },
  hcLabel: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold', marginRight: 4 },
  hcInput: { width: 35, height: 30, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#1e3a8a' },
  removeBtn: { padding: 4 },
  removeText: { color: '#dc2626', fontSize: 20, fontWeight: '300' },
  emptyNote: { textAlign: 'center', color: '#94a3b8', marginTop: 10, fontStyle: 'italic', fontSize: 13 }
});