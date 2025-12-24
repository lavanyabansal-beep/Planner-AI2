import React, { useState } from 'react';
import { ACTIVITY_TYPE_CONFIG } from '../../utils/sprintviewConfig';

/**
 * Final Project Report Chart Component
 * Completion-safe Gantt-style timeline showing all tasks (completed + active)
 */
const FinalProjectReport = ({
  scheduledTasks = [],
  totalProjectWeeks = 0,
  projectStartDate,
  stats = {},
  showLegend = true
}) => {
  const [hoveredTask, setHoveredTask] = useState(null);
  const [filter, setFilter] = useState('all'); // all, completed, active

  if (!scheduledTasks || scheduledTasks.length === 0) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 p-8 text-center">
        <div className="text-gray-400 text-lg">No tasks to display</div>
      </div>
    );
  }

  // Filter tasks
  const filteredTasks = scheduledTasks.filter(task => {
    if (filter === 'completed') return task.status === 'completed';
    if (filter === 'active') return task.status !== 'completed';
    return true;
  });

  // Group by owner
  const tasksByOwner = filteredTasks.reduce((acc, task) => {
    const owner = task.taskOwner || 'Unassigned';
    if (!acc[owner]) acc[owner] = [];
    acc[owner].push(task);
    return acc;
  }, {});

  const owners = Object.keys(tasksByOwner).sort();
  const maxWeek = totalProjectWeeks || 10;
  const weekWidth = 120;
  const chartWidth = maxWeek * weekWidth;

  // Get visual style for task
  const getTaskStyle = (task) => {
    const config = ACTIVITY_TYPE_CONFIG[task.activityType] || ACTIVITY_TYPE_CONFIG.ONE_TIME;
    
    if (task.status === 'completed') {
      return {
        backgroundColor: `${config.color}CC`, // Darker
        borderColor: config.color,
        opacity: 0.7,
        borderStyle: 'solid',
        borderWidth: '2px',
      };
    } else if (task.status === 'in_progress') {
      return {
        backgroundColor: config.color,
        borderColor: config.color,
        borderStyle: 'solid',
        borderWidth: '2px',
      };
    } else {
      return {
        backgroundColor: `${config.color}40`, // Lighter
        borderColor: config.color,
        borderStyle: 'dashed',
        borderWidth: '2px',
      };
    }
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Project Timeline</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All ({scheduledTasks.length})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              filter === 'completed'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Completed ({stats.completedCount || 0})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              filter === 'active'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Active ({stats.activeCount || 0})
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${chartWidth + 200}px` }}>
          {/* Week headers */}
          <div className="flex items-center mb-2">
            <div className="w-48 flex-shrink-0"></div>
            <div className="flex">
              {Array.from({ length: maxWeek }, (_, i) => (
                <div
                  key={i}
                  className="text-xs font-semibold text-gray-400 text-center"
                  style={{ width: `${weekWidth}px` }}
                >
                  Week {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Task rows by owner */}
          {owners.map(owner => (
            <div key={owner} className="mb-4">
              <div className="flex items-start">
                {/* Owner name */}
                <div className="w-48 flex-shrink-0 pr-4">
                  <div className="font-semibold text-white">{owner}</div>
                  <div className="text-xs text-gray-400">
                    {tasksByOwner[owner].length} task{tasksByOwner[owner].length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Timeline */}
                <div className="flex-1 relative" style={{ height: `${tasksByOwner[owner].length * 40 + 20}px` }}>
                  {/* Week grid */}
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: maxWeek }, (_, i) => (
                      <div
                        key={i}
                        className="border-r border-gray-700"
                        style={{ width: `${weekWidth}px` }}
                      ></div>
                    ))}
                  </div>

                  {/* Tasks */}
                  {tasksByOwner[owner].map((task, idx) => {
                    const left = ((task.startWeek - 1) * weekWidth);
                    const width = ((task.endWeek - task.startWeek + 1) * weekWidth) - 8;
                    const top = idx * 40 + 10;

                    return (
                      <div
                        key={task.taskId || idx}
                        className="absolute rounded px-2 py-1 cursor-pointer transition-all hover:shadow-lg"
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          top: `${top}px`,
                          ...getTaskStyle(task)
                        }}
                        onMouseEnter={() => setHoveredTask(task)}
                        onMouseLeave={() => setHoveredTask(null)}
                      >
                        <div className="flex items-center gap-2">
                          {task.status === 'completed' && (
                            <span className="text-white text-sm">✓</span>
                          )}
                          <span className="text-xs font-medium truncate text-white">
                            {task.taskName}
                          </span>
                        </div>

                        {/* Tooltip */}
                        {hoveredTask?.taskId === task.taskId && hoveredTask?.taskOwner === task.taskOwner && (
                          <div className="absolute z-10 bg-gray-900 text-white text-xs rounded p-3 shadow-xl whitespace-nowrap border border-gray-700"
                               style={{ top: '100%', left: '0', marginTop: '4px' }}>
                            <div><strong>{task.taskName}</strong></div>
                            {task.allOwners && task.allOwners.length > 1 ? (
                              <div>Team: {task.allOwners.join(', ')}</div>
                            ) : (
                              <div>Owner: {task.taskOwner}</div>
                            )}
                            <div>Week {task.startWeek} - {task.endWeek} ({task.durationDays} days)</div>
                            <div>Type: {task.activityType}</div>
                            <div>Status: <span className="capitalize">{task.status.replace('_', ' ')}</span></div>
                            {task.isFrozen && <div className="text-yellow-300">🔒 Frozen (Completed)</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="text-sm font-medium text-gray-300 mb-2">Legend</div>
          <div className="flex flex-wrap gap-4 text-xs text-gray-300">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 opacity-70 border-2 border-green-600 rounded"></div>
              <span>Completed (Frozen)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 border-2 border-blue-600 rounded"></div>
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-500 border-2 border-gray-600 border-dashed rounded"></div>
              <span>Not Started</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinalProjectReport;
