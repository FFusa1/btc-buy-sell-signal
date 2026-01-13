import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface Indicators {
  sma7: number;
  sma25: number;
  rsi: number;
  momentum: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

interface ShortTermSignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  timeframe: string;
}

interface PatternSignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  patterns: string[];
  timeframe: string;
}

interface SignalData {
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  indicators: Indicators;
  recentCandles: Kline[];
  shortTermSignal: ShortTermSignal;
  fiveMinSignal: ShortTermSignal;
  patternSignal: PatternSignal;
}

export function useBinanceSignals(refreshInterval: number = 30000) {
  const [data, setData] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      setError(null);
      
      // Add cache-busting timestamp to force fresh data
      const { data: responseData, error: fnError } = await supabase.functions.invoke('binance-signals', {
        body: { timestamp: Date.now() }
      });
      
      if (fnError) {
        throw new Error(fnError.message);
      }
      
      if (responseData.error) {
        throw new Error(responseData.error);
      }
      
      setData(responseData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching signals:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch signals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    
    const interval = setInterval(fetchSignals, refreshInterval);
    
    return () => clearInterval(interval);
  }, [fetchSignals, refreshInterval]);

  return { data, loading, error, lastUpdated, refetch: fetchSignals };
}
