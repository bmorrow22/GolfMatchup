import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import {
  FormatType,
  Pairing,
  Player,
  TeamId,
  TournamentConfig,
  useTournament,
} from '../../store/TournamentContext';

const TEAM_COLORS: Record<string, string> = {
  A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309',
};
const teamLabel = (i: number): TeamId => String.fromCharCode(65 + i) as TeamId;

const FORMAT_OPTIONS: { label: string; value: FormatType }[] = [
  { label: 'TOT', value: 'TOTALS'   },
  { label: 'SCR', value: 'SCRAMBLE' },
  { label: 'ALT', value: 'ALT-SHOT' },
  { label: 'SIN', value: 'SINGLES'  },
];

function autoPairSegment(
  teamA: Player[], teamB: Player[],
  rIdx: number, sIdx: number, format: FormatType
): Pairing[] {
  const sortedA = [...teamA].sort((a, b) => a.hc - b.hc);
  const sortedB = [...teamB].sort((a, b) => a.hc - b.hc);
  if (format === 'TOTALS' || format === 'SCRAMBLE') {
    return [{
      id: `auto-${rIdx}-${sIdx}`,
      roundIndex: rIdx, segmentIndex: sIdx,
      teamAPlayers: sortedA.map(p => p.id),
      teamBPlayers: sortedB.map(p => p.id),
    }];
  }
  const count = Math.min(sortedA.length, sortedB.length);
  return Array.from({ length: count }, (_, i) => ({
    id: `auto-${rIdx}-${sIdx}-${i}`,
    roundIndex: rIdx, segmentIndex: sIdx,
    teamAPlayers: [sortedA[i].id],
    teamBPlayers: [sortedB[i].id],
  }));
}

type SetupTab = 'CONFIG' | 'ROSTER' | 'PAIRINGS';

