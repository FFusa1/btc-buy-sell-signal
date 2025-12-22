import { useMemo } from 'react';
import { cn } from '@/lib/utils';

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

export function MiniChart({ candles }: MiniChartProps) {
  const chartData = useMemo(() => {
    if (!candles.length) return { points: '', min: 0, max: 0 };
    
    const prices = candles.map(c => c.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    const width = 100;
    const height = 60;
    const padding = 4;
    
    const points = prices.map((price, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - padding - ((price - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');
    
    return { points, min, max, prices };
  }, [candles]);

  const isPositive = candles.length >= 2 && 
    candles[candles.length - 1].close >= candles[0].close;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Price Action (Last 10 Hours)
      </h3>
      
      <div className="relative h-20">
        <svg 
          viewBox="0 0 100 60" 
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop 
                offset="0%" 
                stopColor={isPositive ? 'rgb(52, 211, 153)' : 'rgb(251, 113, 133)'} 
                stopOpacity="0.3" 
              />
              <stop 
                offset="100%" 
                stopColor={isPositive ? 'rgb(52, 211, 153)' : 'rgb(251, 113, 133)'} 
                stopOpacity="0" 
              />
            </linearGradient>
          </defs>
          
          {/* Area fill */}
          <polygon
            points={`0,60 ${chartData.points} 100,60`}
            fill="url(#chartGradient)"
          />
          
          {/* Line */}
          <polyline
            points={chartData.points}
            fill="none"
            stroke={isPositive ? 'rgb(52, 211, 153)' : 'rgb(251, 113, 133)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>10h ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}
