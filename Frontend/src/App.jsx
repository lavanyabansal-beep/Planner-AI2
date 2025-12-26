import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import FinalProjectReportPage from './pages/FinalProjectReportPage';
import { DemoTourProvider } from './context/DemoTourContext';
import DemoWelcomeModal from './components/common/DemoWelcomeModal';
import DemoTooltip from './components/common/DemoTooltip';
import HelpButton from './components/common/HelpButton';
import './index.css';

function App() {
  return (
    <DemoTourProvider>
      {/* Demo Tour Components */}
      <DemoWelcomeModal />
      <DemoTooltip />
      <HelpButton />
      
      {/* Main Application Routes */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/final-report/:boardId" element={<FinalProjectReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DemoTourProvider>
  );
}

export default App;


