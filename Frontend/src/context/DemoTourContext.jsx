import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Demo Tour Context
 * 
 * Manages the state and behavior of the guided product tour.
 * Handles:
 * - First-time visitor detection
 * - Tour step navigation
 * - Persistent state using localStorage
 * - Tour completion tracking
 */

const DemoTourContext = createContext();

// localStorage keys
const STORAGE_KEYS = {
  TOUR_COMPLETED: 'planner_ai_tour_completed',
  TOUR_SKIPPED: 'planner_ai_tour_skipped',
  FIRST_VISIT: 'planner_ai_first_visit'
};

export const DemoTourProvider = ({ children }) => {
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [actionCompleted, setActionCompleted] = useState(false);

  // Check if this is the first visit on mount
  useEffect(() => {
    const tourCompleted = localStorage.getItem(STORAGE_KEYS.TOUR_COMPLETED);
    const tourSkipped = localStorage.getItem(STORAGE_KEYS.TOUR_SKIPPED);
    const firstVisit = localStorage.getItem(STORAGE_KEYS.FIRST_VISIT);

    // If user has never visited OR hasn't completed/skipped the tour
    if (!firstVisit && !tourCompleted && !tourSkipped) {
      setIsFirstVisit(true);
      setShowWelcomeModal(true);
      localStorage.setItem(STORAGE_KEYS.FIRST_VISIT, 'true');
    }
  }, []);

  // Start the demo tour
  const startTour = useCallback(() => {
    setShowWelcomeModal(false);
    setIsTourActive(true);
    setCurrentStep(0);
    setActionCompleted(false);
  }, []);

  // Skip the tour
  const skipTour = useCallback(() => {
    setShowWelcomeModal(false);
    setIsTourActive(false);
    localStorage.setItem(STORAGE_KEYS.TOUR_SKIPPED, 'true');
  }, []);

  // Navigate to next step
  const nextStep = useCallback((totalSteps) => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
      setActionCompleted(false); // Reset for next step
    } else {
      completeTour();
    }
  }, [currentStep]);

  // Navigate to previous step
  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      setActionCompleted(false); // Reset for previous step
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  // Exit tour (can be resumed later)
  const exitTour = useCallback(() => {
    setIsTourActive(false);
    setActionCompleted(false);
    setCurrentStep(0);
  }, []);

  // Complete tour and mark as done
  const completeTour = useCallback(() => {
    setIsTourActive(false);
    setCurrentStep(0);
    setActionCompleted(false);
    localStorage.setItem(STORAGE_KEYS.TOUR_COMPLETED, 'true');
  }, []);

  // Manually restart tour (for "Help" button)
  const restartTour = useCallback(() => {
    setCurrentStep(0);
    setIsTourActive(true);
    setActionCompleted(false);
  }, []);

  // Go to a specific step
  const goToStep = useCallback((stepIndex) => {
    setCurrentStep(stepIndex);
    setActionCompleted(false);
  }, []);

  // Mark action as completed
  const markActionCompleted = useCallback(() => {
    setActionCompleted(true);
  }, []);

  const value = {
    showWelcomeModal,
    isTourActive,
    currentStep,
    isFirstVisit,
    actionCompleted,
    startTour,
    skipTour,
    nextStep,
    previousStep,
    exitTour,
    completeTour,
    restartTour,
    goToStep,
    markActionCompleted
  };

  return (
    <DemoTourContext.Provider value={value}>
      {children}
    </DemoTourContext.Provider>
  );
};

// Custom hook to use the demo tour context
export const useDemoTour = () => {
  const context = useContext(DemoTourContext);
  if (!context) {
    throw new Error('useDemoTour must be used within a DemoTourProvider');
  }
  return context;
};
