import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MatchBanner } from '../../components/MatchBanner';
import { COURSES } from '../../constants/TorreyData';
import { Player, useTournament } from '../../store/TournamentContext';
import { getHoleResult, getMatchStatus, getStrokesForHole } from '../../utils/golfLogic';

// 1. HELPER: Calculate the Skin Winner
const getSkinWinner = (scores: string[], hcs: number[], si: number, playerNames: string[]) => {
  const netScores = scores.map((s, i) => {
    const gross = parseInt(s);
    if (isNaN(gross)) return null;
    const pops = getStrokesForHole(hcs[i] || 0, si);
    return gross - pops;
  });

  const validNetScores = netScores.filter((s): s is number => s !== null);
  if (validNetScores.length < 2) return null;

  const minScore = Math.min(...validNetScores);
  const winners = netScores.map((s, i) => (s === minScore ? playerNames[i] : null)).filter(Boolean);

  return winners.length === 1 ? winners[0] : 'Tied';
};

// Define the Interface for the HoleInput props to fix "Implicit Any" errors
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
  
  if (!config || !config.players) {
    return <View style={styles.centered}><Text>Waiting for tournament setup...</Text></View>;
  }

  // Cast the course to the specific keys in TorreyData to fix the 'any' index error
  const courseKey = config.course as keyof typeof COURSES;
  const side = config.segmentLength === 9 ? 'front9' : 'back9';
  const holeData = COURSES[courseKey][side];
  
  const [allScores, setAllScores] = useState<string[][]>(Array(9).fill(['', '', '', '']));

  const handleScoreChange = (holeIdx: number, playerIdx: number, val: string) => {
    const newScores = [...allScores];
    const updatedHole = [...newScores[holeIdx]];
    updatedHole[playerIdx] = val;
    newScores[holeIdx] = updatedHole;
    setAllScores(newScores);
  };

  const matchHistory = holeData.map((hole: any, idx: number) => {
    const scores = allScores[idx].map(Number);
    const requiredPlayers = config.format === 'TOTALS' ? 4 : 2;
    const filledScores = allScores[idx].filter(s => s !== '').length;
    if (filledScores < requiredPlayers) return null; 
    
    return getHoleResult(
      config.format, 
      scores, 
      config.players.map((p: Player) => p.hc), 
      hole.si
    );
  }).filter((result): result is 'WIN' | 'LOSS' | 'PUSH' => result !== null);

  return (
    <View style={styles.container}>
      <MatchBanner 
        segmentName={`${config.course} - ${config.format}`} 
        status={getMatchStatus(matchHistory)} 
      />
      
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {holeData.map((hole: any, idx: number) => {
          const skinWinner = getSkinWinner(
            allScores[idx], 
            config.players.map((p: Player) => p.hc), 
            hole.si, 
            config.players.map((p: Player) => p.name)
          );

          return (
            <View key={idx} style={styles.holeRow}>
              <View style={styles.holeInfo}>
                <Text style={styles.holeNum}>Hole {hole.hole}</Text>
                <Text style={styles.siText}>SI: {hole.si} • Par {hole.par}</Text>
                {skinWinner && (
                  <Text style={[styles.skinText, skinWinner === 'Tied' ? {} : styles.skinWon]}>
                    Skin: {skinWinner}
                  </Text>
                )}
              </View>
              
              <HoleInput 
                format={config.format}
                scores={allScores[idx]}
                playerNames={config.players.map((p: Player) => p.name)}
                hcs={config.players.map((p: Player) => p.hc)}
                si={hole.si}
                onScoreChange={(pIdx: number, val: string) => handleScoreChange(idx, pIdx, val)}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  holeRow: { 
    padding: 15, 
    borderBottomWidth: 1, 
    borderColor: '#eee', 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  holeInfo: { flex: 1 },
  holeNum: { fontSize: 18, fontWeight: 'bold' },
  siText: { fontSize: 12, color: '#666' },
  skinText: { fontSize: 11, color: '#999', marginTop: 4, fontStyle: 'italic' },
  skinWon: { color: '#059669', fontWeight: 'bold', fontStyle: 'normal' },
  inputRowContainer: { flexDirection: 'row', gap: 10 },
  inputGroup: { alignItems: 'center' },
  label: { fontSize: 10, color: '#999', marginBottom: 2, fontWeight: 'bold' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 6,
    width: 35, height: 35, textAlign: 'center',
    fontSize: 16, backgroundColor: '#fdfdfd'
  }
});