import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

interface Props {
  format: 'TOTALS' | 'SINGLES' | 'SCRAMBLE' | 'ALTSHOT';
  scores: string[];
  onScoreChange: (index: number, value: string) => void;
  playerNames: string[];
}

export function HoleInput({ format, scores, onScoreChange, playerNames }: Props) {
  // Determine which players need to enter scores based on format
  const visibleIndices = format === 'TOTALS' ? [0, 1, 2, 3] : [0, 2];

  return (
    <View style={styles.container}>
      {visibleIndices.map((idx) => (
        <View key={idx} style={styles.inputGroup}>
          <Text style={styles.label}>{playerNames[idx].substring(0, 3)}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={scores[idx]}
            onChangeText={(val) => onScoreChange(idx, val)}
            placeholder="-"
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 10 },
  inputGroup: { alignItems: 'center' },
  label: { fontSize: 10, color: '#999', marginBottom: 2, fontWeight: 'bold' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    width: 35,
    height: 35,
    textAlign: 'center',
    fontSize: 16,
    backgroundColor: '#fdfdfd'
  }
});