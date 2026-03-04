import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  status: string;      // e.g., "Team A 2 Up"
  segmentName: string; // e.g., "Segment 1: Totals"
}

export function MatchBanner({ status, segmentName }: Props) {
  const isAllSquare = status === "All Square";

  return (
    <View style={styles.container}>
      <Text style={styles.segmentText}>{segmentName.toUpperCase()}</Text>
      <View style={[styles.pill, isAllSquare ? styles.neutral : styles.active]}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 15,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  segmentText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // Elevation for Android
    elevation: 3,
  },
  neutral: { backgroundColor: '#4b5563' }, // Gray for All Square
  active: { backgroundColor: '#1e3a8a' },  // Deep Blue for a Lead
  statusText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
  },
});