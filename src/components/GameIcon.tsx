import React from 'react';
import {
  Palette,
  Zap,
  Grid2x2,
  Puzzle,
  Rocket,
  Scissors,
  CircleDot,
  Sparkles,
  Trophy,
  Gamepad2,
} from 'lucide-react';

export const GameIcon: React.FC<{ iconKey: string; className?: string }> = ({
  iconKey,
  className = 'h-6 w-6',
}) => {
  switch (iconKey) {
    case 'palette':
      return <Palette className={className} />;
    case 'zap':
      return <Zap className={className} />;
    case 'grid':
      return <Grid2x2 className={className} />;
    case 'puzzle':
      return <Puzzle className={className} />;
    case 'rocket':
      return <Rocket className={className} />;
    case 'scissors':
      return <Scissors className={className} />;
    case 'circle':
      return <CircleDot className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    default:
      return <Gamepad2 className={className} />;
  }
};
