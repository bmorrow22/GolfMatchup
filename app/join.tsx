import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTournament } from '../store/TournamentContext';

// Ensure "export default" is here!
export default function JoinScreen() {
  const { joinTournament } = useTournament();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    email: '',
    hc: ''
  });

  const handleJoin = () => {
    if (!form.name || !form.email || !form.hc) {
      Alert.alert("Missing Info", "Please provide your name, email, and handicap.");
      return;
    }

    const newPlayer = {
      id: Math.random().toString(36).substring(7),
      name: form.name,
      email: form.email,
      hc: parseFloat(form.hc) || 0,
      role: 'PLAYER', // Default role for people joining via link
      team: 'UNASSIGNED',
      groupId: null
    };

    joinTournament(newPlayer);
    
    Alert.alert(
      "Success!", 
      "You've been added to the tournament roster.",
      [{ text: "OK", onPress: () => router.replace('/(tabs)') }]
    );
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Join Tournament</Text>
        <Text style={styles.subtitle}>Enter your details to register for the matchup.</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Dustin Johnson" 
            value={form.name}
            onChangeText={(t) => setForm({...form, name: t})}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>HANDICAP INDEX</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g. 10.4" 
            keyboardType="numeric"
            value={form.hc}
            onChangeText={(t) => setForm({...form, hc: t})}
          />
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleJoin}>
          <Text style={styles.btnText}>Register Now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', padding: 25, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  title: { fontSize: 32, fontWeight: '900', color: '#1e3a8a', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 30, marginTop: 5 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', marginBottom: 8, letterSpacing: 1 },
  input: { borderBottomWidth: 2, borderBottomColor: '#f1f5f9', paddingVertical: 10, fontSize: 18, fontWeight: '500', color: '#1e293b' },
  btn: { backgroundColor: '#1e3a8a', padding: 18, borderRadius: 12, marginTop: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});