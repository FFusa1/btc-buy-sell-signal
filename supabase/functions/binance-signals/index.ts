import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
}

// Calculate Simple Moving Average
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate momentum (rate of change)
function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - period];
  return ((current - past) / past) * 100;
}

// Analyze price data and generate trading signal
function analyzePrice(klines: Kline[]): { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reason: string; indicators: any; } {
  const closePrices = klines.map(k => k.close);
  const currentPrice = closePrices[closePrices.length - 1];
  
  const sma7 = calculateSMA(closePrices, 7);
  const sma25 = calculateSMA(closePrices, 25);
  const rsi = calculateRSI(closePrices);
  const momentum = calculateMomentum(closePrices);
  
  // Determine trend
  let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (sma7 > sma25 && currentPrice > sma7) trend = 'BULLISH';
  else if (sma7 < sma25 && currentPrice < sma7) trend = 'BEARISH';
  
  // Calculate confidence and signal
  let buyScore = 0;
  let sellScore = 0;
  const reasons: string[] = [];
  
  // SMA crossover analysis
  if (sma7 > sma25) {
    buyScore += 20;
    reasons.push('Short-term MA above long-term MA');
  } else {
    sellScore += 20;
    reasons.push('Short-term MA below long-term MA');
  }
  
  // Price vs SMA
  if (currentPrice > sma7) {
    buyScore += 15;
    reasons.push('Price above 7-period MA');
  } else {
    sellScore += 15;
    reasons.push('Price below 7-period MA');
  }
  
  // RSI analysis
  if (rsi < 30) {
    buyScore += 25;
    reasons.push('RSI indicates oversold');
  } else if (rsi > 70) {
    sellScore += 25;
    reasons.push('RSI indicates overbought');
  } else if (rsi < 50) {
    sellScore += 10;
  } else {
    buyScore += 10;
  }
  
  // Momentum analysis
  if (momentum > 2) {
    buyScore += 20;
    reasons.push('Strong positive momentum');
  } else if (momentum < -2) {
    sellScore += 20;
    reasons.push('Strong negative momentum');
  } else if (momentum > 0) {
    buyScore += 10;
  } else {
    sellScore += 10;
  }
  
  // Recent price action (last 5 candles)
  const recentPrices = closePrices.slice(-5);
  const recentGains = recentPrices.filter((p, i) => i > 0 && p > recentPrices[i - 1]).length;
  if (recentGains >= 3) {
    buyScore += 15;
    reasons.push('Recent upward movement');
  } else if (recentGains <= 1) {
    sellScore += 15;
    reasons.push('Recent downward movement');
  }
  
  const totalScore = buyScore + sellScore;
  const buyConfidence = (buyScore / totalScore) * 100;
  
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  let reason = 'Market conditions are neutral';
  
  if (buyConfidence > 55) {
    signal = 'BUY';
    confidence = buyConfidence;
    reason = reasons.filter(r => r.includes('above') || r.includes('positive') || r.includes('oversold') || r.includes('upward')).join('. ');
  } else if (buyConfidence < 45) {
    signal = 'SELL';
    confidence = 100 - buyConfidence;
    reason = reasons.filter(r => r.includes('below') || r.includes('negative') || r.includes('overbought') || r.includes('downward')).join('. ');
  }
  
  return {
    signal,
    confidence: Math.round(confidence),
    reason: reason || 'Mixed signals',
    indicators: {
      sma7,
      sma25,
      rsi: Math.round(rsi * 100) / 100,
      momentum: Math.round(momentum * 100) / 100,
      trend
    }
  };
}

