import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import { PlayerAvatar } from '../../components/Playeravatar';
import {
  FormatType, Pairing, Player, TeamId, TournamentConfig, useTournament,
} from '../../store/TournamentContext';

const TEAM_COLORS: Record<string, string> = {
  A: '#1e3a8a', B: '#b91c1c', C: '#15803d', D: '#b45309',
};
const ALL_TEAM_IDS: TeamId[] = ['A', 'B', 'C', 'D'];
const teamLabel = (i: number): TeamId => String.fromCharCode(65 + i) as TeamId;

const FORMAT_OPTIONS: { label: string; value: FormatType }[] = [
  { label: 'TOT', value: 'TOTALS'   },
  { label: 'SCR', value: 'SCRAMBLE' },
  { label: 'ALT', value: 'ALT-SHOT' },
  { label: 'SIN', value: 'SINGLES'  },
];

type SetupTab = 'CONFIG' | 'ROSTER' | 'PAIRINGS';

export default function SetupScreen() {
  const {
    config, setConfig,
    updatePlayerTeam, updatePlayerHandicap, removePlayer, updateTeamName,
    autoBalanceRoster, userRole, savePairings, refreshTournament,
  } = useTournament();

  const [activeTab, setActiveTab]           = useState<SetupTab>('CONFIG');
  const [teamCount, setTeamCount]           = useState('2');
  const [playersPerTeam, setPlayersPerTeam] = useState('4');
  const [saving, setSaving]                 = useState(false);
  const [balancing, setBalancing]           = useState(false);

  const isEditable = userRole === 'OWNER' || userRole === 'ADMIN';
  const players    = config?.players ?? [];
  const numRounds  = config?.rounds ?? 1;
  const numTeams   = Math.min(parseInt(teamCount) || 2, 4);

  // Sync teamCount with actual teams used in config
  useEffect(() => {
    if (!config) return;
    const teamsUsed = new Set(config.players.filter(p => p.team !== 'UNASSIGNED').map(p => p.team));
    if (teamsUsed.size > 0) setTeamCount(String(teamsUsed.size));
  }, [config?.id]);

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

  const handleRoundsChange = (n: number) => {
    if (!config) return;
    const rd = [...(config.roundsData ?? [])];
    while (rd.length < n) rd.push({ course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] });
    updateCfg({ rounds: n, roundsData: rd.slice(0, n) });
  };

  const handleAutoBalance = async () => {
    if (!isEditable || !config) return;
    const tc = Math.min(parseInt(teamCount) || 2, 4);
    const pc = parseInt(playersPerTeam) || 4;
    setBalancing(true);
    try {
      await autoBalanceRoster(tc, pc);
      await refreshTournament();
      Alert.alert('Done ✓', `Roster balanced: ${tc} teams × ${pc} players.\nUnassigned players were snake-drafted by handicap.`);
    } finally {
      setBalancing(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    await setConfig(config);
    setSaving(false);
    Alert.alert('Saved ✓', 'Tournament config saved.');
  };

  if (!config) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No Active Tournament</Text>
        <Text style={styles.emptyText}>Open a tournament from the Home tab first.</Text>
      </View>
    );
  }

  const getTeamDisplayName = (id: TeamId) => config.teamNames?.[id] ?? `Team ${id}`;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: '#f0f4f8' }}>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>{config.name ?? 'Tournament Setup'}</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeLabel}>Code:</Text>
              <Text style={styles.codeValue}>{config.id}</Text>
              <View style={[styles.statusPill, config.status === 'ACTIVE' && styles.statusPillActive]}>
                <Text style={styles.statusPillText}>{config.status}</Text>
              </View>
            </View>
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

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {/* ── CONFIG TAB ─────────────────────────────────── */}
            {activeTab === 'CONFIG' && (
              <View>
                <SectionLabel text="ROUNDS" />
                <SegControl
                  options={['1','2','3','4']} active={String(numRounds)}
                  onSelect={v => handleRoundsChange(parseInt(v))} disabled={!isEditable}
                />

                {Array.from({ length: numRounds }).map((_, rIdx) => (
                  <View key={rIdx} style={styles.card}>
                    <Text style={styles.cardTitle}>ROUND {rIdx + 1}</Text>
                    <MiniLabel text="COURSE" />
                    <SegControl
                      options={['SOUTH', 'NORTH']}
                      active={config.roundsData?.[rIdx]?.course ?? 'SOUTH'}
                      onSelect={v => updateRound(rIdx, 'course', v)} disabled={!isEditable}
                    />
                    <MiniLabel text="FORMAT PER SEGMENT" />
                    <View style={styles.formatRow}>
                      {(['Front 9', 'Back 9'] as const).map((side, sIdx) => (
                        <View key={side} style={{ flex: 1, marginHorizontal: 4 }}>
                          <Text style={[styles.miniLabel, { marginBottom: 4 }]}>{side}</Text>
                          <View style={styles.formatGrid}>
                            {FORMAT_OPTIONS.map(({ label, value }) => {
                              const active = config.roundsData?.[rIdx]?.formats?.[sIdx] === value;
                              return (
                                <TouchableOpacity key={value} disabled={!isEditable}
                                  onPress={() => {
                                    const fmts = [...(config.roundsData?.[rIdx]?.formats ?? ['TOTALS', 'TOTALS'])];
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

                <SectionLabel text="TEAM NAMES" />
                <View style={styles.card}>
                  <Text style={styles.note}>Customize display names for each team.</Text>
                  {ALL_TEAM_IDS.map(tid => (
                    <View key={tid} style={styles.teamNameRow}>
                      <View style={[styles.teamColorDot, { backgroundColor: TEAM_COLORS[tid] }]} />
                      <Text style={styles.teamIdLabel}>Team {tid}</Text>
                      {isEditable ? (
                        <TextInput
                          style={styles.teamNameInput}
                          value={config.teamNames?.[tid] ?? `Team ${tid}`}
                          onChangeText={v => updateTeamName(tid, v)}
                          placeholder={`Team ${tid}`}
                          returnKeyType="done"
                        />
                      ) : (
                        <Text style={styles.teamNameStatic}>{config.teamNames?.[tid] ?? `Team ${tid}`}</Text>
                      )}
                    </View>
                  ))}
                </View>

                <SectionLabel text="SCORING" />
                <View style={styles.card}>
                  {[
                    { label: 'Matchplay', key: 'isMatchplay' },
                    { label: 'Handicaps Enabled', key: 'isHandicapEnabled' },
                  ].map(({ label, key }) => (
                    <View key={key} style={styles.settingRow}>
                      <Text style={styles.settingText}>{label}</Text>
                      <Switch disabled={!isEditable}
                        value={(config as any)[key] ?? true}
                        onValueChange={v => updateCfg({ [key]: v })}
                        trackColor={{ false: '#cbd5e1', true: '#1e3a8a' }}
                      />
                    </View>
                  ))}
                  <View style={styles.pointsGrid}>
                    {[
                      { label: 'PTS/SEG WIN', key: 'pointsPerSegment', def: 2 },
                      { label: 'PTS/SEG TIE', key: 'pointsPerSegmentPush', def: 1 },
                    ].map(({ label, key, def }) => (
                      <View key={key} style={styles.pointCol}>
                        <Text style={styles.miniLabel}>{label}</Text>
                        <TextInput editable={isEditable} keyboardType="numeric" returnKeyType="done"
                          style={[styles.smallInput, !isEditable && { opacity: 0.5 }]}
                          defaultValue={String((config as any)[key] ?? def)}
                          onChangeText={v => updateCfg({ [key]: parseFloat(v) || 0 })} />
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* ── ROSTER TAB ─────────────────────────────────── */}
            {activeTab === 'ROSTER' && (
              <View>
                {isEditable && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>AUTO-BALANCE ROSTER</Text>
                    <Text style={styles.note}>
                      Unassigned real players are sorted by handicap and snake-drafted across teams.
                      Remaining slots are filled with placeholders. Existing team assignments are preserved.
                    </Text>
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
                    <TouchableOpacity
                      style={[styles.primaryBtn, balancing && styles.disabled]}
                      onPress={handleAutoBalance} disabled={balancing}
                    >
                      {balancing
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryBtnText}>⚡ Auto-Balance Teams</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}

                {/* Unassigned players warning */}
                {(() => {
                  const unassigned = players.filter(p => p.team === 'UNASSIGNED' && !p.isPlaceholder);
                  return unassigned.length > 0 && (
                    <View style={styles.warningCard}>
                      <Text style={styles.warningText}>
                        ⚠️ {unassigned.length} player{unassigned.length > 1 ? 's' : ''} not yet assigned to a team.
                        Tap Auto-Balance or assign manually below.
                      </Text>
                    </View>
                  );
                })()}

                {/* Team sections */}
                {(['UNASSIGNED', 'A', 'B', 'C', 'D'] as const).map(teamId => {
                  const tp = players.filter(p => p.team === teamId);
                  if (tp.length === 0) return null;
                  const realCount = tp.filter(p => !p.isPlaceholder).length;
                  const avgHc = realCount > 0
                    ? (tp.filter(p => !p.isPlaceholder).reduce((s, p) => s + p.hc, 0) / realCount).toFixed(1)
                    : '—';

                  return (
                    <View key={teamId}>
                      <View style={[styles.teamBar, teamId !== 'UNASSIGNED' && { borderLeftColor: TEAM_COLORS[teamId] }]}>
                        <View>
                          <Text style={[styles.teamBarName, { color: teamId === 'UNASSIGNED' ? '#64748b' : TEAM_COLORS[teamId] }]}>
                            {teamId === 'UNASSIGNED' ? 'Unassigned' : getTeamDisplayName(teamId)}
                          </Text>
                          {teamId !== 'UNASSIGNED' && (
                            <Text style={styles.teamBarSub}>Team {teamId}</Text>
                          )}
                        </View>
                        <Text style={styles.teamBarStat}>{tp.length} players · Avg HC {avgHc}</Text>
                      </View>

                      {tp.map((player: Player) => (
                        <View key={player.id}
                          style={[styles.playerCard, player.isPlaceholder && styles.playerCardPH]}>
                          <PlayerAvatar
                            userId={player.userId}
                            name={player.name}
                            team={player.team}
                            size={42}
                            showRing={!player.isPlaceholder}
                          />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {player.isPlaceholder && (
                                <View style={styles.openTag}><Text style={styles.openTagText}>OPEN SLOT</Text></View>
                              )}
                              <Text style={[styles.playerName, player.isPlaceholder && styles.playerNamePH]} numberOfLines={1}>
                                {player.name}
                              </Text>
                            </View>
                            {isEditable ? (
                              <View style={styles.hcRow}>
                                <Text style={styles.hcLabel}>HC</Text>
                                <TextInput style={styles.hcInput} keyboardType="numeric" returnKeyType="done"
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
                    </View>
                  );
                })}

                {players.length === 0 && (
                  <View style={styles.emptyRoster}>
                    <Text style={styles.emptyRosterText}>
                      No players yet. Share code{' '}
                      <Text style={{ fontWeight: '900', color: '#1e3a8a' }}>{config.id}</Text>{' '}
                      for others to join, then auto-balance.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── PAIRINGS TAB ─────────────────────────────────── */}
            {activeTab === 'PAIRINGS' && (
              <PairingsTab
                config={config}
                isEditable={isEditable}
                onSavePairings={savePairings}
                saving={saving}
                setSaving={setSaving}
                numTeams={numTeams}
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

// ── Pairings Tab ──────────────────────────────────────────────────────────────
// Redesigned: owner first selects which two teams play (per round+segment),
// then picks individual players from each of those teams.

function PairingsTab({ config, isEditable, onSavePairings, saving, setSaving, numTeams }: {
  config: TournamentConfig;
  isEditable: boolean;
  onSavePairings: (p: Pairing[]) => Promise<void>;
  saving: boolean;
  setSaving: (v: boolean) => void;
  numTeams: number;
}) {
  const [localPairings, setLocalPairings] = useState<Pairing[]>(config.pairings ?? []);
  const [activeRound, setActiveRound]     = useState(0);
  const [activeSeg, setActiveSeg]         = useState(0);
  const [matchupTeamA, setMatchupTeamA]   = useState<TeamId | null>(null);
  const [matchupTeamB, setMatchupTeamB]   = useState<TeamId | null>(null);
  const [selectedA, setSelectedA]         = useState<string[]>([]);
  const [selectedB, setSelectedB]         = useState<string[]>([]);

  const teamLabels = ALL_TEAM_IDS.slice(0, numTeams);
  const getTeamName = (id: TeamId) => config.teamNames?.[id] ?? `Team ${id}`;
  const getName = (id: string) => config.players.find(p => p.id === id)?.name ?? '?';

  const curPairings = localPairings.filter(p => p.roundIndex === activeRound && p.segmentIndex === activeSeg);
  const format = config.roundsData?.[activeRound]?.formats?.[activeSeg] ?? 'TOTALS';

  // Players for the currently selected matchup teams
  const teamAPool = matchupTeamA
    ? config.players.filter(p => p.team === matchupTeamA && !p.isPlaceholder)
    : [];
  const teamBPool = matchupTeamB
    ? config.players.filter(p => p.team === matchupTeamB && !p.isPlaceholder)
    : [];

  // Existing matchup selections for this round+segment
  const existingMatchups = Array.from(new Set(
    curPairings.map(p => `${p.teamAId}v${p.teamBId}`)
  ));

  const handleSelectMatchupA = (t: TeamId) => {
    setMatchupTeamA(t === matchupTeamA ? null : t);
    setSelectedA([]);
  };
  const handleSelectMatchupB = (t: TeamId) => {
    setMatchupTeamB(t === matchupTeamB ? null : t);
    setSelectedB([]);
  };

  const toggleA = (id: string) =>
    setSelectedA(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleB = (id: string) =>
    setSelectedB(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const addPairing = () => {
    if (!selectedA.length || !selectedB.length || !matchupTeamA || !matchupTeamB) {
      Alert.alert('Select Players', 'Pick at least one player from each side.');
      return;
    }
    const newP: Pairing = {
      id: `manual-${Date.now()}`,
      roundIndex: activeRound, segmentIndex: activeSeg,
      teamAId: matchupTeamA, teamBId: matchupTeamB,
      teamAPlayers: [...selectedA], teamBPlayers: [...selectedB],
    };
    setLocalPairings(prev => [...prev, newP]);
    setSelectedA([]); setSelectedB([]);
  };

  const removePairing = (id: string) => setLocalPairings(prev => prev.filter(p => p.id !== id));

  const handleSave = async () => {
    setSaving(true);
    await onSavePairings(localPairings);
    setSaving(false);
    Alert.alert('Saved ✓', 'Pairings saved to database.');
  };

  const handleAutoFill = () => {
    // Auto-pair: for each pair of teams in each round+seg, match players by HC
    if (!isEditable) return;
    const auto: Pairing[] = [];
    for (let r = 0; r < config.rounds; r++) {
      for (let s = 0; s < 2; s++) {
        const fmt = config.roundsData?.[r]?.formats?.[s] ?? 'TOTALS';
        // Create matchups between consecutive teams: A vs B, C vs D
        for (let ti = 0; ti < numTeams - 1; ti += 2) {
          const tA = teamLabels[ti];
          const tB = teamLabels[ti + 1];
          if (!tA || !tB) continue;
          const sideA = config.players.filter(p => p.team === tA && !p.isPlaceholder).sort((a, b) => a.hc - b.hc);
          const sideB = config.players.filter(p => p.team === tB && !p.isPlaceholder).sort((a, b) => a.hc - b.hc);
          if (!sideA.length || !sideB.length) continue;

          if (fmt === 'TOTALS' || fmt === 'SCRAMBLE' || fmt === 'ALT-SHOT') {
            auto.push({
              id: `auto-${r}-${s}-${ti}`,
              roundIndex: r, segmentIndex: s,
              teamAId: tA, teamBId: tB,
              teamAPlayers: sideA.map(p => p.id),
              teamBPlayers: sideB.map(p => p.id),
            });
          } else {
            const count = Math.min(sideA.length, sideB.length);
            for (let i = 0; i < count; i++) {
              auto.push({
                id: `auto-${r}-${s}-${ti}-${i}`,
                roundIndex: r, segmentIndex: s,
                teamAId: tA, teamBId: tB,
                teamAPlayers: [sideA[i].id],
                teamBPlayers: [sideB[i].id],
              });
            }
          }
        }
      }
    }
    setLocalPairings(auto);
    Alert.alert('Auto-paired ✓', `${auto.length} pairing(s) generated. Review and save.`);
  };

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>MATCHUP PAIRINGS</Text>
        <Text style={styles.note}>
          Pairings define which players score against each other. First pick which teams play,
          then choose individual players per matchup.
        </Text>
        {isEditable && (
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.disabled]}
            onPress={handleAutoFill} disabled={saving}>
            <Text style={styles.primaryBtnText}>⚡ Auto-Fill Pairings</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Round / Segment selectors */}
      {config.rounds > 1 && (
        <SegControl
          options={Array.from({ length: config.rounds }, (_, i) => `R${i + 1}`)}
          active={`R${activeRound + 1}`}
          onSelect={v => setActiveRound(parseInt(v.slice(1)) - 1)} disabled={false}
        />
      )}
      <SegControl
        options={['Front 9', 'Back 9']}
        active={activeSeg === 0 ? 'Front 9' : 'Back 9'}
        onSelect={v => setActiveSeg(v === 'Front 9' ? 0 : 1)} disabled={false}
      />

      <Text style={styles.pairSegLabel}>
        R{activeRound + 1} · {activeSeg === 0 ? 'FRONT 9' : 'BACK 9'} · {format}
      </Text>

      {/* Existing pairings for this round+seg */}
      {curPairings.length === 0
        ? <Text style={styles.noPairText}>No pairings yet for this segment.</Text>
        : curPairings.map(pair => (
          <View key={pair.id} style={styles.pairingRow}>
            <View style={styles.pairingTeam}>
              <View style={[styles.dot, { backgroundColor: TEAM_COLORS[pair.teamAId] ?? '#1e3a8a' }]} />
              <View>
                <Text style={styles.pairingTeamLabel}>{getTeamName(pair.teamAId)}</Text>
                <Text style={styles.pairingNames} numberOfLines={1}>
                  {pair.teamAPlayers.map(getName).join(' & ')}
                </Text>
              </View>
            </View>
            <Text style={styles.vsText}>vs</Text>
            <View style={styles.pairingTeam}>
              <View style={[styles.dot, { backgroundColor: TEAM_COLORS[pair.teamBId] ?? '#dc2626' }]} />
              <View>
                <Text style={styles.pairingTeamLabel}>{getTeamName(pair.teamBId)}</Text>
                <Text style={styles.pairingNames} numberOfLines={1}>
                  {pair.teamBPlayers.map(getName).join(' & ')}
                </Text>
              </View>
            </View>
            {isEditable && (
              <TouchableOpacity onPress={() => removePairing(pair.id)} style={styles.removePairBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      }

      {/* Manual builder */}
      {isEditable && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ADD MATCHUP</Text>

          {/* Step 1: Team selection */}
          <Text style={styles.miniLabel}>STEP 1 — CHOOSE TEAMS</Text>
          <View style={styles.teamMatchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniLabel, { marginBottom: 6, color: '#1e3a8a' }]}>SIDE A</Text>
              {teamLabels.map(t => (
                <TouchableOpacity key={t}
                  style={[styles.teamPickBtn, matchupTeamA === t && { backgroundColor: TEAM_COLORS[t], borderColor: TEAM_COLORS[t] }]}
                  onPress={() => handleSelectMatchupA(t)}
                >
                  <Text style={[styles.teamPickBtnText, matchupTeamA === t && { color: '#fff' }]}>
                    {getTeamName(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.vsText}>vs</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniLabel, { marginBottom: 6, color: '#dc2626' }]}>SIDE B</Text>
              {teamLabels.filter(t => t !== matchupTeamA).map(t => (
                <TouchableOpacity key={t}
                  style={[styles.teamPickBtn, matchupTeamBBase, matchupTeamB === t && { backgroundColor: TEAM_COLORS[t], borderColor: TEAM_COLORS[t] }]}
                  onPress={() => handleSelectMatchupB(t)}
                >
                  <Text style={[styles.teamPickBtnText, matchupTeamB === t && { color: '#fff' }]}>
                    {getTeamName(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Step 2: Player selection */}
          {matchupTeamA && matchupTeamB && (
            <>
              <Text style={[styles.miniLabel, { marginTop: 16, marginBottom: 8 }]}>
                STEP 2 — SELECT PLAYERS  ({format})
              </Text>
              <View style={styles.manualGrid}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: TEAM_COLORS[matchupTeamA], marginBottom: 6 }]}>
                    {getTeamName(matchupTeamA).toUpperCase()}
                  </Text>
                  {teamAPool.length === 0
                    ? <Text style={styles.noPlayerText}>No players assigned</Text>
                    : teamAPool.map(p => (
                      <TouchableOpacity key={p.id} onPress={() => toggleA(p.id)}
                        style={[styles.selPlayer, { borderColor: TEAM_COLORS[matchupTeamA] + '40', backgroundColor: TEAM_COLORS[matchupTeamA] + '10' },
                          selectedA.includes(p.id) && { backgroundColor: TEAM_COLORS[matchupTeamA], borderColor: TEAM_COLORS[matchupTeamA] }]}>
                        <Text style={[styles.selName, selectedA.includes(p.id) && { color: '#fff' }]} numberOfLines={1}>{p.name}</Text>
                        <Text style={[styles.selHC, selectedA.includes(p.id) && { color: 'rgba(255,255,255,0.75)' }]}>HC {p.hc}</Text>
                      </TouchableOpacity>
                    ))
                  }
                </View>
                <View style={{ width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: TEAM_COLORS[matchupTeamB], marginBottom: 6 }]}>
                    {getTeamName(matchupTeamB).toUpperCase()}
                  </Text>
                  {teamBPool.length === 0
                    ? <Text style={styles.noPlayerText}>No players assigned</Text>
                    : teamBPool.map(p => (
                      <TouchableOpacity key={p.id} onPress={() => toggleB(p.id)}
                        style={[styles.selPlayer, { borderColor: TEAM_COLORS[matchupTeamB] + '40', backgroundColor: TEAM_COLORS[matchupTeamB] + '10' },
                          selectedB.includes(p.id) && { backgroundColor: TEAM_COLORS[matchupTeamB], borderColor: TEAM_COLORS[matchupTeamB] }]}>
                        <Text style={[styles.selName, selectedB.includes(p.id) && { color: '#fff' }]} numberOfLines={1}>{p.name}</Text>
                        <Text style={[styles.selHC, selectedB.includes(p.id) && { color: 'rgba(255,255,255,0.75)' }]}>HC {p.hc}</Text>
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
            </>
          )}

          <TouchableOpacity
            style={[styles.saveManualBtn, saving && styles.disabled]}
            onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>💾  Save All Pairings</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
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

const teamMatchupBBase = {};
const teamPickBtnBase  = {};
const matchupTeamBBase = {};

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#1e3a8a' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  codeLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  codeValue: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 2, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusPill: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusPillActive: { backgroundColor: '#dcfce7' },
  statusPillText: { fontSize: 10, fontWeight: '800', color: '#fff' },
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
  teamNameRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9', gap: 10 },
  teamColorDot: { width: 12, height: 12, borderRadius: 6 },
  teamIdLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', width: 52 },
  teamNameInput: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1e293b', borderBottomWidth: 1.5, borderColor: '#e2e8f0', paddingVertical: 4 },
  teamNameStatic: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1e293b' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  settingText: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  pointsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  pointCol: { flex: 1, alignItems: 'center' },
  smallInput: { backgroundColor: '#f1f5f9', width: 62, padding: 8, borderRadius: 8, textAlign: 'center', fontWeight: '900', color: '#1e3a8a', fontSize: 16 },
  skeletonInputRow: { flexDirection: 'row', marginBottom: 12 },
  note: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  warningCard: { backgroundColor: '#fef3c7', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#fde68a' },
  warningText: { fontSize: 13, color: '#92400e', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#1e3a8a', padding: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.5 },
  teamBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 4, marginTop: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  teamBarName: { fontSize: 15, fontWeight: '900' },
  teamBarSub: { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  teamBarStat: { fontSize: 11, color: '#64748b' },
  playerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 13, marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  playerCardPH: { borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  openTag: { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  openTagText: { fontSize: 8, fontWeight: '900', color: '#d97706' },
  playerName: { fontSize: 14, fontWeight: '700', color: '#1e293b', flexShrink: 1 },
  playerNamePH: { color: '#94a3b8', fontStyle: 'italic' },
  hcRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  hcLabel: { fontSize: 11, color: '#94a3b8', marginRight: 4 },
  hcInput: { fontSize: 13, color: '#1e3a8a', fontWeight: '800', width: 44, borderBottomWidth: 1, borderColor: '#e2e8f0', textAlign: 'center' },
  teamPicker: { flexDirection: 'row', gap: 5, marginLeft: 8 },
  teamBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  teamBtnText: { fontSize: 10, fontWeight: '900', color: '#64748b' },
  removeBtn: { marginLeft: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 10, color: '#dc2626', fontWeight: '900' },
  emptyRoster: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', alignItems: 'center' },
  emptyRosterText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  pairSegLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  noPairText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 12 },
  pairingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 },
  pairingTeam: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  pairingTeamLabel: { fontSize: 9, fontWeight: '900', color: '#94a3b8', letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 3 },
  pairingNames: { fontSize: 12, fontWeight: '700', color: '#1e293b', flex: 1 },
  vsText: { fontSize: 11, fontWeight: '900', color: '#94a3b8', marginHorizontal: 4 },
  removePairBtn: { marginLeft: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  teamMatchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 8 },
  teamPickBtn: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginBottom: 6, alignItems: 'center' },
  teamPickBtnText: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  manualGrid: { flexDirection: 'row', marginBottom: 12 },
  selPlayer: { padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1.5 },
  selName: { fontSize: 12, fontWeight: '700', color: '#1e293b' },
  selHC: { fontSize: 10, color: '#64748b', marginTop: 2 },
  noPlayerText: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: 8 },
  addPairBtn: { backgroundColor: '#1e3a8a', padding: 13, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  addPairBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  saveManualBtn: { backgroundColor: '#16a34a', padding: 14, borderRadius: 12, alignItems: 'center' },
  saveBar: { padding: 16, paddingBottom: 36, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e2e8f0' },
  saveBtn: { backgroundColor: '#16a34a', padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});