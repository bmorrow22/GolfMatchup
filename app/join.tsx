import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTournament } from '../store/TournamentContext';

export default function JoinScreen() {
  const { currentUser, openTournament, refreshTournament } = useTournament();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();

  const [form, setForm] = useState({ name: '', hc: '' });
  const [joining, setJoining] = useState(false);
  const [tournamentName, setTournamentName] = useState<string | null>(null);

  // Auto-fill from the user's profile
  useEffect(() => {
    if (currentUser) {
      setForm({
        name: currentUser.name ?? '',
        hc: String(currentUser.hc ?? 0),
      });
    }
  }, [currentUser]);

  // Look up the tournament name to display it
  useEffect(() => {
    if (!code) return;
    supabase
      .from('tournaments')
      .select('name')
      .eq('id', code.toUpperCase())
      .single()
      .then(({ data }) => {
        if (data?.name) setTournamentName(data.name);
      });
  }, [code]);

  const handleJoin = async () => {
    if (!form.name.trim()) {
      Alert.alert('Missing Info', 'Please provide your display name.');
      return;
    }
    if (!currentUser) {
      Alert.alert('Not Signed In', 'Please sign in before joining a tournament.');
      router.replace('/auth');
      return;
    }
    if (!code) {
      Alert.alert('No Tournament', 'No tournament code was provided. Go back and enter one.');
      return;
    }

    setJoining(true);
    try {
      const tournamentId = code.toUpperCase();

      // 1. Confirm the tournament exists and fetch its players
      const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .select('*, tournament_players(*)')
        .eq('id', tournamentId)
        .single();

      if (tErr || !tournament) {
        Alert.alert('Not Found', 'That tournament code does not exist.');
        return;
      }

      // 2. Check if already in the tournament — if so just open it
      const existing = (tournament.tournament_players ?? []).find(
        (p: any) => p.user_id === currentUser.id
      );
      if (existing) {
        await openTournament(tournamentId);
        router.replace('/(tabs)/scorecard');
        return;
      }

      // 3. Insert a new player row for this user
      const { error: insErr } = await supabase
        .from('tournament_players')
        .insert({
          tournament_id: tournamentId,
          user_id: currentUser.id,
          display_name: form.name.trim(),
          handicap: parseFloat(form.hc) || 0,
          team: 'UNASSIGNED',
          role: 'PLAYER',
          is_placeholder: false,
          group_id: null,
        });

      if (insErr) {
        console.error('[join] insert failed:', insErr.message);
        Alert.alert('Error', insErr.message);
        return;
      }

      // 4. Load the tournament into context (also updates myTournamentIds via _loadMyTournaments)
      await openTournament(tournamentId);
      await refreshTournament();

      Alert.alert(
        "⛳ You're In!",
        `You've joined${tournamentName ? ` "${tournamentName}"` : ' the tournament'}.`,
        [{ text: 'Open Scorecard', onPress: () => router.replace('/(tabs)/scorecard') }]
      );
    } catch (err) {
      console.error('[join] unexpected error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Join Tournament</Text>
          <Text style={styles.subtitle}>
            {tournamentName
              ? `Confirm your details for\n"${tournamentName}".`
              : 'Confirm your details for this matchup.'}
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>DISPLAY NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Dustin Johnson"
              value={form.name}
              onChangeText={t => setForm(prev => ({ ...prev, name: t }))}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>TOURNAMENT HANDICAP</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 10.4"
              keyboardType="numeric"
              returnKeyType="done"
              value={form.hc}
              onChangeText={t => setForm(prev => ({ ...prev, hc: t }))}
            />
            <Text style={styles.hint}>This only affects this tournament.</Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, joining && styles.btnDisabled]}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Confirm & Join</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    padding: 25,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  title: { fontSize: 32, fontWeight: '900', color: '#1e3a8a', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 30, marginTop: 5 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', marginBottom: 8, letterSpacing: 1 },
  input: {
    borderBottomWidth: 2,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '500',
    color: '#1e293b',
  },
  hint: { fontSize: 10, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' },
  btn: { backgroundColor: '#1e3a8a', padding: 18, borderRadius: 12, marginTop: 10, alignItems: 'center' },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});