import { TrendingUp, TrendingDown, Activity, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PatternSignalProps {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  patterns: string[];
  timeframe: string;
}

const patternLabels: Record<string, { label: string; type: 'bullish' | 'bearish' | 'neutral' }> = {
  'DOJI': { label: 'Doji', type: 'neutral' },
  'DRAGONFLY_DOJI': { label: 'Dragonfly Doji', type: 'bullish' },
  'GRAVESTONE_DOJI': { label: 'Gravestone Doji', type: 'bearish' },
  'HAMMER': { label: 'Hammer', type: 'bullish' },
  'HANGING_MAN': { label: 'Hanging Man', type: 'bearish' },
  'INVERTED_HAMMER': { label: 'Inverted Hammer', type: 'bullish' },
  'SHOOTING_STAR': { label: 'Shooting Star', type: 'bearish' },
  'BULLISH_MARUBOZU': { label: 'Bullish Marubozu', type: 'bullish' },
  'BEARISH_MARUBOZU': { label: 'Bearish Marubozu', type: 'bearish' },
  'BIG_BULLISH': { label: 'Big Bullish', type: 'bullish' },
  'BIG_BEARISH': { label: 'Big Bearish', type: 'bearish' },
  'SPINNING_TOP': { label: 'Spinning Top', type: 'neutral' },
  'BULLISH_ENGULFING': { label: 'Bullish Engulfing', type: 'bullish' },
  'BEARISH_ENGULFING': { label: 'Bearish Engulfing', type: 'bearish' },
};

export function PatternSignal({ signal, confidence, reason, patterns, timeframe }: PatternSignalProps) {
  const getSignalConfig = () => {
    switch (signal) {
      case 'BUY':
        return {
          icon: TrendingUp,
          bgColor: 'bg-emerald-500/15',
          borderColor: 'border-emerald-500/40',
          textColor: 'text-emerald-400',
          progressColor: 'bg-emerald-500',
        };
      case 'SELL':
        return {
          icon: TrendingDown,
          bgColor: 'bg-rose-500/15',
          borderColor: 'border-rose-500/40',
          textColor: 'text-rose-400',
          progressColor: 'bg-rose-500',
        };
      default:
        return {
          icon: Minus,
          bgColor: 'bg-amber-500/15',
          borderColor: 'border-amber-500/40',
          textColor: 'text-amber-400',
          progressColor: 'bg-amber-500',
        };
    }
  };

  const config = getSignalConfig();
  const Icon = config.icon;

  return (
    <div className={cn(
      'rounded-xl border p-5 backdrop-blur-sm',
      config.bgColor,
      config.borderColor
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Pattern Analysis
          </h3>
        </div>
        <span className="text-xs text-muted-foreground bg-white/5 px-2 py-1 rounded">
          {timeframe}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className={cn('p-2 rounded-lg', config.bgColor)}>
          <Icon className={cn('w-6 h-6', config.textColor)} />
        </div>
        <div>
          <div className={cn('text-2xl font-bold', config.textColor)}>
            {signal}
          </div>
          <div className="text-sm text-muted-foreground">
            {confidence}% confidence
          </div>
        </div>
      </div>

      {/* Patterns detected */}
      {patterns.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2">Patterns Detected:</div>
          <div className="flex flex-wrap gap-1.5">
            {patterns.slice(0, 5).map((pattern, idx) => {
              const patternInfo = patternLabels[pattern];
              if (!patternInfo) return null;
              return (
                <span
                  key={idx}
                  className={cn(
                    'text-xs px-2 py-1 rounded-full font-medium',
                    patternInfo.type === 'bullish' && 'bg-emerald-500/20 text-emerald-400',
                    patternInfo.type === 'bearish' && 'bg-rose-500/20 text-rose-400',
                    patternInfo.type === 'neutral' && 'bg-amber-500/20 text-amber-400'
                  )}
                >
                  {patternInfo.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Confidence Progress */}
      <div className="mb-3">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', config.progressColor)}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {reason}
      </p>
    </div>
  );
}
