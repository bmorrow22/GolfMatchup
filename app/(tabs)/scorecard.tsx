import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MatchBanner } from '../../components/MatchBanner';
import { COURSES } from '../../constants/TorreyData';
import { Player, useTournament } from '../../store/TournamentContext';
import { getHoleResult, getMatchStatus, getStrokesForHole } from '../../utils/golfLogic';

// Define a local Hole interface to satisfy TypeScript
interface Hole {
  hole: number;
  par: number;
  si: number;
  yardage: number;
}

interface HoleInputProps {
  format: string;
  scores: string[];
  onScoreChange: (playerIdx: number, val: string) => void;
  playerNames: string[];
  hcs: number[];
  si: number;
}

function HoleInput({ format, scores, onScoreChange, playerNames, hcs, si }: HoleInputProps) {
  const visibleIndices = format === 'TOTALS' ? [0, 1, 2, 3] : [0, 2];

  return (
    <View style={styles.inputRowContainer}>
      {visibleIndices.map((idx: number) => {
        if (!playerNames[idx]) return null;
        const numPops = getStrokesForHole(hcs[idx] || 0, si);
        const dots = "•".repeat(numPops);

        return (
          <View key={idx} style={styles.inputGroup}>
            <Text style={styles.label}>
              {playerNames[idx]?.substring(0, 3).toUpperCase()} 
              <Text style={{ color: '#1e3a8a' }}>{dots}</Text>
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={scores[idx]}
              onChangeText={(val: string) => onScoreChange(idx, val)}
              placeholder="-"
            />
          </View>
        );
      })}
    </View>
  );
}

export default function ScorecardScreen() {
  const { config } = useTournament(); 
  const [viewMode, setViewMode] = useState<'LIST' | 'FOCUS'>('LIST');
  const [focusIndex, setFocusIndex] = useState(0);
  const [allScores, setAllScores] = useState<string[][]>(Array(18).fill(['', '', '', '']));
  
  if (!config || !config.players) {
    return <View style={styles.centered}><Text>Waiting for tournament setup...</Text></View>;
  }

  const courseKey = config.course as keyof typeof COURSES;
  const side = config.segmentLength === 9 ? 'front9' : 'back9';
  
  // Cast holeData as an array of our Hole interface
  const holeData = COURSES[courseKey][side] as Hole[];

  const handleScoreChange = (holeIdx: number, playerIdx: number, val: string) => {
    const newScores = [...allScores];
    const updatedHole = [...newScores[holeIdx]];
    updatedHole[playerIdx] = val;
    newScores[holeIdx] = updatedHole;
    setAllScores(newScores);
  };

  const matchHistory = holeData.map((hole, idx) => {
    const scores = allScores[idx].map(Number);
    const requiredPlayers = config.format === 'TOTALS' ? 4 : 2;
    const filledScores = allScores[idx].filter(s => s !== '').length;
    if (filledScores < requiredPlayers) return null; 
    
    return getHoleResult(config.format, scores, config.players.map((p: Player) => p.hc), hole.si);
  }).filter((result): result is 'WIN' | 'LOSS' | 'PUSH' => result !== null);

  return (
    <View style={styles.container}>
      <MatchBanner 
        segmentName={`${config.course} - ${config.format}`} 
        status={getMatchStatus(matchHistory)} 
      />

      <View style={styles.viewToggle}>
        <TouchableOpacity 
          style={[styles.toggleBtn, viewMode === 'LIST' && styles.activeToggle]} 
          onPress={() => setViewMode('LIST')}
        >
          <Text style={viewMode === 'LIST' ? styles.activeText : styles.inactiveText}>Full List</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.toggleBtn, viewMode === 'FOCUS' && styles.activeToggle]} 
          onPress={() => setViewMode('FOCUS')}
        >
          <Text style={viewMode === 'FOCUS' ? styles.activeText : styles.inactiveText}>Hole Focus</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'LIST' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {holeData.map((hole, idx) => (
            <View key={idx} style={styles.holeRow}>
              <View style={styles.holeInfo}>
                <Text style={styles.holeNum}>Hole {hole.hole}</Text>
                <Text style={styles.siText}>SI: {hole.si} • Par {hole.par}</Text>
              </View>
              <HoleInput 
                format={config.format}
                scores={allScores[idx]}
                playerNames={config.players.map((p: Player) => p.name)}
                hcs={config.players.map((p: Player) => p.hc)}
                si={hole.si}
                onScoreChange={(pIdx, val) => handleScoreChange(idx, pIdx, val)}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.focusContainer}>
          <View style={styles.focusHeader}>
            <TouchableOpacity onPress={() => setFocusIndex(Math.max(0, focusIndex - 1))}>
              <Text style={styles.navText}>←</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.focusHoleNum}>HOLE {holeData[focusIndex].hole}</Text>
              <Text style={styles.focusHoleDetail}>Par {holeData[focusIndex].par} • SI {holeData[focusIndex].si}</Text>
            </View>
            <TouchableOpacity onPress={() => setFocusIndex(Math.min(holeData.length - 1, focusIndex + 1))}>
              <Text style={styles.navText}>→</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.focusCard}>
            <Text style={styles.focusYardage}>{holeData[focusIndex].yardage} YDS</Text>
          </View>

          <View style={{ padding: 20 }}>
            <HoleInput 
              format={config.format}
              scores={allScores[focusIndex]}
              playerNames={config.players.map((p: Player) => p.name)}
              hcs={config.players.map((p: Player) => p.hc)}
              si={holeData[focusIndex].si}
              onScoreChange={(pIdx, val) => handleScoreChange(focusIndex, pIdx, val)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewToggle: { flexDirection: 'row', padding: 10, backgroundColor: '#f1f5f9', margin: 15, borderRadius: 10 },
  toggleBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8 },
  activeToggle: { backgroundColor: '#fff', elevation: 2 },
  activeText: { fontWeight: 'bold', color: '#1e3a8a' },
  inactiveText: { color: '#64748b' },
  holeRow: { padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  holeInfo: { flex: 1 },
  holeNum: { fontSize: 18, fontWeight: 'bold' },
  siText: { fontSize: 12, color: '#666' },
  inputRowContainer: { flexDirection: 'row', gap: 10 },
  inputGroup: { alignItems: 'center' },
  label: { fontSize: 10, color: '#999', marginBottom: 2, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, width: 45, height: 45, textAlign: 'center', fontSize: 20, backgroundColor: '#fdfdfd', fontWeight: 'bold' },
  focusContainer: { flex: 1 },
  focusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  focusHoleNum: { fontSize: 32, fontWeight: '900', color: '#1e293b' },
  focusHoleDetail: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  navText: { fontSize: 40, color: '#1e3a8a' },
  focusCard: { backgroundColor: '#1e3a8a', margin: 20, borderRadius: 20, padding: 40, alignItems: 'center' },
  focusYardage: { color: '#fff', fontSize: 48, fontWeight: '900' }
});