import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useTournament } from '../store/TournamentContext';

export default function AuthScreen() {
  const router = useRouter();
  const { setCurrentUser } = useTournament();
  
  // State for the form fields
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    handicap: ''
  });

  const handleSignUp = async () => {
    // 1. Validation check
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      Alert.alert("Missing Info", "Please fill out all required fields.");
      return;
    }

    try {
      // 2. Create the user object
      // In the future, this is where you would call Firebase or Supabase auth
      const newUser = {
        id: `user_${Math.random().toString(36).substr(2, 9)}`,
        name: `${form.firstName} ${form.lastName}`,
        email: form.email.toLowerCase(),
        hc: parseFloat(form.handicap) || 0,
        role: 'PLAYER' // Default role
      };

      // 3. Persist the user locally so they stay logged in
      await AsyncStorage.setItem('user_profile', JSON.stringify(newUser));

      // 4. Update the Global Context so the app knows who is using it
      setCurrentUser(newUser);

      // 5. Navigate to the main app
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert("Error", "Failed to create account. Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerArea}>
          <Text style={styles.title}>GolfMatchup</Text>
          <Text style={styles.subtitle}>Create your golfer profile to get started.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>First Name *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Dustin" 
              onChangeText={(val) => setForm({...form, firstName: val})}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last Name *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Johnson" 
              onChangeText={(val) => setForm({...form, lastName: val})}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="dj@golf.com" 
              keyboardType="email-address"
              autoCapitalize="none"
              onChangeText={(val) => setForm({...form, email: val})}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="••••••••" 
              secureTextEntry
              onChangeText={(val) => setForm({...form, password: val})}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Handicap (Optional)</Text>
            <TextInput 
              style={styles.input} 
              placeholder="0.0" 
              keyboardType="numeric"
              onChangeText={(val) => setForm({...form, handicap: val})}
            />
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSignUp}>
            <Text style={styles.primaryBtnText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 30, paddingTop: 80 },
  headerArea: { marginBottom: 40 },
  title: { fontSize: 36, fontWeight: '900', color: '#1e3a8a' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 10 },
  form: { gap: 20 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  input: { 
    backgroundColor: '#f1f5f9', 
    padding: 16, 
    borderRadius: 12, 
    fontSize: 16,
    color: '#1e293b'
  },
  primaryBtn: { 
    backgroundColor: '#1e3a8a', 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 10 
  },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});