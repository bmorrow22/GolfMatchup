import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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

type AuthMode = 'SIGN_UP' | 'SIGN_IN';

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('SIGN_UP');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', handicap: '',
  });

  const update = (key: string, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // ── Sign Up ───────────────────────────────────────────────────────────────
  // FIX #5: After creating an account, immediately navigate to the app.
  // Previously users were shown "check your inbox" even with email confirmation
  // OFF, because the profile insert was happening AFTER navigation was triggered.
  // Now we ensure the profile row exists BEFORE navigating, and we use
  // signInWithPassword immediately after signUp to guarantee a live session.
  const handleSignUp = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      Alert.alert('Missing Info', 'Please fill out all required fields.');
      return;
    }
    setLoading(true);
    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
      const email    = form.email.toLowerCase().trim();
      const hc       = parseFloat(form.handicap) || 0;

      // Step 1: Create the auth user
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password: form.password,
      });

      if (signUpErr) {
        Alert.alert('Sign Up Error', signUpErr.message);
        return;
      }

      const userId = signUpData.user?.id;
      if (!userId) {
        Alert.alert('Error', 'Could not create account. Please try again.');
        return;
      }

      // Step 2: Insert profile row synchronously BEFORE navigating.
      // If we navigate first, _hydrateUser runs and finds no profile row,
      // which leaves currentUser null and the router bounces back to auth.
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: userId,
        name: fullName,
        email,
        handicap: hc,
      });

      if (profileErr && profileErr.code !== '23505') {
        // 23505 = duplicate key — profile already exists, that's fine
        console.error('[signUp profile insert]', profileErr.message);
        // Non-fatal: continue anyway since the auth user was created
      }

      // Step 3: If we have a live session, navigate immediately.
      // (This works when Supabase email confirmation is OFF.)
      if (signUpData.session) {
        // _hydrateUser will be triggered by onAuthStateChange automatically.
        // Short delay ensures the auth state listener fires first.
        setTimeout(() => router.replace('/(tabs)'), 300);
        return;
      }

      // Step 4: Fallback — if no session yet (email confirmation is ON),
      // immediately sign in with the credentials the user just entered.
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: form.password,
      });

      if (signInErr || !signInData.session) {
        // Email confirmation is required — prompt the user
        Alert.alert(
          'Confirm Your Email',
          'A verification link was sent to your email. After confirming, come back and sign in.',
          [{ text: 'OK', onPress: () => setMode('SIGN_IN') }]
        );
        return;
      }

      // Signed in successfully after sign-up
      setTimeout(() => router.replace('/(tabs)'), 300);

    } catch (err) {
      console.error('[signUp unexpected]', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Sign In ───────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!form.email || !form.password) {
      Alert.alert('Missing Info', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email.toLowerCase().trim(),
        password: form.password,
      });

      if (error) {
        Alert.alert('Sign In Error', error.message);
        return;
      }

      if (data.session) {
        router.replace('/(tabs)');
      }
    } catch (err) {
      console.error('[signIn unexpected]', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerArea}>
          <Text style={styles.logo}>⛳</Text>
          <Text style={styles.title}>GolfMatchup</Text>
          <Text style={styles.subtitle}>
            {mode === 'SIGN_UP' ? 'Create your golfer profile.' : 'Welcome back. Sign in.'}
          </Text>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          {(['SIGN_UP', 'SIGN_IN'] as AuthMode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'SIGN_UP' ? 'Sign Up' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.form}>
          {mode === 'SIGN_UP' && (
            <View style={styles.nameRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput style={styles.input} placeholder="Dustin"
                  onChangeText={v => update('firstName', v)} value={form.firstName} />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput style={styles.input} placeholder="Johnson"
                  onChangeText={v => update('lastName', v)} value={form.lastName} />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email *</Text>
            <TextInput style={styles.input} placeholder="dj@golf.com"
              keyboardType="email-address" autoCapitalize="none"
              onChangeText={v => update('email', v)} value={form.email} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password *</Text>
            <TextInput style={styles.input} placeholder="••••••••"
              secureTextEntry onChangeText={v => update('password', v)} value={form.password} />
          </View>

          {mode === 'SIGN_UP' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Handicap Index (optional)</Text>
              <TextInput style={styles.input} placeholder="0.0" keyboardType="numeric"
                onChangeText={v => update('handicap', v)} value={form.handicap} />
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={mode === 'SIGN_UP' ? handleSignUp : handleSignIn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>
                  {mode === 'SIGN_UP' ? 'Create Account & Play' : 'Sign In'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 28, paddingTop: 70 },
  headerArea: { marginBottom: 28, alignItems: 'center' },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 34, fontWeight: '900', color: '#1e3a8a' },
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 6, textAlign: 'center' },
  modeToggle: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 28 },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  modeBtnText: { fontSize: 15, fontWeight: '600', color: '#94a3b8' },
  modeBtnTextActive: { color: '#1e3a8a', fontWeight: '800' },
  form: { gap: 18 },
  nameRow: { flexDirection: 'row' },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  input: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, fontSize: 16, color: '#1e293b' },
  primaryBtn: { backgroundColor: '#1e3a8a', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});