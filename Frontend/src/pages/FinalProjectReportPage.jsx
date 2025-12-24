import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import FinalProjectReport from '../components/sprintview/FinalProjectReport';
import Spinner from '../components/common/Spinner';
import Button from '../components/common/Button';
import api from '../services/api';

/**
 * Final Project Report Page
 * Shows completion-safe timeline with ALL team members
 */
const FinalProjectReportPage = () => {
  const { boardId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    loadReport();
  }, [boardId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/reports/project-final/${boardId}`);
      setReportData(response.data);
    } catch (err) {
      console.error('Failed to load report:', err);
      setError(err.response?.data?.error || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900">
        <div className="text-center space-y-4">
          <Spinner size="lg" />
          <p className="text-sm text-gray-300">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900">
        <div className="text-center max-w-md space-y-4">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-danger-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-danger-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Error loading report</h3>
            <p className="text-sm text-gray-400 mb-4">{error}</p>
            <Button onClick={loadReport} variant="primary">Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  const { stats, ownerTimelines } = reportData || {};

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900">
      {/* Header */}
      <header className="bg-gray-800/95 backdrop-blur-sm border-b border-gray-700 shadow-elevated sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/30">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Final Project Report</h1>
                {reportData?.boardInfo && (
                  <div className="text-sm text-gray-400 mt-0.5">{reportData.boardInfo.boardName}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={loadReport} 
                variant="secondary" 
                size="sm"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
              >
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Link to="/">
                <Button 
                  variant="secondary" 
                  size="sm"
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  }
                >
                  <span className="hidden sm:inline">Back</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto" role="main">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-blue-300 mb-1">About This Report</div>
                  <div className="text-sm text-blue-200">
                    This report shows the complete project timeline including all completed tasks.
                    Completed tasks are frozen and cannot be modified. Active tasks are scheduled based on current resource availability.
                  </div>
                </div>
              </div>
            </div>

          {/* Statistics */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Total Tasks" value={stats.totalTasks} icon="📋" color="bg-gray-100" />
              <StatCard 
                label="Completed" 
                value={stats.completedCount} 
                sublabel={`${stats.completionRate}%`}
                icon="✓" 
                color="bg-green-100 text-green-900" 
              />
              <StatCard 
                label="Active" 
                value={stats.activeCount} 
                sublabel={`${100 - stats.completionRate}% remaining`}
                icon="◉" 
                color="bg-blue-100 text-blue-900" 
              />
              <StatCard 
                label="Duration" 
                value={`${reportData.totalProjectWeeks} weeks`} 
                sublabel={`${reportData.totalProjectDays} days`}
                icon="📅" 
                color="bg-purple-100 text-purple-900" 
              />
            </div>
          )}

          {/* Chart */}
          <FinalProjectReport
            scheduledTasks={reportData?.scheduledTasks || []}
            totalProjectWeeks={reportData?.totalProjectWeeks || 0}
            projectStartDate={reportData?.projectStartDate}
            stats={stats}
            showLegend={true}
          />

            {/* Team Member Details */}
            {ownerTimelines && Object.keys(ownerTimelines).length > 0 && (
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">📋 Team Member Reports</h3>
              <div className="space-y-4">
                {Object.entries(ownerTimelines)
                  .sort((a, b) => b[1].totalTasks - a[1].totalTasks)
                  .map(([owner, timeline]) => (
                    <MemberCard key={owner} owner={owner} timeline={timeline} />
                  ))}
              </div>
            </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ label, value, sublabel, icon, color = 'bg-gray-700/50' }) => (
  <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
    <div className="flex items-start gap-3">
      <div className="text-3xl">{icon}</div>
      <div>
        <div className="text-sm text-gray-400 mb-1">{label}</div>
        <div className="text-2xl font-bold text-white">{value}</div>
        {sublabel && <div className="text-xs text-gray-400 mt-1">{sublabel}</div>}
      </div>
    </div>
  </div>
);

// Member Card Component
const MemberCard = ({ owner, timeline }) => (
  <div className="bg-gray-700/30 backdrop-blur-sm rounded-lg p-5 border border-gray-600">
    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-600">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 text-white flex items-center justify-center font-semibold shadow-lg shadow-primary-500/20">
          {owner.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-semibold text-white text-lg">{owner}</div>
          <div className="text-sm text-gray-400">
            {timeline.totalTasks} task{timeline.totalTasks !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      
      <div className="flex gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">{timeline.completedTasks}</div>
          <div className="text-xs text-gray-400">Completed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">{timeline.activeTasks}</div>
          <div className="text-xs text-gray-400">Active</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-400">Day {timeline.lastAvailableDay}</div>
          <div className="text-xs text-gray-400">Next Day</div>
        </div>
      </div>
    </div>

    {/* Task List */}
    {timeline.tasks && timeline.tasks.length > 0 && (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-300 mb-2">Tasks:</div>
        {timeline.tasks.map((task, idx) => (
          <div key={task.taskId || idx} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded border border-gray-600">
            <div className="flex-shrink-0 mt-0.5">
              {task.status === 'completed' ? (
                <div className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">✓</div>
              ) : task.status === 'in_progress' ? (
                <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">◉</div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-gray-500"></div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white">{task.taskName}</div>
              {task.allOwners && task.allOwners.length > 1 && (
                <div className="text-xs text-blue-400 mt-0.5">
                  👥 Team: {task.allOwners.join(', ')}
                </div>
              )}
              <div className="flex gap-4 mt-1 text-xs text-gray-400">
                <span>Days {task.startDay}-{task.endDay}</span>
                <span>•</span>
                <span>{task.durationDays} day{task.durationDays !== 1 ? 's' : ''}</span>
                {task.activityType && (
                  <>
                    <span>•</span>
                    <span className="uppercase">{task.activityType.replace(/_/g, ' ')}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex-shrink-0">
              {task.status === 'completed' ? (
                <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/40 rounded">Completed</span>
              ) : task.status === 'in_progress' ? (
                <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded">In Progress</span>
              ) : (
                <span className="px-2 py-1 text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/40 rounded">Not Started</span>
              )}
            </div>
          </div>
        ))}
      </div>
    )}

    {timeline.totalTasks === 0 && (
      <div className="text-sm text-gray-400 italic">No tasks assigned</div>
    )}
  </div>
);

export default FinalProjectReportPage;
