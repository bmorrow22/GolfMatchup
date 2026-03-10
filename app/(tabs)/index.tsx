import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PlayerAvatar } from '../../components/Playeravatar';
import { useTournament } from '../../store/TournamentContext';

// ── Tournament summary cards fetched from Supabase ────────────────────────────
interface TournamentSummary {
  id: string;
  name: string;
  status: 'SETUP' | 'ACTIVE' | 'COMPLETE';
  ownerId: string;
  playerCount: number;
  rounds: number;
}

export default function HomeScreen() {
  const {
    myTournamentIds, config, activeTournamentId,
    currentUser, createTournament,
    openTournament, closeTournament, refreshTournament,
  } = useTournament();

  const [inviteCode, setInviteCode]     = useState('');
  const [creating, setCreating]         = useState(false);
  const [joining, setJoining]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [summaries, setSummaries]       = useState<TournamentSummary[]>([]);
  const [loadingSummaries, setLoadingS] = useState(false);
  const router = useRouter();

  // Load summaries whenever myTournamentIds changes
  useEffect(() => {
    if (myTournamentIds.length === 0) { setSummaries([]); return; }
    _loadSummaries();
  }, [myTournamentIds]);

  const _loadSummaries = async () => {
    setLoadingS(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, status, owner_id, rounds, tournament_players(id)')
        .in('id', myTournamentIds);

      const list: TournamentSummary[] = (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name ?? t.id,
        status: t.status,
        ownerId: t.owner_id,
        playerCount: (t.tournament_players ?? []).length,
        rounds: t.rounds,
      }));
      // Sort: ACTIVE first, then SETUP, then COMPLETE
      list.sort((a, b) => {
        const order = { ACTIVE: 0, SETUP: 1, COMPLETE: 2 };
        return order[a.status] - order[b.status];
      });
      setSummaries(list);
    } finally {
      setLoadingS(false);
    }
  };

  const handleCreate = async () => {
    if (!currentUser) { Alert.alert('Not Signed In', 'Please sign in first.'); return; }
    setCreating(true);
    try {
      const tournament = await createTournament(`${currentUser.name.split(' ')[0]}'s Tournament`);
      if (tournament) {
        Alert.alert(
          '🏌️ Tournament Created!',
          `Invite code:\n\n${tournament.id}\n\nShare with your group.`,
          [{ text: 'Set It Up', onPress: () => router.push('/(tabs)/setup') }]
        );
      } else {
        Alert.alert('Failed', 'Could not create tournament. Check your connection.');
      }
    } finally {
      setCreating(false);
    }
  };

  // Verify the code exists then hand off to join.tsx for the confirmation + insert
  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) { Alert.alert('Invalid Code', 'Enter a valid invite code.'); return; }

    setJoining(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data, error } = await supabase
        .from('tournaments')
        .select('id')
        .eq('id', code)
        .single();

      if (error || !data) {
        Alert.alert('Not Found', 'Could not find a tournament with that code.');
        return;
      }

      setInviteCode('');
      // Pass the code to join.tsx — it handles the actual insert
      router.push({ pathname: '/join', params: { code } });
    } finally {
      setJoining(false);
    }
  };

  const handleOpenTournament = async (id: string) => {
    await openTournament(id);
    router.push('/(tabs)/scorecard');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await _loadSummaries();
    if (config) await refreshTournament();
    setRefreshing(false);
  };

  const statusColor = (s: TournamentSummary['status']) =>
    s === 'ACTIVE' ? '#16a34a' : s === 'SETUP' ? '#d97706' : '#94a3b8';
  const statusBg = (s: TournamentSummary['status']) =>
    s === 'ACTIVE' ? '#dcfce7' : s === 'SETUP' ? '#fef3c7' : '#f1f5f9';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#1e3a8a" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>
              Hey, {currentUser?.name?.split(' ')[0] ?? 'Golfer'} 👋
            </Text>
            <Text style={styles.sub}>Your golf tournaments</Text>
          </View>
          <PlayerAvatar
            userId={currentUser?.id}
            name={currentUser?.name ?? '?'}
            size={48}
            showRing={false}
          />
        </View>
      </View>

      {/* Active tournament quick-access banner */}
      {config && (
        <TouchableOpacity
          style={styles.activeBanner}
          onPress={() => router.push('/(tabs)/scorecard')}
          activeOpacity={0.85}
        >
          <View style={styles.activeBannerLeft}>
            <View style={styles.activeDot} />
            <View>
              <Text style={styles.activeBannerLabel}>CURRENTLY OPEN</Text>
              <Text style={styles.activeBannerName} numberOfLines={1}>{config.name ?? config.id}</Text>
            </View>
          </View>
          <View style={styles.activeBannerRight}>
            <Text style={styles.activeBannerAction}>Open ›</Text>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); closeTournament(); }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* My Tournaments */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Tournaments</Text>
        {loadingSummaries && <ActivityIndicator size="small" color="#1e3a8a" />}
      </View>

      {summaries.length === 0 && !loadingSummaries ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>⛳</Text>
          <Text style={styles.emptyTitle}>No tournaments yet</Text>
          <Text style={styles.emptyText}>Create a new one or join with an invite code below.</Text>
        </View>
      ) : (
        summaries.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[
              styles.tournamentCard,
              activeTournamentId === t.id && styles.tournamentCardActive,
            ]}
            onPress={() => handleOpenTournament(t.id)}
            activeOpacity={0.8}
          >
            <View style={styles.tournamentCardLeft}>
              <View style={[styles.statusPill, { backgroundColor: statusBg(t.status) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(t.status) }]}>
                  {t.status}
                </Text>
              </View>
              <Text style={styles.tournamentName} numberOfLines={1}>{t.name}</Text>
              <View style={styles.tournamentMeta}>
                <Text style={styles.tournamentMetaText}>
                  {t.playerCount} player{t.playerCount !== 1 ? 's' : ''} · {t.rounds} round{t.rounds !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.tournamentCode}>#{t.id}</Text>
              </View>
            </View>
            <View style={styles.tournamentCardRight}>
              {t.ownerId === currentUser?.id && (
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>Owner</Text>
                </View>
              )}
              <Text style={styles.tournamentArrow}>›</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Create + Join */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Start or Join</Text>
      </View>

      <View style={styles.actionsCard}>
        <TouchableOpacity
          style={[styles.createBtn, creating && styles.disabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={styles.createBtnIcon}>🏆</Text>
                <Text style={styles.createBtnText}>Host a New Tournament</Text>
              </>
          }
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.orText}>OR JOIN WITH CODE</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.joinRow}>
          <TextInput
            style={styles.joinInput}
            placeholder="Enter invite code…"
            placeholderTextColor="#94a3b8"
            autoCapitalize="characters"
            value={inviteCode}
            onChangeText={setInviteCode}
            maxLength={8}
            returnKeyType="go"
            onSubmitEditing={handleJoin}
          />
          <TouchableOpacity
            style={[styles.joinBtn, (!inviteCode.trim() || joining) && styles.disabled]}
            onPress={handleJoin}
            disabled={!inviteCode.trim() || joining}
          >
            {joining
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.joinBtnText}>Join</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  content: { paddingBottom: 120 },

  header: { backgroundColor: '#1e3a8a', paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 26, fontWeight: '900', color: '#fff' },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  activeBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1e3a8a', marginHorizontal: 16, marginTop: -12,
    borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: '#3b82f6',
    shadowColor: '#1e3a8a', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80' },
  activeBannerLabel: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5 },
  activeBannerName: { fontSize: 15, fontWeight: '800', color: '#fff', marginTop: 2, maxWidth: 180 },
  activeBannerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeBannerAction: { color: '#93c5fd', fontWeight: '700', fontSize: 14 },
  closeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#475569', letterSpacing: 1 },

  emptyCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20 },

  tournamentCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  tournamentCardActive: { borderColor: '#3b82f6', borderWidth: 2, backgroundColor: '#eff6ff' },
  tournamentCardLeft: { flex: 1 },
  tournamentCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 6 },
  statusPillText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  tournamentName: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
  tournamentMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tournamentMetaText: { fontSize: 12, color: '#64748b' },
  tournamentCode: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 1 },
  ownerBadge: { backgroundColor: '#1e3a8a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  ownerBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  tournamentArrow: { fontSize: 24, color: '#94a3b8', fontWeight: '300' },

  actionsCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  createBtn: { backgroundColor: '#1e3a8a', borderRadius: 14, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  createBtnIcon: { fontSize: 18 },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  orText: { marginHorizontal: 12, color: '#94a3b8', fontWeight: '700', fontSize: 10, letterSpacing: 1 },
  joinRow: { flexDirection: 'row', gap: 10 },
  joinInput: {
    flex: 1, backgroundColor: '#f1f5f9', padding: 14, borderRadius: 12,
    fontSize: 16, fontWeight: '800', letterSpacing: 3, color: '#1e293b',
  },
  joinBtn: { backgroundColor: '#1e3a8a', paddingHorizontal: 22, borderRadius: 12, justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});