// Analyze short-term (1-minute) data
function analyzeShortTerm(klines: Kline[]): { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reason: string; } {
  const closePrices = klines.map(k => k.close);
  
  // Use shorter periods for 1-minute data
  const sma3 = calculateSMA(closePrices, 3);
  const sma7 = calculateSMA(closePrices, 7);
  const rsi = calculateRSI(closePrices, 7); // Shorter RSI period
  const momentum = calculateMomentum(closePrices, 5);
  
  let buyScore = 0;
  let sellScore = 0;
  const reasons: string[] = [];
  
  // Short-term SMA crossover
  if (sma3 > sma7) {
    buyScore += 25;
    reasons.push('3-min MA above 7-min MA');
  } else {
    sellScore += 25;
    reasons.push('3-min MA below 7-min MA');
  }
  
  // RSI for short-term
  if (rsi < 35) {
    buyScore += 25;
    reasons.push('Short-term oversold');
  } else if (rsi > 65) {
    sellScore += 25;
    reasons.push('Short-term overbought');
  } else if (rsi < 50) {
    sellScore += 10;
  } else {
    buyScore += 10;
  }
  
  // Quick momentum
  if (momentum > 0.1) {
    buyScore += 25;
    reasons.push('Positive short momentum');
  } else if (momentum < -0.1) {
    sellScore += 25;
    reasons.push('Negative short momentum');
  } else {
    buyScore += 5;
    sellScore += 5;
  }
  
  // Last 3 candle direction
  const last3 = closePrices.slice(-3);
  const upCandles = last3.filter((p, i) => i > 0 && p > last3[i - 1]).length;
  if (upCandles >= 2) {
    buyScore += 20;
    reasons.push('Recent uptrend');
  } else if (upCandles === 0) {
    sellScore += 20;
    reasons.push('Recent downtrend');
  }
  
  const totalScore = buyScore + sellScore;
  const buyConfidence = totalScore > 0 ? (buyScore / totalScore) * 100 : 50;
  
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  let reason = 'Short-term neutral';
  
  if (buyConfidence > 55) {
    signal = 'BUY';
    confidence = buyConfidence;
    reason = reasons.filter(r => r.includes('above') || r.includes('Positive') || r.includes('oversold') || r.includes('uptrend')).join('. ');
  } else if (buyConfidence < 45) {
    signal = 'SELL';
    confidence = 100 - buyConfidence;
    reason = reasons.filter(r => r.includes('below') || r.includes('Negative') || r.includes('overbought') || r.includes('downtrend')).join('. ');
  }
  
  return {
    signal,
    confidence: Math.round(confidence),
    reason: reason || 'Mixed short-term signals'
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching Binance BTCUSDT data...');
    
    // Fetch 1-hour klines for long-term analysis
    const hourlyPromise = fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100'
    );
    
    // Fetch 1-minute klines for short-term analysis
    const minutePromise = fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=30'
    );
    
    // Fetch 5-minute klines for medium-short-term analysis
    const fiveMinPromise = fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=30'
    );
    
    const [hourlyResponse, minuteResponse, fiveMinResponse] = await Promise.all([hourlyPromise, minutePromise, fiveMinPromise]);
    
    if (!hourlyResponse.ok) {
      throw new Error(`Binance API error (hourly): ${hourlyResponse.status}`);
    }
    if (!minuteResponse.ok) {
      throw new Error(`Binance API error (minute): ${minuteResponse.status}`);
    }
    if (!fiveMinResponse.ok) {
      throw new Error(`Binance API error (5min): ${fiveMinResponse.status}`);
    }
    
    const rawHourlyKlines = await hourlyResponse.json();
    const rawMinuteKlines = await minuteResponse.json();
    const rawFiveMinKlines = await fiveMinResponse.json();
    
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
    
    console.log(`Received ${hourlyKlines.length} hourly, ${minuteKlines.length} 1m, ${fiveMinKlines.length} 5m candles, analyzing...`);
    
    // Analyze hourly data
    const hourlyAnalysis = analyzePrice(hourlyKlines);
    
    // Analyze 1-minute data for short-term signal
    const shortTermAnalysis = analyzeShortTerm(minuteKlines);
    
    // Analyze 5-minute data
    const fiveMinAnalysis = analyzeShortTerm(fiveMinKlines);
    
    const closePrices = hourlyKlines.map(k => k.close);
    const currentPrice = closePrices[closePrices.length - 1];
    const price24hAgo = closePrices[closePrices.length - 24] || closePrices[0];
    
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
      }
    };
    
    console.log(`Hourly: ${analysis.signal}, 1m: ${analysis.shortTermSignal.signal}, 5m: ${analysis.fiveMinSignal.signal}`);
    
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
