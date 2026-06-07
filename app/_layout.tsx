import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DatabaseProvider } from '@/context/DatabaseContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DatabaseProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="transaction/add" options={{ presentation: 'modal', headerShown: false, gestureEnabled: true }} />
            <Stack.Screen name="settings/wallets" options={{ headerShown: false }} />
            <Stack.Screen name="settings/categories" options={{ headerShown: false }} />
            <Stack.Screen name="manage/recurring" options={{ headerShown: false }} />
            <Stack.Screen name="manage/tags" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}
