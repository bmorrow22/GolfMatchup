import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTournament } from '../../store/TournamentContext';

export default function TabLayout() {
  const { userRole } = useTournament();

  // Roles that can access the Setup tab
  const canAccessSetup = userRole === 'OWNER' || userRole === 'ADMIN';

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

      {/* Leaderboard replaces the Expo explore placeholder */}
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

      {/*
        FIX: Never conditionally render Tabs.Screen — it causes Expo Router crashes.
        Instead, use href: null to hide the tab for non-admins while keeping
        the screen registered in the navigator.
      */}
      <Tabs.Screen
        name="setup"
        options={{
          title: 'Setup',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="gearshape.fill" color={color} />
          ),
          // Hide tab item for non-admins; the screen route still exists
          href: canAccessSetup ? undefined : null,
        }}
      />
    </Tabs>
  );
}