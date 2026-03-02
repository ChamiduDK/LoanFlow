/**
 * Modern animated mesh gradient background.
 * Adapted to React + Tailwind/Vanilla CSS from standard styled-components.
 */
import React from 'react';
import './AnimatedBackground.css'; // Add vanilla CSS for complex pseudo-elements and keyframes

type AnimatedBackgroundProps = {
  children?: React.ReactNode;
};

export const AnimatedBackground = ({ children }: AnimatedBackgroundProps) => {
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden -z-10 bg-mesh-gradient">
      <div className="mesh-overlay" />
      {children}
    </div>
  );
};
