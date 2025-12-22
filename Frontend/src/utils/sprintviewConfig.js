/**
 * SprintView Chart Visualization Configuration
 * Defines visual styling for different activity types
 */

export const ACTIVITY_TYPE_CONFIG = {
  ONE_TIME: {
    label: 'One-Time Task',
    color: '#3b82f6', // Blue
    borderStyle: 'solid',
    opacity: 1,
    className: 'rounded-md h-7',
    description: 'Standard task with fixed duration'
  },
  
  CONTINUOUS: {
    label: 'Continuous Task',
    color: '#8b5cf6', // Purple
    borderStyle: 'solid',
    opacity: 0.85,
    className: 'rounded-md h-7',
    description: 'Task that runs until project end'
  },
  
  API_1_DAY: {
    label: 'API Integration',
    color: '#10b981', // Green
    borderStyle: 'solid',
    opacity: 1,
    className: 'rounded-md h-5',
    description: 'API integration task (always 1 day)'
  },
  
  RECURRING_WEEKLY: {
    label: 'Recurring Weekly',
    color: '#f59e0b', // Amber
    borderStyle: 'solid',
    opacity: 0.9,
    className: 'rounded-md h-6',
    description: 'Task that repeats weekly'
  },
  
  MILESTONE: {
    label: 'Milestone',
    color: '#ef4444', // Red
    borderStyle: 'solid',
    opacity: 1,
    className: 'rotate-45 h-4 w-4',
    description: 'Zero-duration checkpoint'
  },
  
  BUFFER: {
    label: 'Buffer/Padding',
    color: '#6b7280', // Gray
    borderStyle: 'dashed',
    opacity: 0.6,
    className: 'rounded-md h-6',
    description: 'Risk padding (blocks owner availability)'
  },
  
  PARALLEL_ALLOWED: {
    label: 'Parallel Task',
    color: '#06b6d4', // Cyan
    borderStyle: 'solid',
    opacity: 0.7,
    className: 'rounded-md h-7',
    description: 'Can overlap with other tasks for same owner'
  }
};

export const WORKING_DAYS_PER_WEEK = 5;

/**
 * Convert days to weeks (ceiling)
 */
export function dayToWeek(day) {
  return Math.ceil(day / WORKING_DAYS_PER_WEEK);
}

/**
 * Convert weeks to days (start of week)
 */
export function weekToDay(week) {
  return (week - 1) * WORKING_DAYS_PER_WEEK + 1;
}

/**
 * Format duration for display
 */
export function formatDuration(days, weeks) {
  if (days === 0) return 'Milestone';
  if (days === 1) return '1 day';
  if (weeks === 1) return `${days} days (1 week)`;
  return `${days} days (${weeks} weeks)`;
}

/**
 * Get color for owner (consistent hashing)
 */
const OWNER_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export function getOwnerColor(ownerName) {
  const hash = ownerName.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  return OWNER_COLORS[hash % OWNER_COLORS.length];
}

/**
 * Sort tasks for optimal SprintView display
 */
export function sortTasksForSprintView(tasks) {
  return [...tasks].sort((a, b) => {
    // First by owner
    if (a.taskOwner !== b.taskOwner) {
      return a.taskOwner.localeCompare(b.taskOwner);
    }
    // Then by start day
    return a.startDay - b.startDay;
  });
}

/**
 * Calculate project statistics
 */
export function calculateProjectStats(scheduledTasks, totalProjectWeeks) {
  const stats = {
    totalTasks: scheduledTasks.length,
    totalWeeks: totalProjectWeeks,
    totalWorkingDays: totalProjectWeeks * WORKING_DAYS_PER_WEEK,
    owners: new Set(scheduledTasks.map(t => t.taskOwner)).size,
    activityTypes: {},
    longestTask: null,
    shortestTask: null
  };

  // Count activity types
  scheduledTasks.forEach(task => {
    const type = task.activityType || 'ONE_TIME';
    stats.activityTypes[type] = (stats.activityTypes[type] || 0) + 1;

    // Track longest/shortest
    if (!stats.longestTask || task.durationDays > stats.longestTask.durationDays) {
      stats.longestTask = task;
    }
    if (!stats.shortestTask || task.durationDays < stats.shortestTask.durationDays) {
      stats.shortestTask = task;
    }
  });

  return stats;
}

/**
 * Export SprintView data to CSV
 */
