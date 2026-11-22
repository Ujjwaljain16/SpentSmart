import * as SplashScreen from 'expo-splash-screen';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DatabaseOpenError, openRepositories, resetDatabaseFile } from '@/db/client';
import { Repositories } from '@/db/repositories';
import { log } from '@/lib/logger';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const RepositoriesContext = createContext<Repositories | null>(null);

type State =
  | { status: 'loading' }
  | { status: 'ready'; repos: Repositories }
  | { status: 'error'; message: string };

/**
 * Opens the encrypted database before anything else renders. On failure it shows a recovery screen
 * instead of continuing with an empty store; data is only ever deleted by an explicit, confirmed reset.
 */
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const open = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', repos: await openRepositories() });
    } catch (error) {
      log.error('Database unavailable', error);
      setState({
        status: 'error',
        message: error instanceof DatabaseOpenError ? error.message : 'The local database could not be opened.',
      });
    }
  }, []);

  useEffect(() => {
    void open();
  }, [open]);

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [state.status]);

  const confirmReset = () => {
    Alert.alert(
      'Erase local data?',
      'This permanently deletes everything SpentSmart has stored on this device, including your transactions. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase and start fresh',
          style: 'destructive',
          onPress: async () => {
            await resetDatabaseFile();
            await open();
          },
        },
      ],
    );
  };

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#14B8A6" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Can’t open your data</Text>
        <Text style={styles.body}>{state.message}</Text>
        <Text style={styles.body}>Your data has not been changed. You can try again, or erase it and start fresh.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Try again" style={styles.primary} onPress={() => void open()}>
          <Text style={styles.primaryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Erase local data" style={styles.secondary} onPress={confirmReset}>
          <Text style={styles.secondaryText}>Erase local data…</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <RepositoriesContext.Provider value={state.repos}>{children}</RepositoriesContext.Provider>;
}

export function useRepos(): Repositories {
  const repos = useContext(RepositoriesContext);
  if (!repos) throw new Error('useRepos must be used inside <DatabaseProvider>');
  return repos;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0F0F0F', gap: 12 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  body: { color: '#A1A1AA', fontSize: 15, textAlign: 'center' },
  primary: { backgroundColor: '#14B8A6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  primaryText: { color: '#0F0F0F', fontWeight: '700', fontSize: 16 },
  secondary: { paddingHorizontal: 24, paddingVertical: 12 },
  secondaryText: { color: '#F87171', fontSize: 15 },
});
