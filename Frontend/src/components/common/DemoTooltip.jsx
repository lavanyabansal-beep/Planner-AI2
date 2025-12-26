import React, { useEffect, useState, useRef } from 'react';
import { useDemoTour } from '../../context/DemoTourContext';
import { demoSteps } from '../../utils/demoSteps';

/**
 * Demo Tooltip Component
 * 
 * Shows step-by-step tooltips during the guided tour.
 * 
 * Features:
 * - Highlights target element with spotlight effect
 * - Dims background
 * - Positions tooltip near highlighted element
 * - Navigation controls (Next, Previous, Exit)
 * - Progress indicator
 * - Responsive positioning
 * - Interactive: Requires user action before advancing
 */
const DemoTooltip = () => {
  const { isTourActive, currentStep, nextStep, previousStep, exitTour, actionCompleted, markActionCompleted } = useDemoTour();
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [spotlightStyle, setSpotlightStyle] = useState({});
  const tooltipRef = useRef(null);

  const step = demoSteps[currentStep];
  const totalSteps = demoSteps.length;

  // Listen for user actions on interactive steps
  useEffect(() => {
    if (!isTourActive || !step || !step.requireAction) return;

    const actionTarget = step.actionTarget || step.target;
    const eventType = step.actionType || 'click';

    const handleAction = (e) => {
      // Check if the event target matches our selector (supports dynamically added elements)
      const targetMatches = e.target.matches?.(actionTarget) || 
                           e.target.closest?.(actionTarget) ||
                           // Also check if any parent element matches (for nested components)
                           e.target.parentElement?.matches?.(actionTarget) ||
                           e.target.parentElement?.closest?.(actionTarget);
      
      if (targetMatches) {
        // Small delay to ensure the action completes before marking
        setTimeout(() => {
          markActionCompleted();
        }, 100);
      }
    };

    // Use event delegation on document to catch dynamically added elements
    document.addEventListener(eventType, handleAction, true);

    return () => {
      document.removeEventListener(eventType, handleAction, true);
    };
  }, [isTourActive, currentStep, step, markActionCompleted]);

  // Calculate tooltip and spotlight positions
  useEffect(() => {
    if (!isTourActive || !step) return;

    const updatePosition = () => {
      // Center placement (for welcome/complete screens)
      if (step.placement === 'center') {
        setTooltipPosition({
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        });
        setSpotlightStyle({});
        return;
      }

      // Find target element
      const target = document.querySelector(step.target);
      if (!target) {
        console.warn(`Demo tour: Element not found for selector "${step.target}"`);
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const padding = step.spotlightPadding || 8;

      // Always position tooltip at bottom-right corner
      setTooltipPosition({ 
        bottom: 24, 
        right: 24,
        transform: 'none'
      });

      // Calculate spotlight (highlight) style
      setSpotlightStyle({
        top: targetRect.top - padding,
        left: targetRect.left - padding,
        width: targetRect.width + padding * 2,
        height: targetRect.height + padding * 2,
        borderRadius: '8px'
      });

      // Scroll element into view if needed
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Update immediately and on resize
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isTourActive, currentStep, step]);

  if (!isTourActive || !step) return null;

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const requiresAction = step.requireAction && !actionCompleted;
  const canAdvance = !step.requireAction || actionCompleted;

  return (
    <>
      {/* Overlay with spotlight cutout effect */}
      <div className="fixed inset-0 z-[9998] pointer-events-none">
        {/* Spotlight (highlighted area) - No dark overlay for clear visibility */}
        {/* Hide spotlight if action is completed */}
        {step.placement !== 'center' && Object.keys(spotlightStyle).length > 0 && !actionCompleted && (
          <div
            className="absolute transition-all duration-300 ease-out pointer-events-none"
            style={{
              ...spotlightStyle,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0), 0 0 40px rgba(99, 102, 241, 0.9), 0 0 80px rgba(99, 102, 241, 0.5)',
              zIndex: 99999,
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              border: '2px solid rgba(99, 102, 241, 0.6)'
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-[99999] pointer-events-auto"
        style={tooltipPosition}
      >
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl border border-gray-700 p-6 max-w-sm w-full animate-fade-in">
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-purple-600 transition-all duration-300"
                style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 font-medium">
              {currentStep + 1} / {totalSteps}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-white mb-3">
            {step.title}
          </h3>

          {/* Content */}
          <p className="text-gray-300 text-sm leading-relaxed mb-6">
            {step.content}
          </p>

          {/* Action completion status */}
          {step.requireAction && (
            <div className="mb-4 p-3 rounded-lg border border-primary-500/30 bg-primary-500/10">
              {actionCompleted ? (
                <div className="flex items-center gap-2 text-green-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">{step.completionMessage || 'Action completed!'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-primary-300">
                  <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">Please complete the action above to continue</span>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center gap-3">
            {/* Exit button */}
            <button
              onClick={exitTour}
              className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-500"
              aria-label="Exit demo tour"
            >
              Exit
            </button>

            <div className="flex-1" />

            {/* Previous button */}
            {!isFirstStep && (
              <button
                onClick={previousStep}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-500"
                aria-label="Previous step"
              >
                Previous
              </button>
            )}

            {/* Next / Finish button */}
            <button
              onClick={() => nextStep(totalSteps)}
              disabled={requiresAction}
              className={`px-6 py-2 rounded-lg transition-all shadow-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                requiresAction
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white shadow-primary-500/30'
              }`}
              aria-label={isLastStep ? 'Finish demo tour' : 'Next step'}
              title={requiresAction ? 'Complete the action to continue' : ''}
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default DemoTooltip;
