import React from 'react';
import { useDemoTour } from '../../context/DemoTourContext';

/**
 * Demo Welcome Modal
 * 
 * First popup shown to new users asking if they want a guided tour.
 * Appears automatically on first visit.
 * 
 * Features:
 * - Floating modal with backdrop
 * - "Demo" button to start tour
 * - "Skip" button to dismiss (won't show again)
 * - Keyboard accessible (ESC to close)
 */
const DemoWelcomeModal = () => {
  const { showWelcomeModal, startTour, skipTour } = useDemoTour();

  if (!showWelcomeModal) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      skipTour();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={skipTour}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 p-8 max-w-md w-full mx-4 transform transition-all animate-scale-in">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-primary-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30 mb-6">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Title */}
        <h2 
          id="demo-modal-title"
          className="text-2xl font-bold text-white text-center mb-3"
        >
          Would you like a demo?
        </h2>

        {/* Description */}
        <p className="text-gray-300 text-center mb-8">
          Take a quick guided tour to understand how Planner-AI calculates realistic project timelines using resource-aware scheduling.
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={skipTour}
            className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            aria-label="Skip the demo tour"
          >
            Skip
          </button>
          <button
            onClick={startTour}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            aria-label="Start the demo tour"
          >
            Start Demo
          </button>
        </div>

        {/* Small note */}
        <p className="text-xs text-gray-500 text-center mt-4">
          You can restart the tour anytime from the Help menu
        </p>
      </div>
    </div>
  );
};

export default DemoWelcomeModal;
