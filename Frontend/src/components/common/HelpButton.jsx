import React, { useState } from 'react';
import { useDemoTour } from '../../context/DemoTourContext';

/**
 * Help Button Component
 * 
 * Floating help button that allows users to manually restart the demo tour.
 * Positioned in the bottom-right corner of the screen.
 * 
 * Features:
 * - Always visible (for users who want to replay the tour)
 * - Tooltip on hover
 * - Smooth animations
 */
const HelpButton = () => {
  const { restartTour, isTourActive } = useDemoTour();
  const [showTooltip, setShowTooltip] = useState(false);

  // Don't show the help button while tour is active
  if (isTourActive) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="relative">
        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg whitespace-nowrap animate-fade-in">
            Restart Demo Tour
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
          </div>
        )}

        {/* Help Button */}
        <button
          onClick={restartTour}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="w-14 h-14 bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white rounded-full shadow-xl shadow-primary-500/30 hover:shadow-primary-500/50 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900 hover:scale-110"
          aria-label="Restart demo tour"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default HelpButton;
