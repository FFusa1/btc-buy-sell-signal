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
function analyzePrice(klines: Kline[]): AnalysisResult {
  const closePrices = klines.map(k => k.close);
  const currentPrice = closePrices[closePrices.length - 1];
  const price24hAgo = closePrices[closePrices.length - 24] || closePrices[0];
  
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
    currentPrice,
    priceChange24h: currentPrice - price24hAgo,
    priceChangePercent24h: ((currentPrice - price24hAgo) / price24hAgo) * 100,
    signal,
    confidence: Math.round(confidence),
    reason: reason || 'Mixed signals',
    indicators: {
      sma7,
      sma25,
      rsi: Math.round(rsi * 100) / 100,
      momentum: Math.round(momentum * 100) / 100,
      trend
    },
    recentCandles: klines.slice(-10)
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching Binance BTCUSDT data...');
    
    // Fetch 1-hour klines for the last 100 periods
    const klineResponse = await fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100'
    );
    
    if (!klineResponse.ok) {
      throw new Error(`Binance API error: ${klineResponse.status}`);
    }
    
    const rawKlines = await klineResponse.json();
    
    const klines: Kline[] = rawKlines.map((k: any[]) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6]
    }));
    
    console.log(`Received ${klines.length} candles, analyzing...`);
    
    const analysis = analyzePrice(klines);
    
    console.log(`Signal: ${analysis.signal}, Confidence: ${analysis.confidence}%`);
    
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
