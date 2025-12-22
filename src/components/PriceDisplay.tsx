import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriceDisplayProps {
  currentPrice: number;
  priceChange24h: number;
  priceChangePercent24h: number;
}

export function PriceDisplay({ currentPrice, priceChange24h, priceChangePercent24h }: PriceDisplayProps) {
  const isPositive = priceChange24h >= 0;
  
  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">BTC/USDT</h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>
      
      <div className="flex items-end gap-4">
        <div className="text-4xl font-bold tracking-tight text-foreground">
          ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        
        <div className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium',
          isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
        )}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>{isPositive ? '+' : ''}{priceChangePercent24h.toFixed(2)}%</span>
        </div>
      </div>
      
      <div className="mt-2 text-sm text-muted-foreground">
        24h Change: {isPositive ? '+' : ''}${priceChange24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
