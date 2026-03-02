import React from 'react';
import './AnimatedLoader.css';

export const AnimatedLoader = () => {
  return (
    <div className="loader-wrapper flex justify-center items-center h-full w-full">
      <div className="loader-container">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
};
