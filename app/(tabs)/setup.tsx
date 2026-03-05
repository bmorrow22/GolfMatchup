import React, { useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { FormatType, Pairing, Player, TeamId, TournamentConfig, useTournament } from '../../store/TournamentContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = { A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309' };
const teamLabel = (i: number): TeamId => String.fromCharCode(65 + i) as TeamId;
const FORMAT_OPTIONS: { label: string; value: FormatType }[] = [
  { label: 'TOT',  value: 'TOTALS'   },
  { label: 'SCR',  value: 'SCRAMBLE' },
  { label: 'ALT',  value: 'ALT-SHOT' },
  { label: 'SIN',  value: 'SINGLES'  },
];

// ─── Auto-pairing logic ───────────────────────────────────────────────────────
// Distributes players optimally by handicap: best A vs best B, etc.
function autoPair(
  teamAPlayers: Player[],
  teamBPlayers: Player[],
  roundIndex: number,
  segmentIndex: number
): Pairing[] {
  const sortedA = [...teamAPlayers].sort((a, b) => a.hc - b.hc);
  const sortedB = [...teamBPlayers].sort((a, b) => a.hc - b.hc);
  const pairs: Pairing[] = [];

  // If TOTALS format: pair 2v2 (both A players vs both B players in one pairing)
  if (sortedA.length >= 2 && sortedB.length >= 2) {
    pairs.push({
      id: `auto-${Date.now()}`,
      roundIndex,
      segmentIndex,
      teamAPlayers: sortedA.map(p => p.id),
      teamBPlayers: sortedB.map(p => p.id),
    });
  } else {
    // 1v1 pairings
    const count = Math.min(sortedA.length, sortedB.length);
    for (let i = 0; i < count; i++) {
      pairs.push({
        id: `auto-${Date.now()}-${i}`,
        roundIndex,
        segmentIndex,
        teamAPlayers: [sortedA[i].id],
        teamBPlayers: [sortedB[i].id],
      });
    }
  }
  return pairs;
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

type SetupTab = 'CONFIG' | 'ROSTER' | 'PAIRINGS';

export default function SetupScreen() {
  const {
    config, setConfig,
    updatePlayerTeam, updatePlayerHandicap, removePlayer,
    userRole, savePairings, refreshTournament,
  } = useTournament();

  const [activeTab, setActiveTab] = useState<SetupTab>('CONFIG');
  const [teamCount, setTeamCount] = useState('2');
  const [playersPerTeam, setPlayersPerTeam] = useState('2');
  const [saving, setSaving] = useState(false);

  const isEditable = userRole === 'OWNER' || userRole === 'ADMIN';

  const updateCfg = (key: string, val: any) => {
    if (!isEditable || !config) return;
    setConfig({ ...config, [key]: val } as TournamentConfig);
  };

  const updateRound = (rIdx: number, key: string, val: any) => {
    if (!config) return;
    const rounds = [...(config.roundsData ?? [])];
    if (!rounds[rIdx]) rounds[rIdx] = { course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] };
    rounds[rIdx] = { ...rounds[rIdx], [key]: val };
    updateCfg('roundsData', rounds);
  };

  // ── Generate skeleton roster (preserves existing real players) ────────────
  const generateSkeleton = () => {
    if (!isEditable || !config) return;
    const tCount = Math.min(parseInt(teamCount) || 2, 4);
    const pCount = parseInt(playersPerTeam) || 2;

    // Keep real players, only add placeholders up to the target count
    const realPlayers = config.players.filter(p => !p.isPlaceholder);
    const newPlaceholders: Player[] = [];

    for (let t = 0; t < tCount; t++) {
      const team = teamLabel(t);
      const teamRealCount = realPlayers.filter(p => p.team === team).length;
      const needed = pCount - teamRealCount;
      for (let p = 1; p <= needed; p++) {
        newPlaceholders.push({
          id: `placeholder-${team}-${Date.now()}-${p}`,
          name: `Team ${team} Slot ${teamRealCount + p}`,
          hc: 0,
          team,
          role: 'PLAYER',
          groupId: null,
          isPlaceholder: true,
        });
      }
    }

    updateCfg('players', [...realPlayers, ...newPlaceholders]);
    Alert.alert('Done', `Roster updated. ${newPlaceholders.length} placeholder slot(s) added.`);
  };

  // ── Auto-generate pairings ─────────────────────────────────
  const handleAutoPair = async () => {
    if (!config) return;
    const allPairings: Pairing[] = [];
    const teamAPlayers = config.players.filter(p => p.team === 'A' && !p.isPlaceholder);
    const teamBPlayers = config.players.filter(p => p.team === 'B' && !p.isPlaceholder);

    for (let r = 0; r < config.rounds; r++) {
      for (let s = 0; s < 2; s++) {
        const pairs = autoPair(teamAPlayers, teamBPlayers, r, s);
        allPairings.push(...pairs);
      }
    }

    setSaving(true);
    await savePairings(allPairings);
    setSaving(false);
    Alert.alert('Pairings Set', `${allPairings.length} pairing(s) generated and saved.`);
  };

  // ── Sync full config to Supabase ──────────────────────────
  const handleSaveAll = async () => {
    if (!config) return;
    setSaving(true);
    await setConfig(config);
    setSaving(false);
    Alert.alert('Saved', 'Tournament configuration saved to Supabase.');
  };

  const players = config?.players ?? [];
  const numRounds = config?.rounds ?? 1;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Tournament Builder</Text>
            {config && (
              <View style={styles.codeRow}>
                <Text style={styles.codeLabel}>Invite Code:</Text>
                <Text style={styles.codeValue}>{config.id}</Text>
              </View>
            )}
          </View>

          {/* Read-only banner */}
          {!isEditable && (
            <View style={styles.readOnlyBanner}>
              <Text style={styles.readOnlyText}>👁  View only — only the tournament owner can edit setup.</Text>
            </View>
          )}

          {/* Tab Nav */}
          <View style={styles.tabRow}>
            {(['CONFIG', 'ROSTER', 'PAIRINGS'] as SetupTab[]).map(tab => (
              <TouchableOpacity key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={activeTab === tab ? styles.tabTextActive : styles.tabText}>
                  {tab === 'CONFIG' ? '⚙️ Config' : tab === 'ROSTER' ? '👥 Roster' : '🔀 Pairings'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
            {activeTab === 'CONFIG' && <ConfigTab
              config={config}
              numRounds={numRounds}
              isEditable={isEditable}
              updateCfg={updateCfg}
              updateRound={updateRound}
            />}
            {activeTab === 'ROSTER' && <RosterTab
              config={config}
              players={players}
              isEditable={isEditable}
              teamCount={teamCount}
              setTeamCount={setTeamCount}
              playersPerTeam={playersPerTeam}
              setPlayersPerTeam={setPlayersPerTeam}
              onGenerate={generateSkeleton}
              onUpdateTeam={updatePlayerTeam}
              onUpdateHC={updatePlayerHandicap}
              onRemove={removePlayer}
            />}
            {activeTab === 'PAIRINGS' && <PairingsTab
              config={config}
              isEditable={isEditable}
              onAutoPair={handleAutoPair}
              onSavePairings={savePairings}
              saving={saving}
            />}
          </ScrollView>

          {/* Save button */}
          {isEditable && (
            <View style={styles.saveBarContainer}>
              <TouchableOpacity style={[styles.saveBar, saving && styles.saveBarDisabled]} onPress={handleSaveAll} disabled={saving}>
                <Text style={styles.saveBarText}>{saving ? 'Saving…' : '💾  Save All Changes'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function ConfigTab({ config, numRounds, isEditable, updateCfg, updateRound }: any) {
  return (
    <View>
      <Text style={styles.stepLabel}>ROUNDS</Text>
      <View style={styles.segControl}>
        {[1, 2, 3, 4].map(n => (
          <TouchableOpacity key={n} disabled={!isEditable}
            onPress={() => updateCfg('rounds', n)}
            style={[styles.segBtn, numRounds === n && styles.segBtnActive]}
          >
            <Text style={numRounds === n ? styles.segBtnTextActive : styles.segBtnText}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {Array.from({ length: numRounds }).map((_, rIdx) => (
        <View key={rIdx} style={styles.card}>
          <Text style={styles.cardTitle}>ROUND {rIdx + 1}</Text>

          <Text style={styles.subLabel}>Course</Text>
          <View style={styles.segControl}>
            {['SOUTH', 'NORTH'].map(c => (
              <TouchableOpacity key={c} disabled={!isEditable}
                onPress={() => updateRound(rIdx, 'course', c)}
                style={[styles.segBtn, config?.roundsData?.[rIdx]?.course === c && styles.segBtnActive]}
              >
                <Text style={config?.roundsData?.[rIdx]?.course === c ? styles.segBtnTextActive : styles.segBtnText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.subLabel}>Format per Segment</Text>
          <View style={styles.formatRow}>
            {(['Front 9', 'Back 9'] as const).map((side, sIdx) => (
              <View key={side} style={{ flex: 1, marginHorizontal: 4 }}>
                <Text style={styles.miniLabel}>{side}</Text>
                <View style={styles.formatGrid}>
                  {FORMAT_OPTIONS.map(({ label, value }) => {
                    const active = config?.roundsData?.[rIdx]?.formats?.[sIdx] === value;
                    return (
                      <TouchableOpacity key={value} disabled={!isEditable}
                        onPress={() => {
                          const fmts = [...(config?.roundsData?.[rIdx]?.formats ?? ['TOTALS', 'TOTALS'])];
                          fmts[sIdx] = value;
                          updateRound(rIdx, 'formats', fmts);
                        }}
                        style={[styles.miniBtn, active && styles.segBtnActive]}
                      >
                        <Text style={[styles.miniBtnText, active && { color: '#fff' }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.stepLabel}>SCORING</Text>
      <View style={styles.card}>
        <SettingRow label="Matchplay (Head-to-Head)" isEditable={isEditable}>
          <Switch disabled={!isEditable} value={config?.isMatchplay ?? true}
            onValueChange={v => updateCfg('isMatchplay', v)}
            trackColor={{ false: '#cbd5e1', true: '#1e3a8a' }} />
        </SettingRow>
        <SettingRow label="Handicaps Enabled" isEditable={isEditable}>
          <Switch disabled={!isEditable} value={config?.isHandicapEnabled ?? true}
            onValueChange={v => updateCfg('isHandicapEnabled', v)}
            trackColor={{ false: '#cbd5e1', true: '#1e3a8a' }} />
        </SettingRow>

        <View style={styles.pointsGrid}>
          {[
            { label: 'PTS/HOLE WIN', key: 'pointsPerHole', def: 1 },
            { label: 'PTS/HOLE PUSH', key: 'pointsPerHolePush', def: 0 },
          ].map(({ label, key, def }) => (
            <View key={key} style={styles.pointCol}>
              <Text style={styles.miniLabel}>{label}</Text>
              <TextInput style={[styles.smallInput, !isEditable && { opacity: 0.5 }]}
                editable={isEditable} keyboardType="numeric" returnKeyType="done"
                defaultValue={String((config as any)?.[key] ?? def)}
                onChangeText={v => updateCfg(key, parseFloat(v) || 0)} />
            </View>
          ))}
        </View>
        <View style={[styles.pointsGrid, styles.pointsGridTop]}>
          {[
            { label: 'PTS/SEG WIN', key: 'pointsPerSegment', def: 2 },
            { label: 'PTS/SEG PUSH', key: 'pointsPerSegmentPush', def: 1 },
          ].map(({ label, key, def }) => (
            <View key={key} style={styles.pointCol}>
              <Text style={styles.miniLabel}>{label}</Text>
              <TextInput style={[styles.smallInput, !isEditable && { opacity: 0.5 }]}
                editable={isEditable} keyboardType="numeric" returnKeyType="done"
                defaultValue={String((config as any)?.[key] ?? def)}
                onChangeText={v => updateCfg(key, parseFloat(v) || 0)} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Roster Tab ───────────────────────────────────────────────────────────────

function RosterTab({ config, players, isEditable, teamCount, setTeamCount, playersPerTeam, setPlayersPerTeam, onGenerate, onUpdateTeam, onUpdateHC, onRemove }: any) {
  const numTeams = Math.min(parseInt(teamCount) || 2, 4);

  // Group by team for cleaner display
  const byTeam: Record<string, Player[]> = {};
  players.forEach((p: Player) => {
    const key = p.team ?? 'UNASSIGNED';
    if (!byTeam[key]) byTeam[key] = [];
    byTeam[key].push(p);
  });

  // Handicap totals per team
  const teamStats = Object.entries(byTeam).map(([team, ps]) => ({
    team,
    count: ps.length,
    avgHC: ps.length > 0 ? (ps.reduce((s, p) => s + p.hc, 0) / ps.length).toFixed(1) : '—',
    totalHC: ps.reduce((s, p) => s + p.hc, 0).toFixed(1),
  }));

  return (
    <View>
      {isEditable && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>BUILD SKELETON</Text>
          <View style={styles.skeletonRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}># TEAMS (max 4)</Text>
              <TextInput style={styles.smallInput} value={teamCount}
                onChangeText={setTeamCount} keyboardType="numeric" returnKeyType="done" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.miniLabel}>PLAYERS / TEAM</Text>
              <TextInput style={styles.smallInput} value={playersPerTeam}
                onChangeText={setPlayersPerTeam} keyboardType="numeric" returnKeyType="done" />
            </View>
          </View>
          <TouchableOpacity style={styles.buildBtn} onPress={onGenerate}>
            <Text style={styles.buildBtnText}>Build / Update Roster Skeleton</Text>
          </TouchableOpacity>
          <Text style={styles.skeletonNote}>
            ✓ Existing real players are preserved. Only missing slots are added.
          </Text>
        </View>
      )}

      {/* Team summary cards */}
      <View style={styles.teamSummaryRow}>
        {teamStats.filter(t => t.team !== 'UNASSIGNED').map(t => (
          <View key={t.team} style={[styles.teamSummaryCard, { borderTopColor: TEAM_COLORS[t.team] ?? '#64748b' }]}>
            <Text style={[styles.teamSummaryLabel, { color: TEAM_COLORS[t.team] }]}>Team {t.team}</Text>
            <Text style={styles.teamSummaryCount}>{t.count} players</Text>
            <Text style={styles.teamSummaryHC}>Avg HC: {t.avgHC}</Text>
          </View>
        ))}
      </View>

      {/* Player list */}
      {players.map((player: Player) => (
        <View key={player.id} style={[styles.playerCard, player.isPlaceholder && styles.playerCardPlaceholder]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {player.isPlaceholder && <Text style={styles.pendingTag}>OPEN SLOT  </Text>}
              <Text style={[styles.playerName, player.isPlaceholder && { color: '#94a3b8', fontStyle: 'italic' }]}>
                {player.name}
              </Text>
            </View>
            {isEditable && (
              <View style={styles.playerHCRow}>
                <Text style={styles.playerHCLabel}>HC:</Text>
                <TextInput
                  style={styles.playerHCInput}
                  keyboardType="numeric"
                  returnKeyType="done"
                  defaultValue={String(player.hc)}
                  onChangeText={v => onUpdateHC(player.id, parseFloat(v) || 0)}
                />
              </View>
            )}
            {!isEditable && <Text style={styles.playerHCLabel}>HC {player.hc}</Text>}
          </View>

          {/* Team picker */}
          <View style={styles.teamPicker}>
            {Array.from({ length: numTeams }).map((_, tIdx) => {
              const team = teamLabel(tIdx);
              const isActive = player.team === team;
              return (
                <TouchableOpacity key={team} disabled={!isEditable}
                  onPress={() => onUpdateTeam(player.id, team)}
                  style={[styles.teamBtn, isActive && { backgroundColor: TEAM_COLORS[team] ?? '#64748b' }]}
                >
                  <Text style={[styles.teamBtnText, isActive && { color: '#fff' }]}>{team}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Remove placeholder */}
          {isEditable && player.isPlaceholder && (
            <TouchableOpacity onPress={() => onRemove(player.id)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {players.length === 0 && (
        <View style={styles.emptyRoster}>
          <Text style={styles.emptyRosterText}>
            No players yet. Use "Build Skeleton" to create slots, then share your invite code {config?.id} for players to join.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Pairings Tab ─────────────────────────────────────────────────────────────
// Note: This tab shows matchup assignments. It lives in Setup but players see
// a read-only version on the Leaderboard tab (explore.tsx) for easy reference.

function PairingsTab({ config, isEditable, onAutoPair, onSavePairings, saving }: any) {
  const [localPairings, setLocalPairings] = useState<Pairing[]>(config?.pairings ?? []);

  const teamA = (config?.players ?? []).filter((p: Player) => p.team === 'A' && !p.isPlaceholder);
  const teamB = (config?.players ?? []).filter((p: Player) => p.team === 'B' && !p.isPlaceholder);

  const getPlayerName = (id: string) =>
    config?.players.find((p: Player) => p.id === id)?.name ?? id.substring(0, 8);

  const pairingsForRound = (r: number, s: number) =>
    localPairings.filter(p => p.roundIndex === r && p.segmentIndex === s);

  const totalRounds = config?.rounds ?? 1;

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>MATCHUP PAIRINGS</Text>
        <Text style={styles.pairingsNote}>
          Pairings determine who each player sees on their scorecard and who they compete against each segment.
          Auto-pair balances teams by handicap (lowest vs lowest, etc.).
        </Text>

        {isEditable && (
          <TouchableOpacity style={styles.autoPairBtn} onPress={onAutoPair} disabled={saving}>
            <Text style={styles.autoPairBtnText}>
              {saving ? 'Saving…' : '⚡ Auto-Pair by Handicap'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {Array.from({ length: totalRounds }).map((_, rIdx) => (
        <View key={rIdx} style={styles.card}>
          <Text style={styles.cardTitle}>ROUND {rIdx + 1} PAIRINGS</Text>
          {([0, 1] as const).map(sIdx => {
            const format = config?.roundsData?.[rIdx]?.formats?.[sIdx] ?? '—';
            const pairs = pairingsForRound(rIdx, sIdx);
            return (
              <View key={sIdx} style={styles.segmentPairBlock}>
                <Text style={styles.segmentPairLabel}>
                  {sIdx === 0 ? 'Front 9' : 'Back 9'} · {format}
                </Text>
                {pairs.length === 0 ? (
                  <Text style={styles.noPairingsText}>No pairings set yet.</Text>
                ) : (
                  pairs.map((pair, pIdx) => (
                    <View key={pair.id} style={styles.pairingRow}>
                      <View style={styles.pairingTeam}>
                        <View style={[styles.pairingTeamDot, { backgroundColor: '#1e3a8a' }]} />
                        <Text style={styles.pairingTeamText}>
                          {pair.teamAPlayers.map(getPlayerName).join(' & ')}
                        </Text>
                      </View>
                      <Text style={styles.pairingVs}>vs</Text>
                      <View style={styles.pairingTeam}>
                        <View style={[styles.pairingTeamDot, { backgroundColor: '#dc2626' }]} />
                        <Text style={styles.pairingTeamText}>
                          {pair.teamBPlayers.map(getPlayerName).join(' & ')}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* Manual assignment: drag each player into pairings */}
      {isEditable && (teamA.length > 0 || teamB.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>AVAILABLE PLAYERS</Text>
          <Text style={styles.pairingsNote}>
            Run Auto-Pair above or manually build pairings (manual builder coming in next update).
          </Text>
          <View style={styles.availableRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniLabel, { color: '#1e3a8a' }]}>TEAM A</Text>
              {teamA.map((p: Player) => (
                <View key={p.id} style={styles.availablePlayer}>
                  <Text style={styles.availablePlayerName}>{p.name}</Text>
                  <Text style={styles.availablePlayerHC}>HC {p.hc}</Text>
                </View>
              ))}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.miniLabel, { color: '#dc2626' }]}>TEAM B</Text>
              {teamB.map((p: Player) => (
                <View key={p.id} style={styles.availablePlayer}>
                  <Text style={styles.availablePlayerName}>{p.name}</Text>
                  <Text style={styles.availablePlayerHC}>HC {p.hc}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SettingRow({ label, children, isEditable }: any) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingText}>{label}</Text>
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#1e293b' },
  codeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  codeLabel: { fontSize: 12, color: '#64748b', marginRight: 6 },
  codeValue: { fontSize: 14, fontWeight: '900', color: '#1e3a8a', letterSpacing: 2, backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },

  readOnlyBanner: { backgroundColor: '#fef9c3', padding: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#fde68a' },
  readOnlyText: { fontSize: 13, color: '#92400e', fontWeight: '600' },

  tabRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1e3a8a' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { fontSize: 12, fontWeight: '800', color: '#1e3a8a' },

  content: { padding: 16, paddingBottom: 100 },
  stepLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  subLabel: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8', marginTop: 12, marginBottom: 5, textTransform: 'uppercase' },
  miniLabel: { fontSize: 9, fontWeight: 'bold', color: '#94a3b8', marginBottom: 5 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 12, fontWeight: '900', color: '#1e3a8a', letterSpacing: 1, marginBottom: 10 },

  segControl: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segBtnActive: { backgroundColor: '#1e3a8a' },
  segBtnText: { color: '#64748b', fontWeight: '600' },
  segBtnTextActive: { color: '#fff', fontWeight: '800' },

  formatRow: { flexDirection: 'row' },
  formatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  miniBtn: { flex: 1, minWidth: '45%', paddingVertical: 7, backgroundColor: '#f1f5f9', borderRadius: 6, alignItems: 'center', marginBottom: 4 },
  miniBtnText: { fontSize: 10, fontWeight: '800', color: '#64748b' },

  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  settingText: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  pointsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  pointsGridTop: { borderTopWidth: 1, borderColor: '#f1f5f9', paddingTop: 12, marginTop: 6 },
  pointCol: { flex: 1, alignItems: 'center' },
  smallInput: { backgroundColor: '#f1f5f9', width: 62, padding: 8, borderRadius: 8, textAlign: 'center', fontWeight: '900', color: '#1e3a8a', fontSize: 16 },

  // Roster tab
  skeletonRow: { flexDirection: 'row', marginBottom: 12 },
  buildBtn: { backgroundColor: '#1e3a8a', padding: 14, borderRadius: 12, alignItems: 'center' },
  buildBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  skeletonNote: { fontSize: 11, color: '#64748b', marginTop: 8, textAlign: 'center', fontStyle: 'italic' },

  teamSummaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  teamSummaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderTopWidth: 3, borderWidth: 1, borderColor: '#e2e8f0' },
  teamSummaryLabel: { fontSize: 14, fontWeight: '900' },
  teamSummaryCount: { fontSize: 12, color: '#64748b', marginTop: 2 },
  teamSummaryHC: { fontSize: 11, color: '#94a3b8', marginTop: 1 },

  playerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 13, borderRadius: 13, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  playerCardPlaceholder: { borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  pendingTag: { fontSize: 8, fontWeight: '900', color: '#d97706', backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  playerName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  playerHCRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  playerHCLabel: { fontSize: 11, color: '#94a3b8', marginRight: 4 },
  playerHCInput: { fontSize: 13, color: '#1e3a8a', fontWeight: '800', width: 44, borderBottomWidth: 1, borderColor: '#e2e8f0', textAlign: 'center' },
  teamPicker: { flexDirection: 'row', gap: 5, marginLeft: 8 },
  teamBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  teamBtnText: { fontSize: 11, fontWeight: '900', color: '#64748b' },
  removeBtn: { marginLeft: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 11, color: '#dc2626', fontWeight: '900' },

  emptyRoster: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', alignItems: 'center', marginTop: 8 },
  emptyRosterText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },

  // Pairings tab
  pairingsNote: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 12 },
  autoPairBtn: { backgroundColor: '#1e3a8a', padding: 14, borderRadius: 12, alignItems: 'center' },
  autoPairBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  segmentPairBlock: { borderTopWidth: 1, borderColor: '#f1f5f9', paddingTop: 10, marginTop: 8 },
  segmentPairLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1, marginBottom: 8 },
  noPairingsText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', paddingBottom: 8 },
  pairingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 10, padding: 10, marginBottom: 8 },
  pairingTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pairingTeamDot: { width: 8, height: 8, borderRadius: 4 },
  pairingTeamText: { fontSize: 13, fontWeight: '700', color: '#1e293b', flex: 1 },
  pairingVs: { fontSize: 11, fontWeight: '900', color: '#94a3b8', marginHorizontal: 8 },
  availableRow: { flexDirection: 'row', marginTop: 4 },
  availablePlayer: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  availablePlayerName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  availablePlayerHC: { fontSize: 12, color: '#64748b' },

  saveBarContainer: { padding: 16, paddingBottom: 32, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e2e8f0' },
  saveBar: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBarDisabled: { opacity: 0.6 },
  saveBarText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});