export function exportSprintViewToCSV(scheduledTasks, totalProjectWeeks) {
  const headers = [
    'Task Name',
    'Owner',
    'Activity Type',
    'Duration (Days)',
    'Start Day',
    'End Day',
    'Start Week',
    'End Week'
  ];

  const rows = scheduledTasks.map(task => [
    task.taskName,
    task.taskOwner,
    task.activityType,
    task.durationDays,
    task.startDay,
    task.endDay,
    task.startWeek,
    task.endWeek
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
}

/**
 * Download CSV file
 */
export function downloadCSV(csv, filename = 'sprintview-chart.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Check if a task is overdue
 * @param {Object} task - Task object with dueDate and completed status
 * @param {Date} currentDate - Current date to compare against
 * @returns {boolean} True if task is overdue
 */
export function isTaskOverdue(task, currentDate = new Date()) {
  if (!task.dueDate) {
    console.log('Task has no dueDate:', task.taskName || task.title);
    return false;
  }
  
  if (task.completed) {
    console.log('Task is completed:', task.taskName || task.title);
    return false;
  }
  
  const dueDateObj = typeof task.dueDate === 'string' ? new Date(task.dueDate) : new Date(task.dueDate);
  const currentDateObj = typeof currentDate === 'string' ? new Date(currentDate) : new Date(currentDate);
  
  // Reset time to start of day for comparison
  dueDateObj.setHours(0, 0, 0, 0);
  currentDateObj.setHours(0, 0, 0, 0);
  
  const isOverdue = currentDateObj > dueDateObj;
  
  console.log(`Overdue check for "${task.taskName || task.title}":`, {
    dueDate: dueDateObj.toISOString(),
    currentDate: currentDateObj.toISOString(),
    isOverdue,
    completed: task.completed
  });
  
  return isOverdue;
}

/**
 * Overdue highlight color
 */
export const OVERDUE_COLOR = '#FF4D4F';

/**
 * ==============================
 * DATE UTILITY FUNCTIONS
 * ==============================
 * Centralized date calculations for accurate timeline positioning
 */

/**
 * Normalize date to midnight UTC for consistent comparisons
 * @param {Date|string} date - Date to normalize
 * @returns {Date} Normalized date at midnight
 */
export function normalizeDate(date) {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate difference in calendar days between two dates
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {number} Number of days (can be negative if endDate < startDate)
 */
export function getCalendarDaysDiff(startDate, endDate) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  const diffMs = end - start;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate working days between two dates (excluding weekends)
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {number} Number of working days
 */
export function getWorkingDaysDiff(startDate, endDate) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  
  let workingDays = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
}

/**
 * Add working days to a date (skipping weekends)
 * @param {Date|string} startDate - Start date
 * @param {number} days - Number of working days to add (supports fractional days)
 * @returns {Date} Resulting date
 */
export function addWorkingDays(startDate, days) {
  const date = normalizeDate(startDate);
  // For fractional days (e.g., 0.5), round up to show at least one day
  let remaining = Math.ceil(days);
  
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }
  
  return date;
}

/**
 * Convert a date to a day number in the project timeline
 * @param {Date|string} date - Date to convert
 * @param {Date|string} projectStartDate - Project start date
 * @returns {number} Day number (1-based, working days only)
 */
export function dateToProjectDay(date, projectStartDate) {
  const workingDays = getWorkingDaysDiff(projectStartDate, date);
  return Math.max(1, workingDays + 1); // 1-based, minimum day 1
}

/**
 * Convert a project day number to a calendar date
 * @param {number} dayNumber - Day number (1-based)
 * @param {Date|string} projectStartDate - Project start date
 * @returns {Date} Calendar date
 */
export function projectDayToDate(dayNumber, projectStartDate) {
  const start = normalizeDate(projectStartDate);
  return addWorkingDays(start, dayNumber - 1);
}

/**
 * Check if a date is a working day (Mon-Fri)
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if working day
 */
export function isWorkingDay(date) {
  const d = normalizeDate(date);
  const dayOfWeek = d.getDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

/**
 * Get the project start date from scheduled tasks
 * Falls back to a default if no tasks have startDate
 * @param {Array} tasks - Array of scheduled tasks
 * @returns {Date} Project start date
 */
export function getProjectStartDate(tasks) {
  if (!tasks || tasks.length === 0) {
    return normalizeDate(new Date()); // Default to today
  }
  
  // Find earliest startDate
  const datesWithStartDate = tasks
    .filter(t => t.startDate)
    .map(t => normalizeDate(t.startDate));
  
  if (datesWithStartDate.length === 0) {
    return normalizeDate(new Date()); // Default to today
  }
  
  return new Date(Math.min(...datesWithStartDate));
}

/**
 * Calculate which day a task's due date falls on relative to task timeline
 * @param {Object} task - Task with startDate, endDate or dueDate
 * @param {Date} projectStartDate - Project start date
 * @returns {number|null} Day number where due date occurs, or null
 */
export function calculateDueDateDay(task, projectStartDate) {
  if (!task.dueDate) return null;
  
  const dueDate = normalizeDate(task.dueDate);
  const dueDateDay = dateToProjectDay(dueDate, projectStartDate);
  
  return dueDateDay;
}
