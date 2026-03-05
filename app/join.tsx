import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
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
import { Player, useTournament } from '../store/TournamentContext';

export default function JoinScreen() {
  const { joinTournament, currentUser } = useTournament();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    hc: '',
  });

  // Auto-fill from the global currentUser profile
  useEffect(() => {
    if (currentUser) {
      setForm({
        name: currentUser.name ?? '',
        hc: String(currentUser.hc ?? 0),
      });
    }
  }, [currentUser]);

  const handleJoin = () => {
    if (!form.name) {
      Alert.alert('Missing Info', 'Please provide your name.');
      return;
    }
    if (!currentUser) {
      Alert.alert('Not Signed In', 'Please sign in before joining a tournament.');
      router.replace('/auth');
      return;
    }

    const newPlayer: Player = {
      id: currentUser.id,
      name: form.name,
      email: currentUser.email,
      hc: parseFloat(form.hc) || 0,
      role: 'PLAYER',
      team: 'UNASSIGNED',
      groupId: null,
      isPlaceholder: false,
    };

    joinTournament(newPlayer);

    Alert.alert(
      'You\'re In!',
      'You\'ve been added to the tournament roster.',
      [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Join Tournament</Text>
          <Text style={styles.subtitle}>Confirm your details for this matchup.</Text>

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

          <TouchableOpacity style={styles.btn} onPress={handleJoin}>
            <Text style={styles.btnText}>Confirm & Join</Text>
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
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});