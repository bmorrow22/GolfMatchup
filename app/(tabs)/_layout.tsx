import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTournament } from '../../store/TournamentContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { currentUser } = useTournament(); 

  // Use 'PLAYER' or 'GUEST' as a fallback so the app isn't a blank screen
  const userRole = currentUser?.role || 'PLAYER';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1e3a8a',
        tabBarInactiveTintColor: '#94a3b8',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: Platform.select({
          ios: {
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
      
      {/* FIX: Ensure name is lowercase to match profile.tsx */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.circle" color={color} />,
        }}
      />

      <Tabs.Screen
        name="scorecard"
        options={{
          title: 'Scorecard',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet.rectangle" color={color} />,
        }}
      />

      {/* Show Setup only for ADMIN */}
      {userRole === 'ADMIN' && (
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