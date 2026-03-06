import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTournament } from '../../store/TournamentContext';

export default function ProfileScreen() {
  const { currentUser, setCurrentUser } = useTournament();
  const [name, setName]         = useState('');
  const [handicap, setHandicap] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setHandicap(String(currentUser.hc));
      _loadAvatar(currentUser.id);
    }
  }, [currentUser?.id]);

  const _loadAvatar = async (userId: string) => {
    const { data } = supabase.storage.from('avatars').getPublicUrl(`${userId}.jpg`);
    if (data?.publicUrl) {
      // Append cache-buster so re-uploads are reflected immediately
      setAvatarUri(`${data.publicUrl}?t=${Date.now()}`);
    }
  };

  // ── Pick & upload photo ─────────────────────────────────────────────────────
  const handlePickPhoto = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],     // force square crop
      quality: 0.6,        // compress to reduce upload size
      base64: true,        // needed for Supabase upload
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data.');
      return;
    }

    setUploading(true);
    try {
      await _uploadAvatar(asset.base64);
      setAvatarUri(`${asset.uri}?local=1`); // show local preview immediately
    } finally {
      setUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access in Settings.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) return;

    setUploading(true);
    try {
      await _uploadAvatar(asset.base64);
      setAvatarUri(`${asset.uri}?local=1`);
    } finally {
      setUploading(false);
    }
  };

  const _uploadAvatar = async (base64: string) => {
    if (!currentUser) return;

    // Decode base64 → ArrayBuffer for Supabase upload
    const byteChars   = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const { error } = await supabase.storage
      .from('avatars')
      .upload(`${currentUser.id}.jpg`, byteArray, {
        contentType: 'image/jpeg',
        upsert: true,   // overwrite existing avatar
      });

    if (error) {
      Alert.alert('Upload Failed', error.message);
      console.error('[avatar upload]', error.message);
    } else {
      // Update profiles table with new avatar URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${currentUser.id}.jpg`);
      if (urlData?.publicUrl) {
        await supabase
          .from('profiles')
          .update({ avatar_url: urlData.publicUrl })
          .eq('id', currentUser.id);
      }
      Alert.alert('Photo Updated ✓', 'Your profile photo has been saved.');
    }
  };

  const showPhotoOptions = () => {
    Alert.alert('Profile Photo', 'Choose a source', [
      { text: '📷  Take Photo', onPress: handleTakePhoto },
      { text: '🖼  Choose from Library', onPress: handlePickPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Save profile details ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          handicap: parseFloat(handicap) || 0,
        })
        .eq('id', currentUser.id);

      if (error) {
        Alert.alert('Error', 'Could not save profile.');
      } else {
        setCurrentUser({ ...currentUser, name: name.trim(), hc: parseFloat(handicap) || 0 });
        Alert.alert('Saved ✓', 'Profile updated.');
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Sign out ────────────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await supabase.auth.signOut();
          setSigningOut(false);
        },
      },
    ]);
  };

  if (!currentUser) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Not signed in.</Text>
      </View>
    );
  }

  const initials = currentUser.name
    .split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── Avatar ── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={showPhotoOptions} style={styles.avatarWrapper} activeOpacity={0.85}>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatarImage}
                onError={() => setAvatarUri(null)}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}

            {/* Upload overlay */}
            {uploading ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            ) : (
              <View style={styles.avatarEditBadge}>
                <Text style={styles.avatarEditIcon}>📷</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.avatarHint}>Tap to change photo</Text>
          <Text style={styles.displayName}>{currentUser.name}</Text>
          <Text style={styles.displayEmail}>{currentUser.email}</Text>
        </View>

        {/* ── Editable fields ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>PROFILE DETAILS</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL</Text>
            <Text style={styles.staticField}>{currentUser.email}</Text>
            <Text style={styles.hint}>Email cannot be changed here.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>HANDICAP INDEX</Text>
            <TextInput
              style={styles.input}
              value={handicap}
              onChangeText={setHandicap}
              placeholder="0.0"
              keyboardType="numeric"
              returnKeyType="done"
            />
            <Text style={styles.hint}>Updates your default HC for future tournaments.</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save Profile</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity
          style={[styles.signOutBtn, signingOut && styles.disabled]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut
            ? <ActivityIndicator color="#dc2626" />
            : <Text style={styles.signOutText}>Sign Out</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const AVATAR_SIZE = 110;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 64, paddingBottom: 100 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#64748b' },

  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarWrapper: { position: 'relative', marginBottom: 10 },
  avatarImage: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3, borderColor: '#1e3a8a',
  },
  avatarFallback: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#1e3a8a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#1e3a8a',
  },
  avatarInitials: { color: '#fff', fontSize: 36, fontWeight: '900' },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0,
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: '#fff',
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  avatarEditIcon: { fontSize: 14 },
  avatarHint: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
  displayName: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  displayEmail: { fontSize: 13, color: '#64748b', marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 11, fontWeight: '900', color: '#64748b', letterSpacing: 1.5, marginBottom: 16 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 8, letterSpacing: 1 },
  input: {
    borderBottomWidth: 2, borderBottomColor: '#e2e8f0',
    paddingVertical: 10, fontSize: 17, fontWeight: '500', color: '#1e293b',
  },
  staticField: { fontSize: 17, fontWeight: '500', color: '#94a3b8', paddingVertical: 10 },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' },
  saveBtn: { backgroundColor: '#1e3a8a', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  signOutBtn: {
    borderWidth: 1.5, borderColor: '#fecaca', backgroundColor: '#fff5f5',
    padding: 15, borderRadius: 12, alignItems: 'center',
  },
  signOutText: { color: '#dc2626', fontWeight: '800', fontSize: 15 },
});