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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-red-200 p-8 max-w-md">
          <div className="text-red-600 text-lg font-semibold mb-2">Error</div>
          <div className="text-gray-600 mb-4">{error}</div>
          <div className="flex gap-2">
            <Button onClick={loadReport} variant="primary" size="sm">
              🔄 Retry
            </Button>
            <Link to="/">
              <Button variant="secondary" size="sm">← Back</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { stats, ownerTimelines } = reportData || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📊 Final Project Report</h1>
              {reportData?.boardInfo && (
                <div className="text-sm text-gray-600 mt-1">{reportData.boardInfo.boardName}</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={loadReport} variant="secondary" size="sm">
                🔄 Refresh
              </Button>
              <Link to="/">
                <Button variant="secondary" size="sm">← Back</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="text-sm font-medium text-blue-900 mb-1">About This Report</div>
                <div className="text-sm text-blue-700">
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
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Team Member Reports</h3>
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
    </div>
  );
};

// Stat Card Component
const StatCard = ({ label, value, sublabel, icon, color = 'bg-gray-100' }) => (
  <div className={`rounded-lg p-6 ${color}`}>
    <div className="flex items-start gap-3">
      <div className="text-3xl">{icon}</div>
      <div>
        <div className="text-sm opacity-75 mb-1">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
        {sublabel && <div className="text-xs opacity-75 mt-1">{sublabel}</div>}
      </div>
    </div>
  </div>
);

// Member Card Component
const MemberCard = ({ owner, timeline }) => (
  <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-300">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
          {owner.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-semibold text-gray-900 text-lg">{owner}</div>
          <div className="text-sm text-gray-600">
            {timeline.totalTasks} task{timeline.totalTasks !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      
      <div className="flex gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{timeline.completedTasks}</div>
          <div className="text-xs text-gray-600">Completed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{timeline.activeTasks}</div>
          <div className="text-xs text-gray-600">Active</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">Day {timeline.lastAvailableDay}</div>
          <div className="text-xs text-gray-600">Next Day</div>
        </div>
      </div>
    </div>

    {/* Task List */}
    {timeline.tasks && timeline.tasks.length > 0 && (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700 mb-2">Tasks:</div>
        {timeline.tasks.map((task, idx) => (
          <div key={task.taskId || idx} className="flex items-start gap-3 p-3 bg-white rounded border border-gray-200">
            <div className="flex-shrink-0 mt-0.5">
              {task.status === 'completed' ? (
                <div className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">✓</div>
              ) : task.status === 'in_progress' ? (
                <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">◉</div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900">{task.taskName}</div>
              {task.allOwners && task.allOwners.length > 1 && (
                <div className="text-xs text-blue-600 mt-0.5">
                  👥 Team: {task.allOwners.join(', ')}
                </div>
              )}
              <div className="flex gap-4 mt-1 text-xs text-gray-600">
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
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">Completed</span>
              ) : task.status === 'in_progress' ? (
                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">In Progress</span>
              ) : (
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">Not Started</span>
              )}
            </div>
          </div>
        ))}
      </div>
    )}

    {timeline.totalTasks === 0 && (
      <div className="text-sm text-gray-500 italic">No tasks assigned</div>
    )}
  </div>
);

export default FinalProjectReportPage;
