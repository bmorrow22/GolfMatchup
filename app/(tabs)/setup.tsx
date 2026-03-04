import React from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Player, useTournament } from '../../store/TournamentContext';

export default function SetupScreen() {
  const { config, setConfig, currentUser, allRegisteredPlayers } = useTournament();
  
  // Safety check to prevent the "null" error from crashing this screen
  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'ADMIN';

  const updatePlayer = (id: string, field: string, value: string | number) => {
    const newPlayers = config.players.map((p: Player) => 
      p.id === id ? { ...p, [field]: value } : p
    );
    setConfig({ ...config, players: newPlayers });
  };

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
    // If we have registered players but haven't "started" the roster yet, use those
    const sourcePool = config.players.length > 0 ? config.players : allRegisteredPlayers;

    if (sourcePool.length < 4) {
      Alert.alert("Error", "Need at least 4 players to balance groups.");
      return;
    }

    // ABCD / Snake Draft Logic: Pairs 1&16 (Team A) and 8&9 (Team B) 
    const sorted = [...sourcePool].sort((a, b) => a.hc - b.hc);
    const numGroups = Math.floor(sorted.length / 4);
    const finalRoster: Player[] = [];

    for (let i = 0; i < numGroups; i++) {
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
    Alert.alert("Success", `Created ${numGroups} balanced foursomes.`);
  };

  if (!isAdmin) return <View style={styles.centered}><Text>Admin Only</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.header}>Tournament Setup</Text>

      {/* NEW: SHARE LINK SECTION */}
      <View style={styles.section}>
        <Text style={styles.label}>INVITE PLAYERS</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareTournament}>
          <Text style={styles.shareBtnText}>Share Tournament Link</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.label}>ROSTER ({config.players.length} PLAYERS)</Text>
          <TouchableOpacity onPress={handleOptimizeTournament} style={styles.optimizeBtn}>
            <Text style={styles.optimizeText}>Auto-Balance All</Text>
          </TouchableOpacity>
        </View>

        {config.players.length === 0 && (
          <Text style={styles.emptyNote}>No players registered yet. Share the link above!</Text>
        )}

        {Array.from({ length: Math.ceil(config.players.length / 4) }).map((_, gIdx) => (
          <View key={gIdx} style={styles.groupCard}>
            <Text style={styles.groupTitle}>GROUP {gIdx + 1}</Text>
            {config.players
              .filter((p: Player) => p.groupId === gIdx)
              .map((player: Player) => (
                <View key={player.id} style={styles.playerRow}>
                  <View style={[styles.teamIndicator, { backgroundColor: player.team === 'A' ? '#1e3a8a' : '#b91c1c' }]} />
                  <TextInput
                    style={styles.nameInput}
                    value={player.name}
                    onChangeText={(text) => updatePlayer(player.id, 'name', text)}
                  />
                  <Text style={styles.hcLabel}>HC</Text>
                  <TextInput
                    style={styles.hcInput}
                    keyboardType="numeric"
                    value={String(player.hc)}
                    onChangeText={(text) => updatePlayer(player.id, 'hc', parseFloat(text) || 0)}
                  />
                </View>
              ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  header: { fontSize: 28, fontWeight: '800', marginBottom: 25, marginTop: 40, color: '#1a1a1a' },
  section: { marginBottom: 30 },
  label: { fontSize: 12, color: '#888', fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  shareBtn: { backgroundColor: '#1e3a8a', padding: 15, borderRadius: 12, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  optimizeBtn: { backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#1e3a8a' },
  optimizeText: { color: '#1e3a8a', fontSize: 12, fontWeight: 'bold' },
  groupCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e5e7eb' },
  groupTitle: { fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  teamIndicator: { width: 5, height: 24, borderRadius: 3, marginRight: 15 },
  nameInput: { flex: 2, fontSize: 16, fontWeight: '500', color: '#1a1a1a' },
  hcLabel: { fontSize: 12, color: '#999', marginRight: 8, fontWeight: '600' },
  hcInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, width: 45, height: 30, textAlign: 'center', fontSize: 14, backgroundColor: '#f9fafb' },
  emptyNote: { textAlign: 'center', color: '#999', marginTop: 20, fontStyle: 'italic' }
});