export default function SetupScreen() {
  const {
    config, setConfig,
    updatePlayerTeam, updatePlayerHandicap, removePlayer,
    addPlaceholders,
    userRole, savePairings,
  } = useTournament();

  const [activeTab, setActiveTab] = useState<SetupTab>('CONFIG');
  const [teamCount, setTeamCount] = useState('2');
  const [playersPerTeam, setPlayersPerTeam] = useState('2');
  const [saving, setSaving] = useState(false);
  const [buildingRoster, setBuildingRoster] = useState(false);

  const isEditable = userRole === 'OWNER' || userRole === 'ADMIN';

  // FIX: updateCfg calls setConfig (async). Calling it twice back-to-back in
  // the same render cycle means the second call reads stale state and overwrites
  // the first update. Always batch multiple field changes into one setConfig call.
  const updateCfg = (updates: Partial<TournamentConfig>) => {
    if (!isEditable || !config) return;
    setConfig({ ...config, ...updates } as TournamentConfig);
  };

  const updateRound = (rIdx: number, key: string, val: any) => {
    if (!config) return;
    const rounds = [...(config.roundsData ?? [])];
    while (rounds.length <= rIdx) rounds.push({ course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] });
    rounds[rIdx] = { ...rounds[rIdx], [key]: val };
    updateCfg({ roundsData: rounds });
  };

  // FIX: Rounds selector was broken because it called updateCfg('rounds', n)
  // then updateCfg('roundsData', ...) — two separate async setConfig calls.
  // Now we batch both fields in one call.
  const handleRoundsChange = (n: number) => {
    if (!config) return;
    const rd = [...(config.roundsData ?? [])];
    while (rd.length < n) rd.push({ course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] });
    // Batch: update both rounds count AND roundsData in a single setConfig call
    updateCfg({ rounds: n, roundsData: rd.slice(0, n) });
  };

  const handleBuildSkeleton = async () => {
    if (!isEditable || !config) return;
    const tc = Math.min(parseInt(teamCount) || 2, 4);
    const pc = parseInt(playersPerTeam) || 2;
    setBuildingRoster(true);
    try {
      await addPlaceholders(tc, pc);
      Alert.alert('Done ✓', 'Roster slots added with real database IDs.');
    } finally {
      setBuildingRoster(false);
    }
  };

  const handleAutoPair = async () => {
    if (!config) return;
    const teamA = config.players.filter(p => p.team === 'A' && !p.isPlaceholder);
    const teamB = config.players.filter(p => p.team === 'B' && !p.isPlaceholder);
    if (teamA.length === 0 || teamB.length === 0) {
      Alert.alert('Not Ready', 'Assign real players to Team A and Team B first.');
      return;
    }
    const all: Pairing[] = [];
    for (let r = 0; r < config.rounds; r++) {
      for (let s = 0; s < 2; s++) {
        const fmt = config.roundsData?.[r]?.formats?.[s] ?? 'TOTALS';
        all.push(...autoPairSegment(teamA, teamB, r, s, fmt));
      }
    }
    setSaving(true);
    await savePairings(all);
    setSaving(false);
    Alert.alert('Pairings Set ✓', `${all.length} pairing(s) saved.`);
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    await setConfig(config);
    setSaving(false);
    Alert.alert('Saved ✓', 'Tournament config saved to Supabase.');
  };

  const players = config?.players ?? [];
  const numRounds = config?.rounds ?? 1;
  const numTeams = Math.min(parseInt(teamCount) || 2, 4);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Tournament Builder</Text>
            {config && (
              <View style={styles.codeRow}>
                <Text style={styles.codeLabel}>Code:</Text>
                <Text style={styles.codeValue}>{config.id}</Text>
                <View style={[styles.statusPill, config.status === 'ACTIVE' && styles.statusPillActive]}>
                  <Text style={styles.statusPillText}>{config.status}</Text>
                </View>
              </View>
            )}
          </View>

          {!isEditable && (
            <View style={styles.readOnlyBanner}>
              <Text style={styles.readOnlyText}>👁  View only — only the owner can edit setup.</Text>
            </View>
          )}

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

            {/* ─── CONFIG TAB ─────────────────────────────────────────────────── */}
            {activeTab === 'CONFIG' && (
              <View>
                <SectionLabel text="ROUNDS" />
                {/* FIX: handleRoundsChange batches rounds + roundsData in one call */}
                <SegControl
                  options={['1','2','3','4']}
                  active={String(numRounds)}
                  onSelect={v => handleRoundsChange(parseInt(v))}
                  disabled={!isEditable}
                />

                {Array.from({ length: numRounds }).map((_, rIdx) => (
                  <View key={rIdx} style={styles.card}>
                    <Text style={styles.cardTitle}>ROUND {rIdx + 1}</Text>

                    <MiniLabel text="COURSE" />
                    <SegControl
                      options={['SOUTH', 'NORTH']}
                      active={config?.roundsData?.[rIdx]?.course ?? 'SOUTH'}
                      onSelect={v => updateRound(rIdx, 'course', v)}
                      disabled={!isEditable}
                    />

                    <MiniLabel text="FORMAT PER SEGMENT" />
                    <View style={styles.formatRow}>
                      {(['Front 9', 'Back 9'] as const).map((side, sIdx) => (
                        <View key={side} style={{ flex: 1, marginHorizontal: 4 }}>
                          <Text style={[styles.miniLabel, { marginBottom: 4 }]}>{side}</Text>
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
                                  style={[styles.miniBtn, active && styles.miniBtnActive]}
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

                <SectionLabel text="SCORING" />
                <View style={styles.card}>
                  {[
                    { label: 'Matchplay', key: 'isMatchplay' },
                    { label: 'Handicaps Enabled', key: 'isHandicapEnabled' },
                  ].map(({ label, key }) => (
                    <View key={key} style={styles.settingRow}>
                      <Text style={styles.settingText}>{label}</Text>
                      <Switch disabled={!isEditable}
                        value={(config as any)?.[key] ?? true}
                        onValueChange={v => updateCfg({ [key]: v })}
                        trackColor={{ false: '#cbd5e1', true: '#1e3a8a' }}
                      />
                    </View>
                  ))}
                  <View style={styles.pointsGrid}>
                    {[
                      { label: 'PTS/HOLE WIN', key: 'pointsPerHole', def: 1 },
                      { label: 'PTS/HOLE PUSH', key: 'pointsPerHolePush', def: 0 },
                    ].map(({ label, key, def }) => (
                      <View key={key} style={styles.pointCol}>
                        <Text style={styles.miniLabel}>{label}</Text>
                        <TextInput editable={isEditable} keyboardType="numeric" returnKeyType="done"
                          style={[styles.smallInput, !isEditable && { opacity: 0.5 }]}
                          defaultValue={String((config as any)?.[key] ?? def)}
                          onChangeText={v => updateCfg({ [key]: parseFloat(v) || 0 })} />
                      </View>
                    ))}
                  </View>
                  <View style={[styles.pointsGrid, { borderTopWidth: 1, borderColor: '#f1f5f9', paddingTop: 12, marginTop: 8 }]}>
                    {[
                      { label: 'PTS/SEG WIN', key: 'pointsPerSegment', def: 2 },
                      { label: 'PTS/SEG PUSH', key: 'pointsPerSegmentPush', def: 1 },
                    ].map(({ label, key, def }) => (
                      <View key={key} style={styles.pointCol}>
                        <Text style={styles.miniLabel}>{label}</Text>
                        <TextInput editable={isEditable} keyboardType="numeric" returnKeyType="done"
                          style={[styles.smallInput, !isEditable && { opacity: 0.5 }]}
                          defaultValue={String((config as any)?.[key] ?? def)}
                          onChangeText={v => updateCfg({ [key]: parseFloat(v) || 0 })} />
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* ─── ROSTER TAB ─────────────────────────────────────────────────── */}
            {activeTab === 'ROSTER' && (
              <View>
                {isEditable && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>BUILD SKELETON</Text>
                    <View style={styles.skeletonInputRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}># TEAMS (max 4)</Text>
                        <TextInput style={styles.smallInput} value={teamCount}
                          onChangeText={setTeamCount} keyboardType="numeric" returnKeyType="done" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={styles.miniLabel}>PLAYERS / TEAM</Text>
                        <TextInput style={styles.smallInput} value={playersPerTeam}
                          onChangeText={setPlayersPerTeam} keyboardType="numeric" returnKeyType="done" />
                      </View>
                    </View>
                    <TouchableOpacity style={[styles.primaryBtn, buildingRoster && styles.disabled]}
                      onPress={handleBuildSkeleton} disabled={buildingRoster}>
                      {buildingRoster
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryBtnText}>Build / Update Roster Skeleton</Text>
                      }
                    </TouchableOpacity>
                    <Text style={styles.note}>
                      ✓ Real players are preserved — only missing slots are added.
                    </Text>
                  </View>
                )}

                {(['A','B','C','D'] as const)
                  .filter(t => players.some(p => p.team === t))
                  .map(t => {
                    const tp = players.filter(p => p.team === t);
                    const avg = tp.length > 0
                      ? (tp.reduce((s, p) => s + p.hc, 0) / tp.length).toFixed(1)
                      : '—';
                    return (
                      <View key={t} style={[styles.teamBar, { borderLeftColor: TEAM_COLORS[t] }]}>
                        <Text style={[styles.teamBarName, { color: TEAM_COLORS[t] }]}>Team {t}</Text>
                        <Text style={styles.teamBarStat}>{tp.length} players · Avg HC {avg}</Text>
                      </View>
                    );
                  })}

                {players.map((player: Player) => (
                  <View key={player.id}
                    style={[styles.playerCard, player.isPlaceholder && styles.playerCardPH]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {player.isPlaceholder && (
                          <View style={styles.openTag}><Text style={styles.openTagText}>OPEN SLOT</Text></View>
                        )}
                        <Text style={[styles.playerName, player.isPlaceholder && styles.playerNamePH]}
                          numberOfLines={1}>
                          {player.name}
                        </Text>
                      </View>
                      {isEditable ? (
                        <View style={styles.hcRow}>
                          <Text style={styles.hcLabel}>HC</Text>
                          <TextInput style={styles.hcInput}
                            keyboardType="numeric" returnKeyType="done"
                            defaultValue={String(player.hc)}
                            onChangeText={v => updatePlayerHandicap(player.id, parseFloat(v) || 0)} />
                        </View>
                      ) : (
                        <Text style={styles.hcLabel}>HC {player.hc}</Text>
                      )}
                    </View>

                    <View style={styles.teamPicker}>
                      {Array.from({ length: numTeams }).map((_, tIdx) => {
                        const team = teamLabel(tIdx);
                        const active = player.team === team;
                        return (
                          <TouchableOpacity key={team} disabled={!isEditable}
                            onPress={() => updatePlayerTeam(player.id, team)}
                            style={[styles.teamBtn, active && { backgroundColor: TEAM_COLORS[team] }]}
                          >
                            <Text style={[styles.teamBtnText, active && { color: '#fff' }]}>{team}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {isEditable && (
                      <TouchableOpacity onPress={() => removePlayer(player.id)} style={styles.removeBtn}>
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {players.length === 0 && (
                  <View style={styles.emptyRoster}>
                    <Text style={styles.emptyRosterText}>
                      No players yet. Build a skeleton above, then share code{' '}
                      <Text style={{ fontWeight: '900', color: '#1e3a8a' }}>{config?.id}</Text>.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ─── PAIRINGS TAB ────────────────────────────────────────────────── */}
            {activeTab === 'PAIRINGS' && config && (
              <PairingsTab
                config={config}
                isEditable={isEditable}
                onAutoPair={handleAutoPair}
                onSavePairings={savePairings}
                saving={saving}
              />
            )}
          </ScrollView>

          {isEditable && activeTab === 'CONFIG' && (
            <View style={styles.saveBar}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.disabled]}
                onPress={handleSaveConfig} disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>💾  Save Config</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// ─── Pairings Tab ─────────────────────────────────────────────────────────────

function PairingsTab({ config, isEditable, onAutoPair, onSavePairings, saving }: {
  config: TournamentConfig;
  isEditable: boolean;
  onAutoPair: () => void;
  onSavePairings: (p: Pairing[]) => Promise<void>;
  saving: boolean;
}) {
  const [localPairings, setLocalPairings] = useState<Pairing[]>(config.pairings ?? []);
  const [activeRound, setActiveRound] = useState(0);
  const [activeSeg, setActiveSeg] = useState(0);
  const [selectedA, setSelectedA] = useState<string[]>([]);
  const [selectedB, setSelectedB] = useState<string[]>([]);
  const [savingLocal, setSavingLocal] = useState(false);

  const teamA = config.players.filter(p => p.team === 'A' && !p.isPlaceholder);
  const teamB = config.players.filter(p => p.team === 'B' && !p.isPlaceholder);
  const getName = (id: string) => config.players.find(p => p.id === id)?.name ?? '?';
  const curPairings = localPairings.filter(p => p.roundIndex === activeRound && p.segmentIndex === activeSeg);
  const format = config.roundsData?.[activeRound]?.formats?.[activeSeg] ?? 'TOTALS';

  const toggleA = (id: string) =>
    setSelectedA(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleB = (id: string) =>
    setSelectedB(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const addPairing = () => {
    if (!selectedA.length || !selectedB.length) {
      Alert.alert('Select Players', 'Pick at least one player from each team.');
      return;
    }
    const newP: Pairing = {
      id: `manual-${Date.now()}`,
      roundIndex: activeRound, segmentIndex: activeSeg,
      teamAPlayers: [...selectedA], teamBPlayers: [...selectedB],
    };
    setLocalPairings(prev => [
      ...prev.filter(p => !(p.roundIndex === activeRound && p.segmentIndex === activeSeg)),
      newP,
    ]);
    setSelectedA([]); setSelectedB([]);
  };

  const removePairing = (id: string) => setLocalPairings(prev => prev.filter(p => p.id !== id));

  const handleSave = async () => {
    setSavingLocal(true);
    await onSavePairings(localPairings);
    setSavingLocal(false);
    Alert.alert('Saved ✓', 'Pairings saved to database.');
  };

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>MATCHUP PAIRINGS</Text>
        <Text style={styles.note}>
          Pairings control which players see each other on the scorecard. Auto-pair matches players by handicap.
        </Text>
        {isEditable && (
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.disabled]}
            onPress={onAutoPair} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>⚡ Auto-Pair by Handicap</Text>
            }
          </TouchableOpacity>
        )}
      </View>

      {config.rounds > 1 && (
        <SegControl
          options={Array.from({ length: config.rounds }, (_, i) => `R${i + 1}`)}
          active={`R${activeRound + 1}`}
          onSelect={v => setActiveRound(parseInt(v.slice(1)) - 1)}
          disabled={false}
        />
      )}
      <SegControl
        options={['Front 9', 'Back 9']}
        active={activeSeg === 0 ? 'Front 9' : 'Back 9'}
        onSelect={v => setActiveSeg(v === 'Front 9' ? 0 : 1)}
        disabled={false}
      />

      <Text style={styles.pairSegLabel}>
        R{activeRound + 1} · {activeSeg === 0 ? 'FRONT 9' : 'BACK 9'} · {format}
      </Text>

      {curPairings.length === 0
        ? <Text style={styles.noPairText}>No pairings yet for this segment.</Text>
        : curPairings.map(pair => (
            <View key={pair.id} style={styles.pairingRow}>
              <View style={styles.pairingTeam}>
                <View style={[styles.dot, { backgroundColor: '#1e3a8a' }]} />
                <Text style={styles.pairingNames} numberOfLines={1}>
                  {pair.teamAPlayers.map(getName).join(' & ')}
                </Text>
              </View>
              <Text style={styles.vsText}>vs</Text>
              <View style={styles.pairingTeam}>
                <View style={[styles.dot, { backgroundColor: '#dc2626' }]} />
                <Text style={styles.pairingNames} numberOfLines={1}>
                  {pair.teamBPlayers.map(getName).join(' & ')}
                </Text>
              </View>
              {isEditable && (
                <TouchableOpacity onPress={() => removePairing(pair.id)} style={styles.removePairBtn}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
      }

      {isEditable && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>MANUAL BUILDER</Text>
          <Text style={styles.note}>Tap players to select, then add the pairing.</Text>

          <View style={styles.manualGrid}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniLabel, { color: '#1e3a8a', marginBottom: 6 }]}>TEAM A</Text>
              {teamA.length === 0
                ? <Text style={styles.noPlayerText}>No Team A players</Text>
                : teamA.map(p => (
                  <TouchableOpacity key={p.id} onPress={() => toggleA(p.id)}
                    style={[styles.selPlayer, selectedA.includes(p.id) && styles.selPlayerA]}>
                    <Text style={[styles.selName, selectedA.includes(p.id) && { color: '#fff' }]}
                      numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.selHC, selectedA.includes(p.id) && { color: 'rgba(255,255,255,0.75)' }]}>
                      HC {p.hc}</Text>
                  </TouchableOpacity>
                ))
              }
            </View>
            <View style={{ width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniLabel, { color: '#dc2626', marginBottom: 6 }]}>TEAM B</Text>
              {teamB.length === 0
                ? <Text style={styles.noPlayerText}>No Team B players</Text>
                : teamB.map(p => (
                  <TouchableOpacity key={p.id} onPress={() => toggleB(p.id)}
                    style={[styles.selPlayer, styles.selPlayerBBase, selectedB.includes(p.id) && styles.selPlayerB]}>
                    <Text style={[styles.selName, selectedB.includes(p.id) && { color: '#fff' }]}
                      numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.selHC, selectedB.includes(p.id) && { color: 'rgba(255,255,255,0.75)' }]}>
                      HC {p.hc}</Text>
                  </TouchableOpacity>
                ))
              }
            </View>
          </View>

          <TouchableOpacity
            style={[styles.addPairBtn, (!selectedA.length || !selectedB.length) && styles.disabled]}
            onPress={addPairing} disabled={!selectedA.length || !selectedB.length}>
            <Text style={styles.addPairBtnText} numberOfLines={1}>
              + {selectedA.map(getName).join(' & ') || '—'} vs {selectedB.map(getName).join(' & ') || '—'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveManualBtn, savingLocal && styles.disabled]}
            onPress={handleSave} disabled={savingLocal}>
            {savingLocal
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>💾  Save All Pairings</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}
function MiniLabel({ text }: { text: string }) {
  return <Text style={[styles.miniLabel, { marginTop: 12, marginBottom: 4 }]}>{text}</Text>;
}
function SegControl({ options, active, onSelect, disabled }: {
  options: string[]; active: string; onSelect: (v: string) => void; disabled: boolean;
}) {
  return (
    <View style={styles.segControl}>
      {options.map(o => (
        <TouchableOpacity key={o} disabled={disabled}
          style={[styles.segBtn, active === o && styles.segBtnActive]}
          onPress={() => onSelect(o)}>
          <Text style={active === o ? styles.segBtnTextActive : styles.segBtnText}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#1e293b' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  codeLabel: { fontSize: 12, color: '#64748b' },
  codeValue: { fontSize: 13, fontWeight: '900', color: '#1e3a8a', letterSpacing: 2, backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusPill: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusPillActive: { backgroundColor: '#dcfce7' },
  statusPillText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  readOnlyBanner: { backgroundColor: '#fef9c3', padding: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#fde68a' },
  readOnlyText: { fontSize: 13, color: '#92400e', fontWeight: '600' },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: '#1e3a8a' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { fontSize: 12, fontWeight: '800', color: '#1e3a8a' },
  content: { padding: 16, paddingBottom: 120 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  miniLabel: { fontSize: 9, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 12, fontWeight: '900', color: '#1e3a8a', letterSpacing: 1, marginBottom: 8 },
  segControl: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 8 },
  segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segBtnActive: { backgroundColor: '#1e3a8a' },
  segBtnText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  segBtnTextActive: { color: '#fff', fontWeight: '800', fontSize: 13 },
  formatRow: { flexDirection: 'row' },
  formatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  miniBtn: { flex: 1, minWidth: '45%', paddingVertical: 7, backgroundColor: '#f1f5f9', borderRadius: 6, alignItems: 'center', marginBottom: 4 },
  miniBtnActive: { backgroundColor: '#1e3a8a' },
  miniBtnText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  settingText: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  pointsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  pointCol: { flex: 1, alignItems: 'center' },
  smallInput: { backgroundColor: '#f1f5f9', width: 62, padding: 8, borderRadius: 8, textAlign: 'center', fontWeight: '900', color: '#1e3a8a', fontSize: 16 },
  skeletonInputRow: { flexDirection: 'row', marginBottom: 12 },
  note: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  primaryBtn: { backgroundColor: '#1e3a8a', padding: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.5 },
  teamBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  teamBarName: { fontSize: 14, fontWeight: '900' },
  teamBarStat: { fontSize: 11, color: '#64748b' },
  playerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 13, borderRadius: 13, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  playerCardPH: { borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  openTag: { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  openTagText: { fontSize: 8, fontWeight: '900', color: '#d97706' },
  playerName: { fontSize: 15, fontWeight: '700', color: '#1e293b', flexShrink: 1 },
  playerNamePH: { color: '#94a3b8', fontStyle: 'italic' },
  hcRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  hcLabel: { fontSize: 11, color: '#94a3b8', marginRight: 4 },
  hcInput: { fontSize: 13, color: '#1e3a8a', fontWeight: '800', width: 44, borderBottomWidth: 1, borderColor: '#e2e8f0', textAlign: 'center' },
  teamPicker: { flexDirection: 'row', gap: 5, marginLeft: 8 },
  teamBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  teamBtnText: { fontSize: 11, fontWeight: '900', color: '#64748b' },
  removeBtn: { marginLeft: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 11, color: '#dc2626', fontWeight: '900' },
  emptyRoster: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', alignItems: 'center' },
  emptyRosterText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  pairSegLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  noPairText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 12 },
  pairingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  pairingTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  pairingNames: { fontSize: 13, fontWeight: '700', color: '#1e293b', flex: 1 },
  vsText: { fontSize: 11, fontWeight: '900', color: '#94a3b8', marginHorizontal: 6 },
  removePairBtn: { marginLeft: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  manualGrid: { flexDirection: 'row', marginBottom: 12 },
  selPlayer: { padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  selPlayerBBase: { backgroundColor: '#fff1f2', borderColor: '#fecaca' },
  selPlayerA: { backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' },
  selPlayerB: { backgroundColor: '#b91c1c', borderColor: '#b91c1c' },
  selName: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  selHC: { fontSize: 10, color: '#64748b', marginTop: 2 },
  noPlayerText: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: 8 },
  addPairBtn: { backgroundColor: '#1e3a8a', padding: 13, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  addPairBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  saveManualBtn: { backgroundColor: '#16a34a', padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBar: { padding: 16, paddingBottom: 36, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e2e8f0' },
  saveBtn: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});