import { useMemo, useEffect, useState, useRef } from 'react';

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChart5sProps {
  candles: Kline[];
}

interface AggregatedCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function CandlestickChart5s({ candles }: CandlestickChart5sProps) {
  const [aggregatedCandles, setAggregatedCandles] = useState<AggregatedCandle[]>([]);
  const currentCandleRef = useRef<AggregatedCandle | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Aggregate candles into 5-second intervals
  useEffect(() => {
    if (!candles.length) return;

    const now = Date.now();
    const currentPrice = candles[candles.length - 1]?.close || 0;
    
    // Check if we need to start a new 5-second candle
    const fiveSecondBucket = Math.floor(now / 5000) * 5000;
    
    if (!currentCandleRef.current || currentCandleRef.current.openTime !== fiveSecondBucket) {
      // Save the previous candle if it exists
      if (currentCandleRef.current) {
        setAggregatedCandles(prev => {
          const updated = [...prev, currentCandleRef.current!];
          // Keep only last 20 candles
          return updated.slice(-20);
        });
      }
      
      // Start a new candle
      currentCandleRef.current = {
        openTime: fiveSecondBucket,
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        volume: 0,
      };
    } else {
      // Update the current candle
      currentCandleRef.current = {
        ...currentCandleRef.current,
        high: Math.max(currentCandleRef.current.high, currentPrice),
        low: Math.min(currentCandleRef.current.low, currentPrice),
        close: currentPrice,
      };
    }
    
    lastUpdateRef.current = now;
  }, [candles]);

  const chartData = useMemo(() => {
    // Include the current forming candle
    const allCandles = currentCandleRef.current 
      ? [...aggregatedCandles, currentCandleRef.current]
      : aggregatedCandles;
    
    const displayCandles = allCandles.slice(-20);
    if (!displayCandles.length) return { candles: [], min: 0, max: 0 };
    
    const allPrices = displayCandles.flatMap(c => [c.high, c.low]);
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    
    return { candles: displayCandles, min, max };
  }, [aggregatedCandles, candles]); // Re-compute when source candles change

  const { candles: displayCandles, min, max } = chartData;
  const range = max - min || 1;
  
  const width = 400;
  const height = 150;
  const padding = 10;
  const candleCount = displayCandles.length || 1;
  const candleWidth = (width - padding * 2) / 20; // Fixed width for 20 candles
  const bodyWidth = candleWidth * 0.7;

  const priceToY = (price: number) => {
    return height - padding - ((price - min) / range) * (height - padding * 2);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
        5-Second Candlestick Chart (Last 20 Candles)
      </h3>
      
      <div className="relative h-40">
        <svg 
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={padding}
              y1={padding + (height - padding * 2) * ratio}
              x2={width - padding}
              y2={padding + (height - padding * 2) * ratio}
              stroke="hsl(var(--border))"
              strokeOpacity="0.3"
              strokeDasharray="4,4"
            />
          ))}
          
          {/* Candlesticks */}
          {displayCandles.map((candle, i) => {
            // Position from right side for fixed layout
            const xIndex = 20 - displayCandles.length + i;
            const x = padding + xIndex * candleWidth + candleWidth / 2;
            const isGreen = candle.close >= candle.open;
            const color = isGreen ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
            
            const highY = priceToY(candle.high);
            const lowY = priceToY(candle.low);
            const openY = priceToY(candle.open);
            const closeY = priceToY(candle.close);
            
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
            
            // Check if this is the current forming candle
            const isCurrentCandle = i === displayCandles.length - 1 && currentCandleRef.current;
            
            return (
              <g key={candle.openTime}>
                {/* Wick */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1"
                />
                {/* Body */}
                <rect
                  x={x - bodyWidth / 2}
                  y={bodyTop}
                  width={bodyWidth}
                  height={bodyHeight}
                  fill={color}
                  stroke={color}
                  strokeWidth="1"
                  opacity={isCurrentCandle ? 0.7 : 1}
                />
                {/* Pulsing indicator for current candle */}
                {isCurrentCandle && (
                  <circle
                    cx={x}
                    cy={closeY}
                    r="3"
                    fill={color}
                    className="animate-pulse"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>${min.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        <span className="text-foreground/60">5s interval • {displayCandles.length}/20 candles</span>
        <span>${max.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  );
}
