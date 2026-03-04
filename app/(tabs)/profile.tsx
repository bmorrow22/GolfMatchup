import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ProfileScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [handicap, setHandicap] = useState('');

  // Load saved data when the screen opens
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const savedName = await AsyncStorage.getItem('user_name');
      const savedEmail = await AsyncStorage.getItem('user_email');
      const savedHC = await AsyncStorage.getItem('user_hc');

      if (savedName) setName(savedName);
      if (savedEmail) setEmail(savedEmail);
      if (savedHC) setHandicap(savedHC);
    } catch (e) {
      console.error("Failed to load profile", e);
    }
  };

  const saveProfile = async () => {
    try {
      await AsyncStorage.setItem('user_name', name);
      await AsyncStorage.setItem('user_email', email);
      await AsyncStorage.setItem('user_hc', handicap);
      Alert.alert("Success", "Profile updated locally!");
    } catch (e) {
      Alert.alert("Error", "Failed to save profile.");
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Your Profile</Text>
        <Text style={styles.subtitle}>These details will be used for tournament registration.</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput 
            style={styles.input} 
            value={name} 
            onChangeText={setName} 
            placeholder="Dustin Johnson"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput 
            style={styles.input} 
            value={email} 
            onChangeText={setEmail} 
            placeholder="dj@pga.com"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>HANDICAP INDEX</Text>
          <TextInput 
            style={styles.input} 
            value={handicap} 
            onChangeText={setHandicap} 
            placeholder="10.4"
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
          <Text style={styles.saveButtonText}>Save Profile</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 25 },
  header: { marginTop: 60, marginBottom: 30 },
  title: { fontSize: 32, fontWeight: '900', color: '#1e3a8a' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 5 },
  form: { flex: 1 },
  inputGroup: { marginBottom: 25 },
  label: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', marginBottom: 8, letterSpacing: 1 },
  input: { borderBottomWidth: 2, borderBottomColor: '#f1f5f9', paddingVertical: 10, fontSize: 18, fontWeight: '500', color: '#1e293b' },
  saveButton: { backgroundColor: '#1e3a8a', padding: 18, borderRadius: 12, marginTop: 20, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});