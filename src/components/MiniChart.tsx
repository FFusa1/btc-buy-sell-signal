import { useMemo } from 'react';
interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
interface MiniChartProps {
  candles: Kline[];
}
export function MiniChart({
  candles
}: MiniChartProps) {
  const chartData = useMemo(() => {
    // Take only the last 20 candles
    const recentCandles = candles.slice(-20);
    if (!recentCandles.length) return {
      candles: [],
      min: 0,
      max: 0
    };
    const allPrices = recentCandles.flatMap(c => [c.high, c.low]);
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    return {
      candles: recentCandles,
      min,
      max
    };
  }, [candles]);
  const {
    candles: displayCandles,
    min,
    max
  } = chartData;
  const range = max - min || 1;
  const width = 400;
  const height = 150;
  const padding = 10;
  const candleCount = displayCandles.length;
  const candleWidth = candleCount > 0 ? (width - padding * 2) / candleCount : 0;
  const bodyWidth = candleWidth * 0.7;
  const priceToY = (price: number) => {
    return height - padding - (price - min) / range * (height - padding * 2);
  };
  return <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <h3 className="text-sm font-medium uppercase tracking-wider mb-4 text-destructive-foreground">
        Candlestick Chart (Last 20 Candles)
      </h3>
      
      <div className="relative h-40">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(ratio => <line key={ratio} x1={padding} y1={padding + (height - padding * 2) * ratio} x2={width - padding} y2={padding + (height - padding * 2) * ratio} stroke="hsl(var(--border))" strokeOpacity="0.3" strokeDasharray="4,4" />)}
          
          {/* Candlesticks */}
          {displayCandles.map((candle, i) => {
          const x = padding + i * candleWidth + candleWidth / 2;
          const isGreen = candle.close >= candle.open;
          const color = isGreen ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
          const highY = priceToY(candle.high);
          const lowY = priceToY(candle.low);
          const openY = priceToY(candle.open);
          const closeY = priceToY(candle.close);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
          return <g key={candle.openTime}>
                {/* Wick */}
                <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth="1" />
                {/* Body */}
                <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={isGreen ? color : color} stroke={color} strokeWidth="1" />
              </g>;
        })}
        </svg>
      </div>
      
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span className="text-destructive-foreground">${min.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        })}</span>
        <span className="text-foreground/60">Updates every 1s</span>
        <span className="text-destructive-foreground">${max.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        })}</span>
      </div>
    </div>;
}