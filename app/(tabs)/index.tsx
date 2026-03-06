import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTournament } from '../../store/TournamentContext';

export default function HomeScreen() {
  const { config, joinByCode, currentUser, createTournament, refreshTournament } = useTournament();
  const [inviteCode, setInviteCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const router = useRouter();

  // ── Create ──────────────────────────────────────────────────────────────────
  // CRITICAL FIX: Must call createTournament() — not setConfig() — so that both
  // the tournament row AND the owner's tournament_players row get inserted to
  // Supabase with proper UUIDs. setConfig() only calls tournaments.update(),
  // which fails when the row doesn't exist yet, and never creates a
  // tournament_players row, which is why myPlayer was always null.

  const handleCreate = async () => {
    if (!currentUser) {
      Alert.alert('Not Signed In', 'Please sign in first.');
      return;
    }
    setCreating(true);
    try {
      const tournament = await createTournament(
        `${currentUser.name.split(' ')[0]}'s Tournament`
      );
      if (tournament) {
        Alert.alert(
          '🏌️ Tournament Created!',
          `Your invite code is:\n\n${tournament.id}\n\nShare it with your group.`,
          [{ text: 'Go to Setup', onPress: () => router.push('/(tabs)/setup') }]
        );
      } else {
        Alert.alert(
          'Failed to Create',
          'Could not create tournament. Check your internet connection.\n\n' +
          'Also make sure you have run the RLS fix SQL in your Supabase dashboard.'
        );
      }
    } finally {
      setCreating(false);
    }
  };

  // ── Join ────────────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) {
      Alert.alert('Invalid Code', 'Enter a valid invite code.');
      return;
    }
    setJoining(true);
    try {
      const result = await joinByCode(code);
      if (result.success) {
        setInviteCode('');
        Alert.alert('⛳ You\'re In!', 'You\'ve joined the tournament.', [
          { text: 'Open Scorecard', onPress: () => router.push('/(tabs)/scorecard') },
        ]);
      } else {
        Alert.alert('Not Found', result.error ?? 'Could not find that tournament code.');
      }
    } finally {
      setJoining(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Welcome, {currentUser?.name?.split(' ')[0] ?? 'Golfer'} ⛳
        </Text>
        <Text style={styles.sub}>Ready for your next round?</Text>
      </View>

      {!config ? (
        // ── No active tournament ──────────────────────────────────────────────
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Get Started</Text>

          <TouchableOpacity
            style={[styles.createBtn, creating && styles.disabled]}
            onPress={handleCreate}
            disabled={creating}
          >
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.createBtnText}>🏆  Host a New Tournament</Text>
            }
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.line} />
          </View>

          <Text style={styles.joinLabel}>Enter an invite code to join</Text>
          <View style={styles.joinRow}>
            <TextInput
              style={styles.joinInput}
              placeholder="ABC123"
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={setInviteCode}
              maxLength={8}
            />
            <TouchableOpacity
              style={[styles.joinBtn, joining && styles.disabled]}
              onPress={handleJoin}
              disabled={joining}
            >
              {joining
                ? <ActivityIndicator color="#1e3a8a" />
                : <Text style={styles.joinBtnText}>Join</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // ── Active tournament card ────────────────────────────────────────────
        <View style={styles.activeCard}>
          <View style={styles.activeCardHeader}>
            <Text style={styles.activeLabel}>ACTIVE TOURNAMENT</Text>
            <TouchableOpacity onPress={refreshTournament} style={styles.refreshBtn}>
              <Text style={styles.refreshText}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activeName}>{config.name ?? `${config.id} Matchup`}</Text>

          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>Invite Code</Text>
            <Text style={styles.codeValue}>{config.id}</Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatBox label="Players" value={config.players.filter(p => !p.isPlaceholder).length} />
            <StatBox label="Slots" value={config.players.filter(p => p.isPlaceholder).length} />
            <StatBox label="Rounds" value={config.rounds} />
            <StatBox label="Pairings" value={config.pairings.length} />
          </View>

          <TouchableOpacity
            style={styles.scorecardBtn}
            onPress={() => router.push('/(tabs)/scorecard')}
          >
            <Text style={styles.scorecardBtnText}>📋  Open Scorecard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leaderboardBtn}
            onPress={() => router.push('/(tabs)/explore')}
          >
            <Text style={styles.leaderboardBtnText}>🏆  Leaderboard</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statNum}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 64, paddingBottom: 120 },
  header: { marginBottom: 32 },
  greeting: { fontSize: 30, fontWeight: '900', color: '#1e293b' },
  sub: { fontSize: 16, color: '#64748b', marginTop: 4 },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 20, elevation: 4,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#1e3a8a', marginBottom: 20 },
  createBtn: { backgroundColor: '#1e3a8a', padding: 18, borderRadius: 14, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.55 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  orText: { marginHorizontal: 12, color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  joinLabel: { fontSize: 13, color: '#64748b', marginBottom: 10 },
  joinRow: { flexDirection: 'row', gap: 10 },
  joinInput: {
    flex: 1, backgroundColor: '#f1f5f9', padding: 14,
    borderRadius: 12, fontSize: 18, fontWeight: '900', letterSpacing: 3, color: '#1e293b',
  },
  joinBtn: {
    backgroundColor: '#f1f5f9', paddingHorizontal: 22, borderRadius: 12,
    justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1',
  },
  joinBtnText: { color: '#1e3a8a', fontWeight: '800', fontSize: 15 },

  activeCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 22,
    borderLeftWidth: 6, borderLeftColor: '#1e3a8a',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
  },
  activeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  activeLabel: { fontSize: 10, fontWeight: '900', color: '#64748b', letterSpacing: 1.5 },
  refreshBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f1f5f9', borderRadius: 8 },
  refreshText: { fontSize: 12, color: '#1e3a8a', fontWeight: '700' },
  activeName: { fontSize: 22, fontWeight: '900', color: '#1e293b', marginBottom: 14, marginTop: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  codeLabel: { fontSize: 12, color: '#64748b' },
  codeValue: {
    fontSize: 16, fontWeight: '900', color: '#1e3a8a', letterSpacing: 3,
    backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  statBox: { flex: 1, backgroundColor: '#f8f9fa', borderRadius: 12, padding: 10, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '900', color: '#1e293b' },
  statLabel: { fontSize: 9, color: '#64748b', marginTop: 2, fontWeight: '700', textTransform: 'uppercase' },
  scorecardBtn: { backgroundColor: '#1e3a8a', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  scorecardBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  leaderboardBtn: { backgroundColor: '#f0fdf4', padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#86efac' },
  leaderboardBtnText: { color: '#16a34a', fontWeight: '800', fontSize: 15 },
});