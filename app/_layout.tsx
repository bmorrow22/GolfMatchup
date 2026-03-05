import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { supabase } from '../lib/supabase';
import { TournamentProvider, useTournament } from '../store/TournamentContext';

function RootLayoutNav() {
  const { currentUser } = useTournament();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  // Wait for Supabase session to resolve before making routing decisions
  useEffect(() => {
    supabase.auth.getSession().then(() => setIsReady(true));
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const inTabsGroup = segments[0] === '(tabs)';
    if (!currentUser && inTabsGroup) {
      router.replace('/auth');
    } else if (currentUser && segments[0] === 'auth') {
      router.replace('/(tabs)');
    }
  }, [currentUser, segments, isReady]);

  if (!isReady) return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="join" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <TournamentProvider>
      <RootLayoutNav />
    </TournamentProvider>
  );
}