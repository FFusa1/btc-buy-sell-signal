import { TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShortTermSignalProps {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  timeframe: string;
}

export function ShortTermSignal({ signal, confidence, reason, timeframe }: ShortTermSignalProps) {
  const getSignalConfig = () => {
    switch (signal) {
      case 'BUY':
        return {
          icon: TrendingUp,
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/30',
          textColor: 'text-emerald-400',
          barColor: 'bg-emerald-500'
        };
      case 'SELL':
        return {
          icon: TrendingDown,
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          textColor: 'text-red-400',
          barColor: 'bg-red-500'
        };
      default:
        return {
          icon: Minus,
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
          textColor: 'text-yellow-400',
          barColor: 'bg-yellow-500'
        };
    }
  };

  const config = getSignalConfig();
  const Icon = config.icon;

  return (
    <div className={cn(
      "rounded-xl border p-4",
      config.bgColor,
      config.borderColor
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Short-Term Signal ({timeframe})
          </span>
        </div>
        <div className={cn("flex items-center gap-2", config.textColor)}>
          <Icon className="w-5 h-5" />
          <span className="font-bold text-lg">{signal}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Confidence</span>
          <span className={cn("font-semibold", config.textColor)}>{confidence}%</span>
        </div>
        
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <div 
            className={cn("h-full rounded-full transition-all duration-500", config.barColor)}
            style={{ width: `${confidence}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {reason || 'Analyzing short-term price action...'}
        </p>
      </div>
    </div>
  );
}
