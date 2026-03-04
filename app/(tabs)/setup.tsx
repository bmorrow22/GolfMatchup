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
  View
} from 'react-native';
import { Player, useTournament } from '../../store/TournamentContext';

export default function SetupScreen() {
  const { config, setConfig, updatePlayerTeam } = useTournament();
  
  // Local state for skeleton builder inputs
  const [teamCount, setTeamCount] = useState('2');
  const [playersPerTeam, setPlayersPerTeam] = useState('2');

  const updateConfig = (key: string, value: any) => {
    setConfig({ ...config, [key]: value });
  };

  const updateRoundData = (roundIdx: number, key: string, value: any) => {
    const newRounds = [...(config?.roundsData || [])];
    if (!newRounds[roundIdx]) {
      newRounds[roundIdx] = { course: 'SOUTH', formats: ['TOTALS', 'TOTALS'] };
    }
    newRounds[roundIdx] = { ...newRounds[roundIdx], [key]: value };
    updateConfig('roundsData', newRounds);
  };

  const generatePlaceholderRoster = () => {
    const tCount = parseInt(teamCount) || 0;
    const pCount = parseInt(playersPerTeam) || 0;
    const newPlayers: Player[] = [];

    for (let t = 0; t < tCount; t++) {
      const teamLabel = String.fromCharCode(65 + t) as 'A' | 'B'; 
      for (let p = 1; p <= pCount; p++) {
        newPlayers.push({
          id: `placeholder-${teamLabel}-${p}`,
          name: `Team ${teamLabel} Player ${p}`,
          hc: 0,
          team: teamLabel,
          role: 'PLAYER',
          groupId: null, // REQUIRED: Fixed TS missing property error
          isPlaceholder: true // REQUIRED: Fixed TS missing property error
        });
      }
    }
    updateConfig('players', newPlayers);
    Alert.alert("Success", "Roster skeleton generated!");
  };

  const numRounds = config?.rounds || 1;
  const players = config?.players || [];

  return (
    // IMPROVEMENT: Wrap in KeyboardAvoidingView to push content up when typing
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={{ flex: 1 }}
    >
      {/* IMPROVEMENT: Tap anywhere to dismiss keyboard */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.header}>Tournament Builder</Text>

          {/* STEP 1: ROUNDS */}
          <Text style={styles.stepLabel}>1. TOTAL ROUNDS</Text>
          <View style={styles.segmentedControl}>
            {[1, 2, 3, 4].map(num => (
              <TouchableOpacity 
                key={num} 
                onPress={() => updateConfig('rounds', num)}
                style={[styles.segmentBtn, numRounds === num && styles.activeSegment]}
              >
                <Text style={numRounds === num ? styles.activeText : styles.inactiveText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* STEP 2-4: ROUND CONFIG */}
          {Array.from({ length: numRounds }).map((_, rIdx) => (
            <View key={rIdx} style={styles.roundBox}>
              <Text style={styles.roundTitle}>ROUND {rIdx + 1}</Text>
              
              <Text style={styles.subLabel}>Select Course</Text>
              <View style={styles.segmentedControl}>
                {['SOUTH', 'NORTH'].map(c => (
                  <TouchableOpacity 
                    key={c}
                    onPress={() => updateRoundData(rIdx, 'course', c)}
                    style={[styles.segmentBtn, config?.roundsData?.[rIdx]?.course === c && styles.activeSegment]}
                  >
                    <Text style={config?.roundsData?.[rIdx]?.course === c ? styles.activeText : styles.inactiveText}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.subLabel}>Scoring Formats (Front 9 / Back 9)</Text>
              <View style={styles.formatRow}>
                {['Front', 'Back'].map((side, sIdx) => (
                  <View key={side} style={{ flex: 1, marginHorizontal: 4 }}>
                    <Text style={styles.miniLabel}>{side} 9</Text>
                    <View style={styles.formatGrid}>
                      {['TOT', 'SCR', 'ALT', 'SIN'].map(f => {
                        const fmtValue = f === 'TOT' ? 'TOTALS' : f === 'SCR' ? 'SCRAMBLE' : f === 'ALT' ? 'ALT-SHOT' : 'SINGLES';
                        const isActive = config?.roundsData?.[rIdx]?.formats?.[sIdx] === fmtValue;
                        return (
                          <TouchableOpacity 
                            key={f} 
                            onPress={() => {
                              const fmts = [...(config?.roundsData?.[rIdx]?.formats || ['TOTALS', 'TOTALS'])];
                              fmts[sIdx] = fmtValue;
                              updateRoundData(rIdx, 'formats', fmts);
                            }}
                            style={[styles.miniBtn, isActive && styles.activeSegment]}
                          >
                            <Text style={[styles.miniBtnText, isActive && styles.activeText]}>{f}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* STEP 5 & 6: SCORING & PUSH POINTS */}
          <Text style={styles.stepLabel}>5 & 6. TEAM LOGIC & SCORING</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>Matchplay (Head-to-Head)</Text>
              <Switch 
                value={config?.isMatchplay ?? true} 
                onValueChange={(val) => updateConfig('isMatchplay', val)}
                trackColor={{ false: "#cbd5e1", true: "#1e3a8a" }}
              />
            </View>

            <View style={styles.pointsGrid}>
              <View style={styles.pointInputCol}>
                <Text style={styles.miniLabel}>PTS PER HOLE WIN</Text>
                <TextInput 
                  style={styles.smallInput} 
                  keyboardType="numeric" 
                  returnKeyType="done" // IMPROVEMENT: Shows "Done" on iOS
                  onSubmitEditing={Keyboard.dismiss} // IMPROVEMENT: Hides keyboard on "Done"
                  defaultValue={String(config?.pointsPerHole || 1)}
                  onChangeText={(val) => updateConfig('pointsPerHole', parseFloat(val) || 0)}
                />
              </View>
              <View style={styles.pointInputCol}>
                <Text style={styles.miniLabel}>PTS PER HOLE PUSH</Text>
                <TextInput 
                  style={styles.smallInput} 
                  keyboardType="numeric" 
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  defaultValue={String(config?.pointsPerHolePush || 0)}
                  onChangeText={(val) => updateConfig('pointsPerHolePush', parseFloat(val) || 0)}
                />
              </View>
            </View>

            <View style={[styles.pointsGrid, { borderTopWidth: 1, borderColor: '#f1f5f9', marginTop: 10, paddingTop: 10 }]}>
              <View style={styles.pointInputCol}>
                <Text style={styles.miniLabel}>PTS PER SEGMENT WIN</Text>
                <TextInput 
                  style={styles.smallInput} 
                  keyboardType="numeric" 
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  defaultValue={String(config?.pointsPerSegment || 2)}
                  onChangeText={(val) => updateConfig('pointsPerSegment', parseFloat(val) || 0)}
                />
              </View>
              <View style={styles.pointInputCol}>
                <Text style={styles.miniLabel}>PTS PER SEGMENT PUSH</Text>
                <TextInput 
                  style={styles.smallInput} 
                  keyboardType="numeric" 
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  defaultValue={String(config?.pointsPerSegmentPush || 1)}
                  onChangeText={(val) => updateConfig('pointsPerSegmentPush', parseFloat(val) || 0)}
                />
              </View>
            </View>
          </View>

          {/* STEP 7: SKELETON */}
          <Text style={styles.stepLabel}>7. CONFIGURE TEAM SLOTS</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}># of Teams</Text>
              <TextInput style={styles.smallInput} value={teamCount} onChangeText={setTeamCount} keyboardType="numeric" returnKeyType="done" />
            </View>
            <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.settingText}>Players per Team</Text>
              <TextInput style={styles.smallInput} value={playersPerTeam} onChangeText={setPlayersPerTeam} keyboardType="numeric" returnKeyType="done" />
            </View>
            <TouchableOpacity style={styles.generateBtn} onPress={generatePlaceholderRoster}>
              <Text style={styles.generateBtnText}>Build Roster Skeleton</Text>
            </TouchableOpacity>
          </View>

          {/* STEP 8: ROSTER */}
          <Text style={styles.stepLabel}>8. ROSTER & ASSIGNMENTS</Text>
          {players.map((player: Player) => (
            <View key={player.id} style={[styles.playerRow, player.isPlaceholder && styles.placeholderRow]}>
              <View style={styles.playerInfo}>
                <Text style={[styles.playerName, player.isPlaceholder && styles.placeholderText]}>{player.name}</Text>
                <TextInput 
                  style={styles.inlineHcInput}
                  keyboardType="numeric"
                  returnKeyType="done"
                  defaultValue={String(player.hc)}
                  onChangeText={(val) => {
                    const newPlayers = [...players];
                    const idx = newPlayers.findIndex(p => p.id === player.id);
                    newPlayers[idx].hc = parseFloat(val) || 0;
                    updateConfig('players', newPlayers);
                  }}
                />
              </View>
              <View style={styles.teamPicker}>
                {['A', 'B'].map((team) => (
                  <TouchableOpacity 
                    key={team}
                    onPress={() => updatePlayerTeam(player.id, team as 'A' | 'B')}
                    style={[styles.teamBtn, player.team === team && (team === 'A' ? styles.teamABtn : styles.teamBBtn)]}
                  >
                    <Text style={[styles.teamBtnText, player.team === team && styles.activeTeamText]}>{team}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  header: { fontSize: 28, fontWeight: '900', color: '#1e293b', marginBottom: 20 },
  stepLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1.5, marginBottom: 10, marginTop: 20 },
  subLabel: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  roundBox: { backgroundColor: '#fff', padding: 18, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  roundTitle: { fontSize: 14, fontWeight: '900', color: '#1e3a8a', marginBottom: 10 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  settingText: { fontSize: 15, color: '#1e293b', fontWeight: '600' },
  pointsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  pointInputCol: { flex: 1, alignItems: 'center' },
  miniLabel: { fontSize: 9, fontWeight: 'bold', color: '#94a3b8', marginBottom: 5 },
  smallInput: { backgroundColor: '#f1f5f9', width: 60, padding: 8, borderRadius: 8, textAlign: 'center', fontWeight: '900', color: '#1e3a8a' },
  formatRow: { flexDirection: 'row', justifyContent: 'space-between' },
  formatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  miniBtn: { flex: 1, minWidth: '45%', paddingVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 6, alignItems: 'center', marginBottom: 4 },
  miniBtnText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  // IMPROVEMENT: High-contrast selection colors
  activeSegment: { backgroundColor: '#1e3a8a' },
  activeText: { color: '#fff', fontWeight: 'bold' },
  inactiveText: { color: '#64748b' },
  generateBtn: { backgroundColor: '#1e3a8a', padding: 16, borderRadius: 12, marginTop: 15, alignItems: 'center' },
  generateBtnText: { color: '#fff', fontWeight: 'bold' },
  playerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  placeholderRow: { borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  placeholderText: { color: '#94a3b8', fontStyle: 'italic' },
  playerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  playerName: { fontSize: 14, fontWeight: '700', color: '#1e293b', flex: 1 },
  inlineHcInput: { width: 40, fontSize: 12, color: '#1e3a8a', fontWeight: 'bold', marginLeft: 10, textAlign: 'right' },
  teamPicker: { flexDirection: 'row', gap: 6 },
  teamBtn: { width: 35, height: 35, borderRadius: 6, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  teamABtn: { backgroundColor: '#1e3a8a' },
  teamBBtn: { backgroundColor: '#b91c1c' },
  teamBtnText: { fontSize: 12, fontWeight: '800', color: '#64748b' },
  activeTeamText: { color: '#fff' },
});