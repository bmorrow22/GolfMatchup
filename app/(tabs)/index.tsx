import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTournament } from '../../store/TournamentContext';

export default function HomeScreen() {
  const { config, joinByCode, currentUser, setConfig } = useTournament();
  const [inviteCode, setInviteCode] = useState('');
  const router = useRouter();

  // PATH A: Create a Tournament (User becomes Admin/Owner)
  const handleCreateTournament = () => {
    // Generate a simple 6-character random code
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newTournament = {
      id: newCode,
      ownerId: currentUser?.id,
      course: 'SOUTH',
      segmentLength: 18,
      format: 'TOTALS',
      isHandicapEnabled: true,
      players: [
        {
          id: currentUser?.id || 'anon',
          name: currentUser?.name || 'Admin',
          email: currentUser?.email || '',
          hc: currentUser?.hc || 0,
          team: 'UNASSIGNED',
          groupId: null,
          role: 'ADMIN'
        }
      ]
    };

    setConfig(newTournament);
    Alert.alert("Success", `Tournament Created! Invite Code: ${newCode}`);
    router.push('/setup'); 
  };

  // PATH B: Join a Tournament (User becomes a Player)
  const handleJoinByCode = () => {
    if (inviteCode.length < 4) {
      Alert.alert("Error", "Please enter a valid invite code.");
      return;
    }
    
    joinByCode(inviteCode, currentUser);
    setInviteCode('');
    // Navigation happens inside context or via user manual click
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome, {currentUser?.name?.split(' ')[0] || 'Golfer'}</Text>
        <Text style={styles.subGreeting}>Ready for your next round?</Text>
      </View>

      {!config ? (
        <View style={styles.actionCard}>
          <Text style={styles.cardTitle}>Get Started</Text>
          
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateTournament}>
            <Text style={styles.createBtnText}>Host a New Tournament</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.joinSection}>
            <TextInput 
              style={styles.input}
              placeholder="Code"
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={setInviteCode}
            />
            <TouchableOpacity style={styles.joinBtn} onPress={handleJoinByCode}>
              <Text style={styles.joinBtnText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.activeCard}>
          <Text style={styles.activeLabel}>ACTIVE TOURNAMENT</Text>
          <Text style={styles.activeTitle}>{config.course} Matchup</Text>
          <Text style={styles.activeInfo}>Invite Code: <Text style={styles.codeText}>{config.id}</Text></Text>
          
          <TouchableOpacity 
            style={styles.resumeBtn} 
            onPress={() => router.push('/scorecard')}
          >
            <Text style={styles.resumeBtnText}>Open Scorecard</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 25, paddingTop: 60 },
  header: { marginBottom: 40 },
  greeting: { fontSize: 32, fontWeight: '900', color: '#1e293b' },
  subGreeting: { fontSize: 16, color: '#64748b', marginTop: 5 },
  actionCard: { backgroundColor: '#fff', borderRadius: 20, padding: 25, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20, color: '#1e3a8a' },
  createBtn: { backgroundColor: '#1e3a8a', padding: 18, borderRadius: 12, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 25 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  orText: { marginHorizontal: 15, color: '#94a3b8', fontWeight: 'bold', fontSize: 12 },
  joinSection: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: '#f1f5f9', padding: 14, borderRadius: 12, fontSize: 16, fontWeight: 'bold' },
  joinBtn: { 
    backgroundColor: '#f1f5f9', 
    paddingHorizontal: 20, 
    borderRadius: 12, 
    justifyContent: 'center', 
    borderWidth: 1, // FIXED: Correct React Native property
    borderColor: '#cbd5e1' 
  },
  joinBtnText: { color: '#1e3a8a', fontWeight: 'bold' },
  activeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 25, borderLeftWidth: 8, borderLeftColor: '#1e3a8a' },
  activeLabel: { fontSize: 10, fontWeight: '900', color: '#64748b', letterSpacing: 1 },
  activeTitle: { fontSize: 24, fontWeight: '800', color: '#1e293b', marginVertical: 8 },
  activeInfo: { fontSize: 14, color: '#64748b' },
  codeText: { color: '#1e3a8a', fontWeight: 'bold' },
  resumeBtn: { backgroundColor: '#1e3a8a', padding: 15, borderRadius: 12, marginTop: 20, alignItems: 'center' },
  resumeBtnText: { color: '#fff', fontWeight: 'bold' }
});