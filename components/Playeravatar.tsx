import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

const TEAM_COLORS: Record<string, string> = {
  A: '#1e3a8a',
  B: '#b91c1c',
  C: '#15803d',
  D: '#b45309',
  UNASSIGNED: '#64748b',
};

interface PlayerAvatarProps {
  userId?: string;       // auth.users UUID — used to fetch avatar from storage
  name: string;
  team?: string;
  size?: number;         // diameter in px, default 32
  showRing?: boolean;    // colored ring matching team color
}

// Simple LRU-style in-memory cache so we don't re-fetch on every render
const urlCache: Record<string, string | null> = {};

export function PlayerAvatar({
  userId,
  name,
  team = 'UNASSIGNED',
  size = 32,
  showRing = true,
}: PlayerAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    userId ? (urlCache[userId] ?? null) : null
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (urlCache[userId] !== undefined) {
      setAvatarUrl(urlCache[userId]);
      return;
    }
    // Fetch the public URL for this user's avatar
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(`${userId}.jpg`);

    if (data?.publicUrl) {
      // Verify the file actually exists by checking cache-busted URL
      const url = `${data.publicUrl}?t=${Date.now()}`;
      // We optimistically set it; if the Image fails to load we fall back to initials
      urlCache[userId] = url;
      setAvatarUrl(url);
    } else {
      urlCache[userId] = null;
    }
  }, [userId]);

  const initials = name
    .split(' ')
    .map(n => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const teamColor = TEAM_COLORS[team] ?? '#64748b';
  const ringWidth = showRing ? 2 : 0;
  const innerSize = size - ringWidth * 2 - 2; // account for ring + gap

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: showRing ? teamColor : 'transparent',
          borderWidth: ringWidth,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            backgroundColor: teamColor + '22', // soft tint
          },
        ]}
      >
        {avatarUrl && !loaded ? (
          // Show initials while image loads
          <Text style={[styles.initials, { fontSize: size * 0.3, color: teamColor }]}>
            {initials}
          </Text>
        ) : null}

        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={[
              styles.image,
              {
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2,
                opacity: loaded ? 1 : 0,
              },
            ]}
            onLoad={() => setLoaded(true)}
            onError={() => {
              // File doesn't exist — fall back to initials
              urlCache[userId ?? ''] = null;
              setAvatarUrl(null);
            }}
          />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.3, color: teamColor }]}>
            {initials}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  initials: {
    fontWeight: '800',
  },
});