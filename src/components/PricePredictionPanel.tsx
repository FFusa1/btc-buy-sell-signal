import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';

interface PricePredictionProps {
  currentPrice: number;
  predictedPrice: number;
  predictedChange: number;
  predictedChangePercent: number;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  confidence: number;
  lowEstimate: number;
  highEstimate: number;
}

export function PricePredictionPanel({
  currentPrice,
  predictedPrice,
  predictedChange,
  predictedChangePercent,
  direction,
  confidence,
  lowEstimate,
  highEstimate
}: PricePredictionProps) {
  const formatPrice = (price: number) =>
    price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const directionConfig = {
    UP: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', label: 'Bullish' },
    DOWN: { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Bearish' },
    NEUTRAL: { icon: Minus, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', label: 'Neutral' },
  };

  const config = directionConfig[direction];
  const Icon = config.icon;

  // Position of predicted price within range
  const range = highEstimate - lowEstimate;
  const predictedPosition = range > 0 ? ((predictedPrice - lowEstimate) / range) * 100 : 50;
  const currentPosition = range > 0 ? Math.max(0, Math.min(100, ((currentPrice - lowEstimate) / range) * 100)) : 50;

  return (
    <Card className="bg-card/50 border-border/50 backdrop-blur-sm mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          1-Hour Price Forecast
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Predicted Price */}
        <div className={`text-center py-3 rounded-lg border ${config.bg} ${config.border}`}>
          <p className="text-xs text-muted-foreground mb-1">Predicted Price</p>
          <p className={`text-2xl font-bold ${config.color}`}>
            ${formatPrice(predictedPrice)}
          </p>
          <div className="flex items-center justify-center gap-1 mt-1">
            <Icon className={`w-4 h-4 ${config.color}`} />
            <span className={`text-sm font-medium ${config.color}`}>
              {predictedChange >= 0 ? '+' : ''}${formatPrice(predictedChange)} ({predictedChangePercent >= 0 ? '+' : ''}{predictedChangePercent.toFixed(3)}%)
            </span>
          </div>
        </div>

        {/* Direction Badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Direction</span>
          <span className={`text-sm font-semibold px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        </div>

        {/* Confidence */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Confidence</span>
            <span className="text-foreground font-medium">{confidence}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                confidence >= 60 ? 'bg-green-500' : confidence >= 40 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>

        {/* Price Range */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Estimated Range</p>
          <div className="relative h-8 bg-muted/30 rounded-lg overflow-hidden">
            {/* Range bar */}
            <div className="absolute inset-0 flex items-center px-2">
              <div className="w-full h-1 bg-muted rounded-full relative">
                {/* Current price marker */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full ring-2 ring-primary/30"
                  style={{ left: `${currentPosition}%` }}
                />
                {/* Predicted price marker */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ${
                    direction === 'UP' ? 'bg-green-400 ring-green-400/30' :
                    direction === 'DOWN' ? 'bg-red-400 ring-red-400/30' :
                    'bg-yellow-400 ring-yellow-400/30'
                  }`}
                  style={{ left: `${predictedPosition}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-red-400">${formatPrice(lowEstimate)}</span>
            <span className="text-green-400">${formatPrice(highEstimate)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
