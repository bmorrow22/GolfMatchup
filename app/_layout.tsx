import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { TournamentProvider, useTournament } from '../store/TournamentContext';

function RootLayoutNav() {
  const { currentUser, setCurrentUser } = useTournament();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // 1. Check if a user profile is saved on the device
        const savedUser = await AsyncStorage.getItem('user_profile');
        
        if (savedUser) {
          const userData = JSON.parse(savedUser);
          setCurrentUser(userData);
        }
      } catch (e) {
        console.error("Failed to load user session", e);
      } finally {
        setIsReady(true);
      }
    };

    initializeAuth();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    // 2. Logic to protect routes
    // Check if the user is currently in the "(tabs)" folder
    const inTabsGroup = segments[0] === '(tabs)';

    if (!currentUser && inTabsGroup) {
      // If no user and trying to access tabs, redirect to Auth
      router.replace('/auth');
    } else if (currentUser && segments[0] === 'auth') {
      // If user is logged in and tries to go to Auth, redirect to Home
      router.replace('/(tabs)');
    }
  }, [currentUser, segments, isReady]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

// The Provider must wrap the Navigation to use the Tournament context inside the bouncer
export default function RootLayout() {
  return (
    <TournamentProvider>
      <RootLayoutNav />
    </TournamentProvider>
  );
}