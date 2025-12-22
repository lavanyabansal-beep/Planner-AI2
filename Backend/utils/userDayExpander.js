/**
 * User Day-Level SprintView Expander
 * 
 * Transforms scheduled tasks into per-user, per-day occupancy grid
 * Enables team-lead dashboard showing exact day-level allocation
 * 
 * Core Principle: Map each task to discrete day cells per user
 */

const WORKING_DAYS_PER_WEEK = 5;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * Expand scheduled tasks into user-day grid
 * 
 * @param {Array} scheduledTasks - Output from scheduleSprintViewTasks
 * @param {number} totalProjectWeeks - Total project duration in weeks
 * @param {Date} projectStartDate - Project start date for calendar date calculation
 * @returns {Object} Per-user day-level allocation data
 */
function expandToUserDayView(scheduledTasks, totalProjectWeeks, projectStartDate = null) {
  if (!scheduledTasks || scheduledTasks.length === 0) {
    return {
      users: [],
      totalWeeks: 0,
      totalDays: 0,
      weekGrid: [],
      dayGrid: [],
      projectStartDate: projectStartDate || new Date()
    };
  }

  const totalProjectDays = totalProjectWeeks * WORKING_DAYS_PER_WEEK;
  
  // Build week grid structure with actual dates
  const weekGrid = buildWeekGrid(totalProjectWeeks, projectStartDate);
  
  // Build day grid structure (absolute day numbers)
  const dayGrid = buildDayGrid(totalProjectWeeks, projectStartDate);
  
  // Group tasks by user
  const userTaskMap = groupTasksByUser(scheduledTasks);
  
  // For each user, build day-level occupancy
  const users = Object.keys(userTaskMap).map(userName => {
    const userTasks = userTaskMap[userName];
    const dayOccupancy = buildUserDayOccupancy(userTasks, totalProjectDays, totalProjectWeeks, projectStartDate);
    
    return {
      userName,
      totalTasks: userTasks.length,
      weeks: dayOccupancy.weeks,
      stats: calculateUserStats(dayOccupancy, totalProjectDays)
    };
  });

  // Sort users by name for consistent display
  users.sort((a, b) => a.userName.localeCompare(b.userName));

  return {
    users,
    totalWeeks: totalProjectWeeks,
    totalDays: totalProjectDays,
    weekGrid,
    dayGrid,
    projectStartDate: projectStartDate || new Date(),
    metadata: {
      totalUsers: users.length,
      totalTasks: scheduledTasks.length,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Calculate the calendar date for a working day number
 * @param {Date} startDate - Project start date
 * @param {number} workingDays - Number of working days to add (0-based)
 * @returns {Date} Resulting date
 */
function calculateWorkingDayDate(startDate, workingDays) {
  const date = new Date(startDate);
  let remaining = workingDays;
  
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }
  
  return date;
}

/**
 * Build week grid structure
 * @param {number} totalWeeks - Total number of weeks
 * @param {Date} projectStartDate - Project start date
 * @returns {Array} Week metadata with actual calendar dates
 */
function buildWeekGrid(totalWeeks, projectStartDate = null) {
  const start = projectStartDate ? new Date(projectStartDate) : new Date();
  
  return Array.from({ length: totalWeeks }, (_, i) => ({
    weekNumber: i + 1,
    startDay: i * WORKING_DAYS_PER_WEEK + 1,
    endDay: (i + 1) * WORKING_DAYS_PER_WEEK,
    days: Array.from({ length: WORKING_DAYS_PER_WEEK }, (_, d) => {
      const absoluteDay = i * WORKING_DAYS_PER_WEEK + d + 1;
      const date = projectStartDate ? calculateWorkingDayDate(start, absoluteDay - 1) : null;
      return {
        dayInWeek: d + 1,
        dayName: DAY_NAMES[d],
        absoluteDay,
        date: date ? date.toISOString() : null
      };
    })
  }));
}

/**
 * Build flat day grid (for header rendering)
 * @param {number} totalWeeks - Total number of weeks
 * @param {Date} projectStartDate - Project start date
 * @returns {Array} Day metadata with actual calendar dates
 */
function buildDayGrid(totalWeeks, projectStartDate = null) {
  const days = [];
  const start = projectStartDate ? new Date(projectStartDate) : new Date();
  
  for (let week = 1; week <= totalWeeks; week++) {
    for (let dayInWeek = 1; dayInWeek <= WORKING_DAYS_PER_WEEK; dayInWeek++) {
      const absoluteDay = (week - 1) * WORKING_DAYS_PER_WEEK + dayInWeek;
      const date = projectStartDate ? calculateWorkingDayDate(start, absoluteDay - 1) : null;
      days.push({
        absoluteDay,
        week,
        dayInWeek,
        dayName: DAY_NAMES[dayInWeek - 1],
        date: date ? date.toISOString() : null
      });
    }
  }
  return days;
}

/**
 * Group tasks by user
 */
function groupTasksByUser(tasks) {
  return tasks.reduce((acc, task) => {
    const owner = task.taskOwner;
    if (!acc[owner]) acc[owner] = [];
    acc[owner].push(task);
    return acc;
  }, {});
}

/**
 * Build day-level occupancy for a single user
 * 
 * Critical: Only highlight days where task is actually active
 * 
 * @param {Array} userTasks - All tasks for this user
 * @param {number} totalDays - Total project days
 * @param {number} totalWeeks - Total project weeks
 * @param {Date} projectStartDate - Project start date
 * @returns {Object} Week-day structure with occupancy
 */
function buildUserDayOccupancy(userTasks, totalDays, totalWeeks, projectStartDate = null) {
  const start = projectStartDate ? new Date(projectStartDate) : new Date();
  
  // Initialize week structure
  const weeks = Array.from({ length: totalWeeks }, (_, weekIdx) => ({
    weekNumber: weekIdx + 1,
    days: Array.from({ length: WORKING_DAYS_PER_WEEK }, (_, dayIdx) => {
      const absoluteDay = weekIdx * WORKING_DAYS_PER_WEEK + dayIdx + 1;
      const date = projectStartDate ? calculateWorkingDayDate(start, absoluteDay - 1) : null;
      return {
        dayInWeek: dayIdx + 1,
        dayName: DAY_NAMES[dayIdx],
        absoluteDay,
        date: date ? date.toISOString() : null,
        tasks: [],
        isEmpty: true
      };
    })
  }));

  // Map tasks to days
  userTasks.forEach(task => {
    const { startDay, endDay, taskName, activityType, durationDays } = task;

    // Handle different activity types
    if (activityType === 'MILESTONE') {
      // Milestone: Only mark the single day
      markDayOccupied(weeks, startDay, task);
    } else if (activityType === 'RECURRING_WEEKLY') {
      // Recurring: Mark first day of each week
      for (let week = task.startWeek; week <= task.endWeek; week++) {
        const firstDayOfWeek = (week - 1) * WORKING_DAYS_PER_WEEK + 1;
        markDayOccupied(weeks, firstDayOfWeek, {
          ...task,
          taskName: `${taskName} (Week ${week})`,
          isRecurringInstance: true,
          weekInstance: week
        });
      }
    } else {
      // Standard tasks: Mark all days from startDay to endDay
      for (let day = startDay; day <= endDay; day++) {
        markDayOccupied(weeks, day, task);
      }
    }
  });

  return { weeks };
}

/**
 * Mark a specific day as occupied by a task
 * 
 * @param {Array} weeks - Week structure
 * @param {number} absoluteDay - Absolute day number (1-based)
 * @param {Object} task - Task object
 */
function markDayOccupied(weeks, absoluteDay, task) {
  const weekIdx = Math.floor((absoluteDay - 1) / WORKING_DAYS_PER_WEEK);
  const dayIdxInWeek = (absoluteDay - 1) % WORKING_DAYS_PER_WEEK;

  if (weekIdx >= 0 && weekIdx < weeks.length) {
    const dayCell = weeks[weekIdx].days[dayIdxInWeek];
    
    // Safety check: ensure dayCell exists and has tasks array
    if (!dayCell || !dayCell.tasks) {
      console.error(`Day cell not found: week ${weekIdx}, day ${dayIdxInWeek}, absoluteDay ${absoluteDay}`);
      return;
    }
    
    dayCell.tasks.push({
      taskName: task.taskName,
      activityType: task.activityType,
      durationDays: task.durationDays,
      startDay: task.startDay,
      endDay: task.endDay,
      isRecurringInstance: task.isRecurringInstance || false,
      weekInstance: task.weekInstance || null
    });
    dayCell.isEmpty = false;
  }
}

/**
 * Calculate utilization statistics for a user
 */
function calculateUserStats(dayOccupancy, totalDays) {
  let occupiedDays = 0;
  let overlappingDays = 0;
  
  dayOccupancy.weeks.forEach(week => {
    week.days.forEach(day => {
      if (!day.isEmpty) {
        occupiedDays++;
        if (day.tasks.length > 1) {
          overlappingDays++;
        }
      }
    });
  });

  const utilization = totalDays > 0 ? (occupiedDays / totalDays * 100).toFixed(1) : 0;
  
  return {
    occupiedDays,
    freeDays: totalDays - occupiedDays,
    utilization: parseFloat(utilization),
    overlappingDays,
    hasOverload: overlappingDays > 0
  };
}

/**
 * Get day color based on occupancy
 * Returns CSS class indicators for frontend
 */
function getDayColorClass(day) {
  if (day.isEmpty) return 'empty';
  if (day.tasks.length > 1) return 'overloaded';
  return 'occupied';
}

/**
 * Export as flat array for simpler rendering
 * Alternative format for grid-based UIs
 */
function expandToFlatGrid(scheduledTasks, totalProjectWeeks, projectStartDate = null) {
  const expanded = expandToUserDayView(scheduledTasks, totalProjectWeeks, projectStartDate);
  
  const flatRows = expanded.users.map(user => {
    const allDays = user.weeks.flatMap(week => week.days);
    return {
      userName: user.userName,
      stats: user.stats,
      days: allDays.map(day => ({
        absoluteDay: day.absoluteDay,
        tasks: day.tasks,
        isEmpty: day.isEmpty,
        colorClass: getDayColorClass(day)
      }))
    };
  });

  return {
    rows: flatRows,
    totalWeeks: expanded.totalWeeks,
    totalDays: expanded.totalDays,
    dayGrid: expanded.dayGrid,
    metadata: expanded.metadata
  };
}

module.exports = {
  expandToUserDayView,
  expandToFlatGrid,
  WORKING_DAYS_PER_WEEK,
  DAY_NAMES
};
