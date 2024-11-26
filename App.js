import React, { useState, useCallback } from 'react';
import { 
  RefreshControl, 
  ScrollView, 
  StyleSheet, 
  View, 
  Linking,
  Platform 
} from 'react-native';
import { 
  Card, 
  Text, 
  ActivityIndicator, 
  List, 
  useTheme,
  Provider as PaperProvider,
  MD3LightTheme
} from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';

const API_URL = 'http://localhost:3000/api';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#E10600',
    secondary: '#1F1F1F',
    background: '#F5F5F5',
  },
};

function NewsApp() {
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [articles, setArticles] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [summaryRes, articlesRes] = await Promise.all([
        fetch(`${API_URL}/summary`),
        fetch(`${API_URL}/articles`)
      ]);

      const summaryData = await summaryRes.json();
      const articlesData = await articlesRes.json();

      setSummary(summaryData.summary);
      setArticles(articlesData);
      setLastUpdated(summaryData.lastUpdated);
    } catch (err) {
      setError('Failed to load news. Pull to refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch(`${API_URL}/refresh`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError('Refresh failed. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.scrollView}
      >
        {error ? (
          <Card style={styles.errorCard}>
            <Card.Content>
              <Text variant="bodyLarge" style={styles.errorText}>{error}</Text>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleLarge" style={styles.title}>F1 News Summary</Text>
                <Text variant="bodyMedium" style={styles.summary}>{summary}</Text>
                {lastUpdated && (
                  <Text variant="bodySmall" style={styles.timestamp}>
                    Last updated: {format(new Date(lastUpdated), 'PPp')}
                  </Text>
                )}
              </Card.Content>
            </Card>

            <Card style={styles.articlesCard}>
              <Card.Content>
                <Text variant="titleLarge" style={styles.title}>Latest Articles</Text>
                {articles.map((article, index) => (
                  <List.Item
                    key={index}
                    title={article.title}
                    description={`${article.source} • ${format(new Date(article.publishDate), 'PP')}`}
                    left={props => <MaterialCommunityIcons name="newspaper" size={24} color={theme.colors.primary} />}
                    onPress={() => Linking.openURL(article.url)}
                    style={styles.articleItem}
                  />
                ))}
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCard: {
    margin: 16,
    elevation: 4,
    borderRadius: 12,
  },
  articlesCard: {
    margin: 16,
    marginTop: 0,
    elevation: 4,
    borderRadius: 12,
  },
  errorCard: {
    margin: 16,
    backgroundColor: '#FFE5E5',
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 12,
    color: theme.colors.secondary,
  },
  summary: {
    lineHeight: 24,
    marginBottom: 16,
  },
  timestamp: {
    color: theme.colors.secondary,
    opacity: 0.7,
  },
  articleItem: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.secondary + '20',
  },
  errorText: {
    color: theme.colors.error,
    textAlign: 'center',
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NewsApp />
      </PaperProvider>
    </SafeAreaProvider>
  );
}