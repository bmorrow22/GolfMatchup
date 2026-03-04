import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
// 1. IMPORT TOURNAMENT CONTEXT
import { useTournament } from '../../store/TournamentContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  
  // 2. GET THE CURRENT USER ROLE
  const { currentUser } = useTournament(); 

  // If context isn't ready, show a loading screen or nothing to prevent "null" errors
  if (!currentUser) return null;

  return (
    <Tabs
      screenOptions={{
        // FIX: Explicitly set the active color to Navy Blue so it doesn't "disappear"
        tabBarActiveTintColor: '#1e3a8a',
        tabBarInactiveTintColor: '#94a3b8',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: Platform.select({
          ios: {
            // Use a static background color to ensure contrast
            backgroundColor: '#ffffff',
            position: 'absolute',
            height: 88,
            paddingBottom: 30,
          },
          default: {
            backgroundColor: '#ffffff',
            height: 60,
            paddingBottom: 10,
          },
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="scorecard"
        options={{
          title: 'Scorecard',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
        }}
      />

      {/* 4. ONLY SHOW SETUP IF USER IS ADMIN */}
      {currentUser.role === 'ADMIN' && (
        <Tabs.Screen
          name="setup"
          options={{
            title: 'Setup',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
          }}
        />
      )}
    </Tabs>
  );
}