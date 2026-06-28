import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory cache to prevent rate limiting
const cacheStore: { data: unknown | null; timestamp: number } = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 2000; // Cache for 2 seconds

// Mirror hosts to try in order. data-api.binance.vision is the public market-data
// mirror and is not geo-restricted (api.binance.com returns 451 from many regions
// including Supabase edge runtime).
const BINANCE_HOSTS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

// Fetch with retry logic for rate limiting + host failover for 451/418/403
async function fetchWithRetry(url: string, retries = 3, delay = 500): Promise<Response> {
  // Build candidate URLs by swapping the host
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const candidates = BINANCE_HOSTS.map(h => h + path);

  let lastResponse: Response | null = null;
  for (let i = 0; i < retries; i++) {
    for (const candidate of candidates) {
      const response = await fetch(candidate);
      if (response.status === 429) {
        console.log(`Rate limited on ${candidate}, backing off ${delay}ms`);
        lastResponse = response;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      if (response.status === 451 || response.status === 403 || response.status === 418) {
        console.log(`Host blocked (${response.status}) at ${candidate}, trying next host`);
        lastResponse = response;
        continue;
      }
      return response;
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error('Binance API unreachable from all mirrors.');
}

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
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

interface SupportResistance {
  support: number[];
  resistance: number[];
  strongestSupport: number;
  strongestResistance: number;
}

interface PricePrediction {
  predictedPrice: number;
  predictedChange: number;
  predictedChangePercent: number;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  confidence: number;
  lowEstimate: number;
  highEstimate: number;
  method: string;
}

interface AnalysisResult {
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  indicators: {
    sma7: number;
    sma25: number;
    rsi: number;
    momentum: number;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  recentCandles: Kline[];
  shortTermSignal: ShortTermSignal;
  fiveMinSignal: ShortTermSignal;
  patternSignal: PatternSignal;
  thirtyMinPatternSignal: PatternSignal;
  fiveMinPatternSignal: PatternSignal;
  thirtySecPatternSignal: PatternSignal;
  supportResistance: SupportResistance;
  pricePrediction: PricePrediction;
  masterSignal: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    actionable: boolean;
    threshold: number;
    agreement: number;
    votes: { source: string; signal: string; weight: number }[];
    reason: string;
  };
}

// Calculate Simple Moving Average
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

// EMA full series
function emaSeries(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = prices[0];
  for (let i = 0; i < prices.length; i++) {
    ema = i === 0 ? prices[0] : prices[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function calculateEMA(prices: number[], period: number): number {
  const s = emaSeries(prices, period);
  return s[s.length - 1];
}

// MACD (12, 26, 9)
function calculateMACD(prices: number[]): { macd: number; signal: number; hist: number; prevHist: number } {
  if (prices.length < 35) return { macd: 0, signal: 0, hist: 0, prevHist: 0 };
  const ema12 = emaSeries(prices, 12);
  const ema26 = emaSeries(prices, 26);
  const macdLine: number[] = ema12.map((v, i) => v - ema26[i]);
  const signalLine = emaSeries(macdLine, 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = signalLine[signalLine.length - 2];
  return { macd, signal, hist: macd - signal, prevHist: prevMacd - prevSignal };
}

// Bollinger Bands
function calculateBollinger(prices: number[], period = 20, mult = 2) {
  const p = prices[prices.length - 1];
  if (prices.length < period) return { upper: p, lower: p, mid: p, pctB: 0.5, width: 0 };
  const slice = prices.slice(-period);
  const mid = slice.reduce((s, x) => s + x, 0) / period;
  const variance = slice.reduce((s, x) => s + (x - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const range = upper - lower || 1;
  return { upper, lower, mid, pctB: (p - lower) / range, width: range / mid };
}

// RSI (Wilder smoothing)
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change; else losses += Math.abs(change);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - period];
  return ((current - past) / past) * 100;
}

function volumeRatio(klines: Kline[], short = 5, long = 20): number {
  if (klines.length < long) return 1;
  const vols = klines.map(k => k.volume);
  const s = vols.slice(-short).reduce((a, b) => a + b, 0) / short;
  const l = vols.slice(-long).reduce((a, b) => a + b, 0) / long;
  return l === 0 ? 1 : s / l;
}

// ATR (Average True Range) as % of price — measures volatility / chop
function calculateATRPct(klines: Kline[], period = 14): number {
  if (klines.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const h = klines[i].high, l = klines[i].low, pc = klines[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atr = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  const last = klines[klines.length - 1].close;
  return last === 0 ? 0 : (atr / last) * 100;
}

// EMA slope: % change of EMA50 over last `look` candles — trend strength & direction
function emaSlope(prices: number[], period = 50, look = 5): number {
  const s = emaSeries(prices, period);
  if (s.length < look + 1) return 0;
  const now = s[s.length - 1];
  const past = s[s.length - 1 - look];
  return past === 0 ? 0 : ((now - past) / past) * 100;
}

// Persistence cache: master signal must repeat across consecutive scans to fire
const signalHistory: { last: 'BUY' | 'SELL' | 'HOLD'; streak: number } = { last: 'HOLD', streak: 0 };


// Multi-indicator confluence analysis
function analyzePrice(klines: Kline[]): { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reason: string; indicators: any; } {
  const closePrices = klines.map(k => k.close);
  const currentPrice = closePrices[closePrices.length - 1];

  const sma7 = calculateSMA(closePrices, 7);
  const sma25 = calculateSMA(closePrices, 25);
  const ema9 = calculateEMA(closePrices, 9);
  const ema21 = calculateEMA(closePrices, 21);
  const ema50 = closePrices.length >= 50 ? calculateEMA(closePrices, 50) : sma25;
  const rsi = calculateRSI(closePrices, 14);
  const momentum = calculateMomentum(closePrices, 10);
  const macd = calculateMACD(closePrices);
  const bb = calculateBollinger(closePrices, 20, 2);
  const vRatio = volumeRatio(klines, 5, 20);

  let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (ema9 > ema21 && ema21 > ema50 && currentPrice > ema21) trend = 'BULLISH';
  else if (ema9 < ema21 && ema21 < ema50 && currentPrice < ema21) trend = 'BEARISH';

  let buyScore = 0, sellScore = 0;
  const reasons: string[] = [];

  if (ema9 > ema21) { buyScore += 15; reasons.push('EMA9 above EMA21'); }
  else { sellScore += 15; reasons.push('EMA9 below EMA21'); }

  if (currentPrice > ema50) { buyScore += 10; reasons.push('Price above EMA50'); }
  else { sellScore += 10; reasons.push('Price below EMA50'); }

  if (sma7 > sma25) buyScore += 8; else sellScore += 8;

  if (macd.hist > 0 && macd.prevHist <= 0) { buyScore += 20; reasons.push('MACD bullish cross'); }
  else if (macd.hist < 0 && macd.prevHist >= 0) { sellScore += 20; reasons.push('MACD bearish cross'); }
  else if (macd.hist > 0) { buyScore += 12; reasons.push('MACD histogram positive'); }
  else { sellScore += 12; reasons.push('MACD histogram negative'); }

  if (rsi < 30) { buyScore += 15; reasons.push('RSI oversold'); }
  else if (rsi > 70) { sellScore += 15; reasons.push('RSI overbought'); }
  else if (rsi > 55) buyScore += 7;
  else if (rsi < 45) sellScore += 7;

  if (momentum > 1) { buyScore += 10; reasons.push('Strong positive momentum'); }
  else if (momentum < -1) { sellScore += 10; reasons.push('Strong negative momentum'); }
  else if (momentum > 0) buyScore += 4;
  else sellScore += 4;

  if (bb.pctB < 0.15) { buyScore += 10; reasons.push('Near lower Bollinger band'); }
  else if (bb.pctB > 0.85) { sellScore += 10; reasons.push('Near upper Bollinger band'); }
  else if (bb.pctB < 0.4) buyScore += 4;
  else if (bb.pctB > 0.6) sellScore += 4;

  if (vRatio > 1.3) {
    if (buyScore > sellScore) { buyScore += 10; reasons.push('Rising volume confirms buyers'); }
    else { sellScore += 10; reasons.push('Rising volume confirms sellers'); }
  } else if (vRatio < 0.7) {
    buyScore = Math.max(0, buyScore - 5);
    sellScore = Math.max(0, sellScore - 5);
    reasons.push('Low volume — weak conviction');
  }

  const totalScore = buyScore + sellScore || 1;
  const buyConfidence = (buyScore / totalScore) * 100;

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  let reason = 'Market conditions are mixed';

  if (buyConfidence >= 62) {
    signal = 'BUY';
    confidence = buyConfidence;
    reason = reasons.filter(r => /above|positive|oversold|bullish|lower Bollinger|buyers/i.test(r)).slice(0, 4).join('. ');
  } else if (buyConfidence <= 38) {
    signal = 'SELL';
    confidence = 100 - buyConfidence;
    reason = reasons.filter(r => /below|negative|overbought|bearish|upper Bollinger|sellers/i.test(r)).slice(0, 4).join('. ');
  }

  return {
    signal,
    confidence: Math.round(confidence),
    reason: reason || 'Mixed signals',
    indicators: {
      sma7, sma25,
      rsi: Math.round(rsi * 100) / 100,
      momentum: Math.round(momentum * 100) / 100,
      trend
    }
  };
}

// Short-term confluence (1m / 5m)
function analyzeShortTerm(klines: Kline[]): { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reason: string; } {
  const closePrices = klines.map(k => k.close);

  const ema5 = calculateEMA(closePrices, 5);
  const ema13 = calculateEMA(closePrices, 13);
  const rsi = calculateRSI(closePrices, 7);
  const momentum = calculateMomentum(closePrices, 5);
  const macd = calculateMACD(closePrices);
  const bbPeriod = Math.min(20, Math.max(5, closePrices.length - 1));
  const bb = calculateBollinger(closePrices, bbPeriod, 2);
  const vRatio = volumeRatio(klines, 3, Math.min(15, klines.length));

  let buyScore = 0, sellScore = 0;
  const reasons: string[] = [];

  if (ema5 > ema13) { buyScore += 20; reasons.push('EMA5 above EMA13'); }
  else { sellScore += 20; reasons.push('EMA5 below EMA13'); }

  if (macd.hist > 0 && macd.prevHist <= 0) { buyScore += 20; reasons.push('MACD bullish cross'); }
  else if (macd.hist < 0 && macd.prevHist >= 0) { sellScore += 20; reasons.push('MACD bearish cross'); }
  else if (macd.hist > 0) buyScore += 10;
  else sellScore += 10;

  if (rsi < 30) { buyScore += 18; reasons.push('Short-term oversold'); }
  else if (rsi > 70) { sellScore += 18; reasons.push('Short-term overbought'); }
  else if (rsi > 55) buyScore += 6;
  else if (rsi < 45) sellScore += 6;

  if (momentum > 0.15) { buyScore += 15; reasons.push('Positive short momentum'); }
  else if (momentum < -0.15) { sellScore += 15; reasons.push('Negative short momentum'); }

  if (bb.pctB < 0.15) { buyScore += 10; reasons.push('Near lower band'); }
  else if (bb.pctB > 0.85) { sellScore += 10; reasons.push('Near upper band'); }

  const last3 = closePrices.slice(-3);
  const upCandles = last3.filter((p, i) => i > 0 && p > last3[i - 1]).length;
  if (upCandles >= 2) { buyScore += 10; reasons.push('Recent uptrend'); }
  else if (upCandles === 0) { sellScore += 10; reasons.push('Recent downtrend'); }

  if (vRatio > 1.3) {
    if (buyScore > sellScore) buyScore += 8; else sellScore += 8;
  } else if (vRatio < 0.7) {
    buyScore = Math.max(0, buyScore - 4);
    sellScore = Math.max(0, sellScore - 4);
  }

  const totalScore = buyScore + sellScore || 1;
  const buyConfidence = (buyScore / totalScore) * 100;

  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  let reason = 'Short-term neutral';

  if (buyConfidence >= 62) {
    signal = 'BUY';
    confidence = buyConfidence;
    reason = reasons.filter(r => /above|Positive|oversold|bullish|lower|uptrend/i.test(r)).slice(0, 3).join('. ');
  } else if (buyConfidence <= 38) {
    signal = 'SELL';
    confidence = 100 - buyConfidence;
    reason = reasons.filter(r => /below|Negative|overbought|bearish|upper|downtrend/i.test(r)).slice(0, 3).join('. ');
  }

  return {
    signal,
    confidence: Math.round(confidence),
    reason: reason || 'Mixed short-term signals'
  };
}

// Detect candlestick pattern type
function detectCandlePattern(candle: Kline): string | null {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const isBullish = candle.close > candle.open;
  
  // Doji - very small body relative to range
  if (body < range * 0.1 && range > 0) {
    if (upperWick > body * 2 && lowerWick > body * 2) {
      return 'DOJI';
    }
    if (lowerWick > body * 3 && upperWick < body) {
      return 'DRAGONFLY_DOJI';
    }
    if (upperWick > body * 3 && lowerWick < body) {
      return 'GRAVESTONE_DOJI';
    }
    return 'DOJI';
  }
  
  // Hammer / Hanging Man - small body at top, long lower wick
  if (lowerWick > body * 2 && upperWick < body * 0.5 && body > 0) {
    return isBullish ? 'HAMMER' : 'HANGING_MAN';
  }
  
  // Shooting Star / Inverted Hammer - small body at bottom, long upper wick
  if (upperWick > body * 2 && lowerWick < body * 0.5 && body > 0) {
    return isBullish ? 'INVERTED_HAMMER' : 'SHOOTING_STAR';
  }
  
  // Marubozu - big candle with almost no wicks
  if (body > range * 0.9 && range > 0) {
    return isBullish ? 'BULLISH_MARUBOZU' : 'BEARISH_MARUBOZU';
  }
  
  // Big candle - large body
  if (body > range * 0.7 && range > 0) {
    return isBullish ? 'BIG_BULLISH' : 'BIG_BEARISH';
  }
  
  // Spinning top - small body, equal wicks
  if (body < range * 0.3 && Math.abs(upperWick - lowerWick) < range * 0.2) {
    return 'SPINNING_TOP';
  }
  
  return null;
}

// Analyze candlestick patterns for trading signals
function analyzeCandlePatterns(klines: Kline[]): PatternSignal {
  const recentCandles = klines.slice(-10);
  const patterns: string[] = [];
  let buyScore = 0;
  let sellScore = 0;
  const reasons: string[] = [];
  
  // Analyze each candle for patterns
  recentCandles.forEach((candle, index) => {
    const pattern = detectCandlePattern(candle);
    if (pattern) {
      patterns.push(pattern);
      
      // Score patterns based on bullish/bearish implications
      switch (pattern) {
        case 'HAMMER':
          buyScore += 20;
          reasons.push('Hammer pattern (bullish reversal)');
          break;
        case 'INVERTED_HAMMER':
          buyScore += 15;
          reasons.push('Inverted Hammer (potential bullish)');
          break;
        case 'DRAGONFLY_DOJI':
          buyScore += 18;
          reasons.push('Dragonfly Doji (bullish signal)');
          break;
        case 'BULLISH_MARUBOZU':
          buyScore += 25;
          reasons.push('Bullish Marubozu (strong buying)');
          break;
        case 'BIG_BULLISH':
          buyScore += 20;
          reasons.push('Big Bullish candle');
          break;
        case 'SHOOTING_STAR':
          sellScore += 20;
          reasons.push('Shooting Star (bearish reversal)');
          break;
        case 'HANGING_MAN':
          sellScore += 18;
          reasons.push('Hanging Man (bearish warning)');
          break;
        case 'GRAVESTONE_DOJI':
          sellScore += 18;
          reasons.push('Gravestone Doji (bearish signal)');
          break;
        case 'BEARISH_MARUBOZU':
          sellScore += 25;
          reasons.push('Bearish Marubozu (strong selling)');
          break;
        case 'BIG_BEARISH':
          sellScore += 20;
          reasons.push('Big Bearish candle');
          break;
        case 'DOJI':
        case 'SPINNING_TOP':
          // Neutral - indicate indecision
          buyScore += 5;
          sellScore += 5;
          break;
      }
    }
  });
  
  // Check for engulfing patterns (2-candle pattern)
  for (let i = 1; i < recentCandles.length; i++) {
    const prev = recentCandles[i - 1];
    const curr = recentCandles[i];
    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    
    // Bullish Engulfing
    if (prev.close < prev.open && curr.close > curr.open && 
        curr.open <= prev.close && curr.close >= prev.open && currBody > prevBody) {
      patterns.push('BULLISH_ENGULFING');
      buyScore += 25;
      reasons.push('Bullish Engulfing pattern');
    }
    
    // Bearish Engulfing
    if (prev.close > prev.open && curr.close < curr.open && 
        curr.open >= prev.close && curr.close <= prev.open && currBody > prevBody) {
      patterns.push('BEARISH_ENGULFING');
      sellScore += 25;
      reasons.push('Bearish Engulfing pattern');
    }
  }
  
  // If no patterns found, add neutral score
  if (patterns.length === 0) {
    buyScore = 50;
    sellScore = 50;
  }
  
  const totalScore = buyScore + sellScore;
  const buyConfidence = totalScore > 0 ? (buyScore / totalScore) * 100 : 50;
  
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  let reason = 'No clear candlestick patterns detected';
  
  if (buyConfidence > 55) {
    signal = 'BUY';
    confidence = buyConfidence;
    reason = [...new Set(reasons.filter(r => 
      r.includes('bullish') || r.includes('Bullish') || r.includes('Hammer') || r.includes('Dragonfly')
    ))].slice(0, 3).join('. ') || 'Bullish patterns detected';
  } else if (buyConfidence < 45) {
    signal = 'SELL';
    confidence = 100 - buyConfidence;
    reason = [...new Set(reasons.filter(r => 
      r.includes('bearish') || r.includes('Bearish') || r.includes('Shooting') || r.includes('Hanging') || r.includes('Gravestone')
    ))].slice(0, 3).join('. ') || 'Bearish patterns detected';
  }
  
  return {
    signal,
    confidence: Math.round(confidence),
    reason,
    patterns: [...new Set(patterns)],
    timeframe: '1 hour'
  };
}

// Calculate support and resistance levels
function calculateSupportResistance(klines: Kline[]): SupportResistance {
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const currentPrice = klines[klines.length - 1].close;
  
  // Find pivot points (local highs and lows)
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  
  for (let i = 2; i < klines.length - 2; i++) {
    // Pivot high: higher than 2 candles before and after
    if (klines[i].high > klines[i-1].high && klines[i].high > klines[i-2].high &&
        klines[i].high > klines[i+1].high && klines[i].high > klines[i+2].high) {
      pivotHighs.push(klines[i].high);
    }
    // Pivot low: lower than 2 candles before and after
    if (klines[i].low < klines[i-1].low && klines[i].low < klines[i-2].low &&
        klines[i].low < klines[i+1].low && klines[i].low < klines[i+2].low) {
      pivotLows.push(klines[i].low);
    }
  }
  
  // Cluster similar levels together (within 0.3% range)
  const clusterLevels = (levels: number[]): number[] => {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];
    
    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const lastValue = lastCluster[lastCluster.length - 1];
      // If within 0.3% of last value, add to cluster
      if ((sorted[i] - lastValue) / lastValue < 0.003) {
        lastCluster.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }
    
    // Return average of each cluster, weighted by size
    return clusters
      .filter(c => c.length >= 1)
      .map(c => c.reduce((sum, v) => sum + v, 0) / c.length)
      .sort((a, b) => b - a);
  };
  
  const resistanceLevels = clusterLevels(pivotHighs.filter(h => h > currentPrice)).slice(0, 3);
  const supportLevels = clusterLevels(pivotLows.filter(l => l < currentPrice)).slice(0, 3).reverse();
  
  // Calculate key levels using recent price action
  const recentHigh = Math.max(...highs.slice(-24));
  const recentLow = Math.min(...lows.slice(-24));
  
  // Add recent high/low if not already in levels
  if (!resistanceLevels.some(r => Math.abs(r - recentHigh) / recentHigh < 0.003)) {
    if (recentHigh > currentPrice) resistanceLevels.push(recentHigh);
  }
  if (!supportLevels.some(s => Math.abs(s - recentLow) / recentLow < 0.003)) {
    if (recentLow < currentPrice) supportLevels.unshift(recentLow);
  }
  
  // Sort and get top levels
  const sortedResistance = resistanceLevels.sort((a, b) => a - b).slice(0, 3);
  const sortedSupport = supportLevels.sort((a, b) => b - a).slice(0, 3);
  
  return {
    support: sortedSupport,
    resistance: sortedResistance,
    strongestSupport: sortedSupport[0] || recentLow,
    strongestResistance: sortedResistance[0] || recentHigh
  };
}

// Predict price in 1 hour using momentum, trend, and volatility
function predictPrice1Hour(klines: Kline[], hourlyAnalysis: any): PricePrediction {
  const closePrices = klines.map(k => k.close);
  const currentPrice = closePrices[closePrices.length - 1];
  
  // Calculate average hourly change over recent candles
  const recentChanges: number[] = [];
  for (let i = Math.max(1, closePrices.length - 12); i < closePrices.length; i++) {
    recentChanges.push((closePrices[i] - closePrices[i - 1]) / closePrices[i - 1]);
  }
  const avgChange = recentChanges.reduce((s, c) => s + c, 0) / recentChanges.length;
  
  // Weighted momentum: recent changes matter more
  const weights = recentChanges.map((_, i) => i + 1);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const weightedChange = recentChanges.reduce((s, c, i) => s + c * weights[i], 0) / totalWeight;
  
  // Volatility for confidence and range
  const volatility = Math.sqrt(recentChanges.reduce((s, c) => s + (c - avgChange) ** 2, 0) / recentChanges.length);
  
  // RSI adjustment
  const rsi = hourlyAnalysis.indicators.rsi;
  let rsiAdjust = 0;
  if (rsi > 70) rsiAdjust = -0.001 * ((rsi - 70) / 30); // overbought drag
  else if (rsi < 30) rsiAdjust = 0.001 * ((30 - rsi) / 30); // oversold boost
  
  // Blend signals
  const predictedChangePercent = (weightedChange * 0.6 + avgChange * 0.3 + rsiAdjust * 0.1) * 100;
  const predictedChange = currentPrice * (predictedChangePercent / 100);
  const predictedPrice = currentPrice + predictedChange;
  
  // Range estimates based on volatility
  const rangeMultiplier = 1.5;
  const lowEstimate = currentPrice + predictedChange - (currentPrice * volatility * rangeMultiplier);
  const highEstimate = currentPrice + predictedChange + (currentPrice * volatility * rangeMultiplier);
  
  // Confidence: lower volatility = higher confidence
  const confidence = Math.max(20, Math.min(85, 70 - (volatility * 10000)));
  
  const direction: 'UP' | 'DOWN' | 'NEUTRAL' = 
    predictedChangePercent > 0.02 ? 'UP' : 
    predictedChangePercent < -0.02 ? 'DOWN' : 'NEUTRAL';
  
  return {
    predictedPrice,
    predictedChange,
    predictedChangePercent,
    direction,
    confidence: Math.round(confidence),
    lowEstimate,
    highEstimate,
    method: 'Weighted momentum + RSI + volatility'
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check cache first
    if (cacheStore.data && Date.now() - cacheStore.timestamp < CACHE_TTL_MS) {
      console.log('Returning cached data');
      return new Response(JSON.stringify(cacheStore.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('Fetching Binance BTCUSDT data...');
    
    // Fetch all klines in parallel with retry logic
    const [hourlyResponse, minuteResponse, fiveMinResponse, thirtyMinResponse, oneSecResponse] = await Promise.all([
      fetchWithRetry('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100'),
      fetchWithRetry('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=30'),
      fetchWithRetry('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=30'),
      fetchWithRetry('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=30m&limit=30'),
      fetchWithRetry('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&limit=300')
    ]);
    
    if (!hourlyResponse.ok) {
      throw new Error(`Binance API error (hourly): ${hourlyResponse.status}`);
    }
    if (!minuteResponse.ok) {
      throw new Error(`Binance API error (minute): ${minuteResponse.status}`);
    }
    if (!fiveMinResponse.ok) {
      throw new Error(`Binance API error (5min): ${fiveMinResponse.status}`);
    }
    if (!thirtyMinResponse.ok) {
      throw new Error(`Binance API error (30min): ${thirtyMinResponse.status}`);
    }
    if (!oneSecResponse.ok) {
      throw new Error(`Binance API error (1s): ${oneSecResponse.status}`);
    }
    
    const rawHourlyKlines = await hourlyResponse.json();
    const rawMinuteKlines = await minuteResponse.json();
    const rawFiveMinKlines = await fiveMinResponse.json();
    const rawThirtyMinKlines = await thirtyMinResponse.json();
    const rawOneSecKlines = await oneSecResponse.json();
    
    const parseKlines = (raw: any[]): Kline[] => raw.map((k: any[]) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6]
    }));
    
    const hourlyKlines = parseKlines(rawHourlyKlines);
    const minuteKlines = parseKlines(rawMinuteKlines);
    const fiveMinKlines = parseKlines(rawFiveMinKlines);
    const thirtyMinKlines = parseKlines(rawThirtyMinKlines);
    const oneSecKlines = parseKlines(rawOneSecKlines);
    
    // Aggregate 1-second candles into 30-second candles
    const thirtySecKlines: Kline[] = [];
    for (let i = 0; i < oneSecKlines.length; i += 30) {
      const chunk = oneSecKlines.slice(i, i + 30);
      if (chunk.length > 0) {
        thirtySecKlines.push({
          openTime: chunk[0].openTime,
          open: chunk[0].open,
          high: Math.max(...chunk.map(k => k.high)),
          low: Math.min(...chunk.map(k => k.low)),
          close: chunk[chunk.length - 1].close,
          volume: chunk.reduce((sum, k) => sum + k.volume, 0),
          closeTime: chunk[chunk.length - 1].closeTime
        });
      }
    }
    
    console.log(`Received ${hourlyKlines.length} hourly, ${minuteKlines.length} 1m, ${fiveMinKlines.length} 5m, ${thirtySecKlines.length} 30s candles, analyzing...`);
    
    // Analyze hourly data
    const hourlyAnalysis = analyzePrice(hourlyKlines);
    
    // Analyze 1-minute data for short-term signal
    const shortTermAnalysis = analyzeShortTerm(minuteKlines);
    
    // Analyze 5-minute data
    const fiveMinAnalysis = analyzeShortTerm(fiveMinKlines);
    
    // Analyze candlestick patterns (hourly)
    const patternAnalysis = analyzeCandlePatterns(hourlyKlines);
    patternAnalysis.timeframe = '1 hour';
    
    // Analyze candlestick patterns (30-minute)
    const thirtyMinPatternAnalysis = analyzeCandlePatterns(thirtyMinKlines);
    thirtyMinPatternAnalysis.timeframe = '30 minutes';
    
    // Analyze candlestick patterns (5-minute)
    const fiveMinPatternAnalysis = analyzeCandlePatterns(fiveMinKlines);
    fiveMinPatternAnalysis.timeframe = '5 minutes';
    
    // Analyze candlestick patterns (30-second)
    const thirtySecPatternAnalysis = analyzeCandlePatterns(thirtySecKlines);
    thirtySecPatternAnalysis.timeframe = '30 seconds';
    
    // Calculate support and resistance levels
    const supportResistance = calculateSupportResistance(hourlyKlines);
    
    const closePrices = hourlyKlines.map(k => k.close);
    const currentPrice = closePrices[closePrices.length - 1];
    const price24hAgo = closePrices[closePrices.length - 24] || closePrices[0];
    
    // Predict price in 1 hour
    const pricePrediction = predictPrice1Hour(hourlyKlines, hourlyAnalysis);

    // ============================================================
    // MASTER SIGNAL — multi-timeframe confluence with vetoes
    // ------------------------------------------------------------
    // Stricter rules for bot automation:
    //   1. NET weighted confidence (winner - loser) must clear threshold
    //   2. Winning side agreement >= MIN_AGREEMENT
    //   3. 1h trend must align (BUY needs non-BEARISH, SELL needs non-BULLISH)
    //   4. Vetoes: RSI extreme against signal, MACD against signal, weak volume
    // ============================================================
    const MIN_CONFIDENCE = 75;
    const MIN_AGREEMENT = 70;
    const MIN_NET = 55; // (winnerWeight - loserWeight)/total * 100

    // Weights reflect signal reliability: higher timeframe technicals dominate;
    // patterns are confirmation only. 30s patterns are too noisy → dropped.
    const sources = [
      { source: '1h technicals', s: hourlyAnalysis, weight: 4 },
      { source: '5m technicals', s: fiveMinAnalysis, weight: 3 },
      { source: '1m technicals', s: shortTermAnalysis, weight: 1 },
      { source: '1h patterns', s: patternAnalysis, weight: 2 },
      { source: '30m patterns', s: thirtyMinPatternAnalysis, weight: 2 },
      { source: '5m patterns', s: fiveMinPatternAnalysis, weight: 1 },
    ];

    let buyWeight = 0, sellWeight = 0, totalWeight = 0;
    let buyConfSum = 0, sellConfSum = 0;
    const votes = sources.map(({ source, s, weight }) => {
      totalWeight += weight;
      if (s.signal === 'BUY') { buyWeight += weight; buyConfSum += s.confidence * weight; }
      else if (s.signal === 'SELL') { sellWeight += weight; sellConfSum += s.confidence * weight; }
      return { source, signal: s.signal, weight };
    });

    const buyAgreement = (buyWeight / totalWeight) * 100;
    const sellAgreement = (sellWeight / totalWeight) * 100;
    const netBuy = ((buyWeight - sellWeight) / totalWeight) * 100;
    const netSell = -netBuy;
    const buyConf = buyWeight > 0 ? buyConfSum / buyWeight : 0;
    const sellConf = sellWeight > 0 ? sellConfSum / sellWeight : 0;

    const trend = hourlyAnalysis.indicators.trend;
    const rsi = hourlyAnalysis.indicators.rsi;
    const hourlyMacd = calculateMACD(hourlyKlines.map(k => k.close));
    const hourlyVol = volumeRatio(hourlyKlines, 5, 20);

    let mSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let mConfidence = Math.max(buyAgreement, sellAgreement);
    let mAgreement = mConfidence;
    let mReason = `Insufficient confluence (${Math.round(buyAgreement)}% buy / ${Math.round(sellAgreement)}% sell). Bot stays flat.`;
    let actionable = false;

    const tryEnter = (side: 'BUY' | 'SELL') => {
      const agreement = side === 'BUY' ? buyAgreement : sellAgreement;
      const conf = side === 'BUY' ? buyConf : sellConf;
      const net = side === 'BUY' ? netBuy : netSell;
      const blocks: string[] = [];

      if (agreement < MIN_AGREEMENT) blocks.push(`agreement ${Math.round(agreement)}% < ${MIN_AGREEMENT}%`);
      if (conf < MIN_CONFIDENCE) blocks.push(`avg conf ${Math.round(conf)}% < ${MIN_CONFIDENCE}%`);
      if (net < MIN_NET) blocks.push(`net edge ${Math.round(net)}% < ${MIN_NET}%`);
      if (side === 'BUY' && trend === 'BEARISH') blocks.push('1h trend bearish');
      if (side === 'SELL' && trend === 'BULLISH') blocks.push('1h trend bullish');
      // RSI extreme veto: don't chase tops or bottoms
      if (side === 'BUY' && rsi > 75) blocks.push(`RSI ${rsi.toFixed(0)} overbought`);
      if (side === 'SELL' && rsi < 25) blocks.push(`RSI ${rsi.toFixed(0)} oversold`);
      // MACD must agree on the 1h
      if (side === 'BUY' && hourlyMacd.hist < 0) blocks.push('1h MACD negative');
      if (side === 'SELL' && hourlyMacd.hist > 0) blocks.push('1h MACD positive');
      // Volume conviction
      if (hourlyVol < 0.6) blocks.push(`weak 1h volume (${hourlyVol.toFixed(2)}x)`);

      if (blocks.length === 0) {
        mSignal = side;
        mConfidence = conf;
        mAgreement = agreement;
        actionable = true;
        mReason = `${Math.round(agreement)}% agreement, ${Math.round(conf)}% avg conf, ${Math.round(net)}% net edge. Trend ${trend}. Safe for bot.`;
        return true;
      }
      mReason = `${side} blocked: ${blocks.join('; ')}.`;
      return false;
    };

    if (buyAgreement > sellAgreement) {
      if (!tryEnter('BUY') && sellAgreement >= MIN_AGREEMENT) tryEnter('SELL');
    } else if (sellAgreement > buyAgreement) {
      if (!tryEnter('SELL') && buyAgreement >= MIN_AGREEMENT) tryEnter('BUY');
    }

    const masterSignal = {
      signal: mSignal,
      confidence: Math.round(mConfidence),
      actionable,
      threshold: MIN_CONFIDENCE,
      agreement: Math.round(mAgreement),
      votes,
      reason: mReason,
    };

    
    const analysis: AnalysisResult = {
      currentPrice,
      priceChange24h: currentPrice - price24hAgo,
      priceChangePercent24h: ((currentPrice - price24hAgo) / price24hAgo) * 100,
      signal: hourlyAnalysis.signal,
      confidence: hourlyAnalysis.confidence,
      reason: hourlyAnalysis.reason,
      indicators: hourlyAnalysis.indicators,
      recentCandles: hourlyKlines.slice(-10),
      shortTermSignal: {
        signal: shortTermAnalysis.signal,
        confidence: shortTermAnalysis.confidence,
        reason: shortTermAnalysis.reason,
        timeframe: '1 minute'
      },
      fiveMinSignal: {
        signal: fiveMinAnalysis.signal,
        confidence: fiveMinAnalysis.confidence,
        reason: fiveMinAnalysis.reason,
        timeframe: '5 minutes'
      },
      patternSignal: patternAnalysis,
      thirtyMinPatternSignal: thirtyMinPatternAnalysis,
      fiveMinPatternSignal: fiveMinPatternAnalysis,
      thirtySecPatternSignal: thirtySecPatternAnalysis,
      supportResistance,
      pricePrediction,
      masterSignal
    };
    
    console.log(`Hourly: ${analysis.signal}, 1m: ${analysis.shortTermSignal.signal}, 5m: ${analysis.fiveMinSignal.signal}, Pattern: ${analysis.patternSignal.signal}, 30m Pattern: ${analysis.thirtyMinPatternSignal.signal}, 5m Pattern: ${analysis.fiveMinPatternSignal.signal}, 30s Pattern: ${analysis.thirtySecPatternSignal.signal}`);
    
    // Update cache
    cacheStore.data = analysis;
    cacheStore.timestamp = Date.now();
    
    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
