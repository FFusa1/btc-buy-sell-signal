import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

interface SupportResistanceProps {
  currentPrice: number;
  support: number[];
  resistance: number[];
  strongestSupport: number;
  strongestResistance: number;
}

export function SupportResistancePanel({
  currentPrice,
  support,
  resistance,
  strongestSupport,
  strongestResistance
}: SupportResistanceProps) {
  const formatPrice = (price: number) => {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const calculateDistance = (level: number) => {
    const distance = ((level - currentPrice) / currentPrice) * 100;
    return distance.toFixed(2);
  };

  return (
    <Card className="bg-card/50 border-border/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Support & Resistance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live Price Center */}
        <div className="text-center py-3 bg-primary/10 rounded-lg border border-primary/30">
          <p className="text-xs text-muted-foreground mb-1">Live Price</p>
          <p className="text-2xl font-bold text-primary">
            ${formatPrice(currentPrice)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Resistance Levels */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">Resistance</span>
            </div>
            {resistance.length > 0 ? (
              resistance.map((level, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg border ${
                    level === strongestResistance
                      ? 'bg-red-500/20 border-red-500/50'
                      : 'bg-red-500/10 border-red-500/20'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-red-400">
                      R{index + 1}
                    </span>
                    {level === strongestResistance && (
                      <span className="text-[10px] bg-red-500/30 px-1.5 py-0.5 rounded text-red-300">
                        STRONG
                      </span>
                    )}
                  </div>
                  <p className="text-base font-bold text-foreground mt-1">
                    ${formatPrice(level)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    +{calculateDistance(level)}%
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No resistance found</p>
            )}
          </div>

          {/* Support Levels */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Support</span>
            </div>
            {support.length > 0 ? (
              support.map((level, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg border ${
                    level === strongestSupport
                      ? 'bg-green-500/20 border-green-500/50'
                      : 'bg-green-500/10 border-green-500/20'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-400">
                      S{index + 1}
                    </span>
                    {level === strongestSupport && (
                      <span className="text-[10px] bg-green-500/30 px-1.5 py-0.5 rounded text-green-300">
                        STRONG
                      </span>
                    )}
                  </div>
                  <p className="text-base font-bold text-foreground mt-1">
                    ${formatPrice(level)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {calculateDistance(level)}%
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No support found</p>
            )}
          </div>
        </div>

        {/* Distance to Levels */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
          <div className="text-center p-2 bg-red-500/10 rounded">
            <p className="text-xs text-muted-foreground">To Resistance</p>
            <p className="text-sm font-bold text-red-400">
              +${formatPrice(strongestResistance - currentPrice)}
            </p>
          </div>
          <div className="text-center p-2 bg-green-500/10 rounded">
            <p className="text-xs text-muted-foreground">To Support</p>
            <p className="text-sm font-bold text-green-400">
              -${formatPrice(currentPrice - strongestSupport)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
