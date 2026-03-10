import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTournament } from '../../store/TournamentContext';

export default function TabLayout() {
  const { config, userRole } = useTournament();

  // Setup tab only visible when:
  // 1. There is an active tournament open
  // 2. The user is the owner or admin
  const canAccessSetup = !!config && (userRole === 'OWNER' || userRole === 'ADMIN');

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
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="scorecard"
        options={{
          title: 'Scorecard',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="list.bullet.rectangle" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="trophy.fill" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="person.circle" color={color} />
          ),
        }}
      />

      {/* Setup: always registered, only shown when owner has a tournament open */}
      <Tabs.Screen
        name="setup"
        options={{
          title: 'Setup',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="gearshape.fill" color={color} />
          ),
          href: canAccessSetup ? undefined : null,
        }}
      />
    </Tabs>
  );
}