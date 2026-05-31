// Provides the initialized SQLite connection to the whole app.
//
// The DB opens/migrates/seeds asynchronously once on mount. While that runs we
// render `fallback`; if it fails we show a loud, useful error (never a silent
// blank screen) because the app is unusable without its data store.

import type { SQLiteDatabase } from 'expo-sqlite';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { initializeDatabase } from '@/db';

interface DatabaseContextValue {
  db: SQLiteDatabase;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

interface DatabaseProviderProps {
  children: ReactNode;
  /** Shown while the DB initializes. Defaults to a centered spinner. */
  fallback?: ReactNode;
}

export function DatabaseProvider({ children, fallback }: DatabaseProviderProps) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    initializeDatabase()
      .then((database) => {
        if (!cancelled) {
          setDb(database);
        }
      })
      .catch((err: unknown) => {
        // Fail loudly with context — this is unrecoverable for the user.
        console.error('[Fintom] Database initialization failed:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn&apos;t open your data</Text>
        <Text style={styles.errorBody}>
          Fintom couldn&apos;t open its database, so it can&apos;t start. Try reopening the app.
          If this keeps happening, restore from your latest iCloud backup.
        </Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  if (!db) {
    return (
      <>
        {fallback ?? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        )}
      </>
    );
  }

  return <DatabaseContext.Provider value={{ db }}>{children}</DatabaseContext.Provider>;
}

/**
 * Access the live SQLite connection. Throws if used outside DatabaseProvider —
 * that's a programming error we want surfaced immediately, not swallowed.
 */
export function useDatabase(): SQLiteDatabase {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useDatabase must be used within a <DatabaseProvider>.');
  }
  return ctx.db;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center',
    color: '#555',
  },
  errorDetail: {
    fontSize: 12,
    textAlign: 'center',
    color: '#999',
  },
});
