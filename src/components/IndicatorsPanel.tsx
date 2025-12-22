import { Activity, TrendingUp, Gauge, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Indicators {
  sma7: number;
  sma25: number;
  rsi: number;
  momentum: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

interface IndicatorsPanelProps {
  indicators: Indicators;
}

export function IndicatorsPanel({ indicators }: IndicatorsPanelProps) {
  const getRsiStatus = (rsi: number) => {
    if (rsi > 70) return { label: 'Overbought', color: 'text-rose-400' };
    if (rsi < 30) return { label: 'Oversold', color: 'text-emerald-400' };
    return { label: 'Neutral', color: 'text-amber-400' };
  };

  const getTrendConfig = (trend: string) => {
    switch (trend) {
      case 'BULLISH': return { color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
      case 'BEARISH': return { color: 'text-rose-400', bg: 'bg-rose-500/20' };
      default: return { color: 'text-amber-400', bg: 'bg-amber-500/20' };
    }
  };

  const rsiStatus = getRsiStatus(indicators.rsi);
  const trendConfig = getTrendConfig(indicators.trend);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Technical Indicators
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* SMA */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Moving Averages</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">SMA 7</span>
              <span className="text-sm font-medium">${indicators.sma7.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">SMA 25</span>
              <span className="text-sm font-medium">${indicators.sma25.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>
        
        {/* RSI */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Gauge className="w-4 h-4" />
            <span className="text-xs">RSI (14)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{indicators.rsi.toFixed(1)}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded', rsiStatus.color)}>
              {rsiStatus.label}
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full rounded-full transition-all',
                indicators.rsi > 70 ? 'bg-rose-400' : indicators.rsi < 30 ? 'bg-emerald-400' : 'bg-amber-400'
              )}
              style={{ width: `${indicators.rsi}%` }}
            />
          </div>
        </div>
        
        {/* Momentum */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="w-4 h-4" />
            <span className="text-xs">Momentum</span>
          </div>
          <div className={cn(
            'text-2xl font-bold',
            indicators.momentum > 0 ? 'text-emerald-400' : indicators.momentum < 0 ? 'text-rose-400' : 'text-foreground'
          )}>
            {indicators.momentum > 0 ? '+' : ''}{indicators.momentum.toFixed(2)}%
          </div>
        </div>
        
        {/* Trend */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Trend</span>
          </div>
          <div className={cn(
            'inline-flex px-3 py-1 rounded-lg text-sm font-medium',
            trendConfig.bg,
            trendConfig.color
          )}>
            {indicators.trend}
          </div>
        </div>
      </div>
    </div>
  );
}
