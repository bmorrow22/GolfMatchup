import { Stack } from 'expo-router';
// DOUBLE CHECK THIS PATH: 
// Use '../store/TournamentContext' if 'store' is outside 'app'
// Use './store/TournamentContext' if 'store' is inside 'app'
import { TournamentProvider } from '../store/TournamentContext';

export default function RootLayout() {
  return (
    <TournamentProvider>
      <Stack>
        {/* This name MUST match your folder name (tabs) */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </TournamentProvider>
  );
}