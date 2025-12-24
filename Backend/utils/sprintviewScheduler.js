/**
 * Enterprise-Grade SprintView Chart Scheduler
 * Implements standard SprintView chart theory with resource leveling
 * 
 * Core Principles:
 * - 1 Week = 5 Working Days
 * - Tasks with same owner execute sequentially (resource constraint)
 * - Tasks with different owners can run in parallel
 * - Multiple activity types with specific scheduling rules
 */

const WORKING_DAYS_PER_WEEK = 5;

/**
 * Get the earliest date from tasks to use as project start
 * @param {Array} tasks - Array of task objects
 * @returns {Date} Project start date
 */
function getProjectStartDate(tasks) {
  const relevantDates = [];
  
  // Collect all relevant dates from tasks (start dates and due dates)
  tasks.forEach(t => {
    if (t.startDate) relevantDates.push(new Date(t.startDate));
    if (t.dueDate) relevantDates.push(new Date(t.dueDate));
  });
  
  if (relevantDates.length > 0) {
    // Use the earliest date, ensuring it's normalized
    const earliestDate = new Date(Math.min(...relevantDates));
    earliestDate.setHours(0, 0, 0, 0);
    return earliestDate;
  }
  
  // If no dates at all, use start of current month to prevent daily shifts
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth;
}

/**
 * Convert a date to working day number from project start
 * @param {Date|string} date - Date to convert
 * @param {Date} projectStartDate - Project start date
 * @returns {number} Working day number (1-based)
 */
function dateToWorkingDay(date, projectStartDate) {
  const d = new Date(date);
  const start = new Date(projectStartDate);
  d.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  
  let workingDays = 0;
  const current = new Date(start);
  
  while (current < d) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays + 1; // 1-based
}

/**
 * Add working days to a date
 * @param {Date} startDate - Start date
 * @param {number} days - Number of working days to add (supports fractional days)
 * @returns {Date} Resulting date
 */
function addWorkingDays(startDate, days) {
  const date = new Date(startDate);
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
 * Activity Types and their scheduling behavior
 */
const ACTIVITY_TYPES = {
  ONE_TIME: 'ONE_TIME',
  CONTINUOUS: 'CONTINUOUS',
  API_1_DAY: 'API_1_DAY',
  RECURRING_WEEKLY: 'RECURRING_WEEKLY',
  MILESTONE: 'MILESTONE',
  BUFFER: 'BUFFER',
  PARALLEL_ALLOWED: 'PARALLEL_ALLOWED'
};

/**
 * Convert day number to week number
 * @param {number} day - Day number (1-based)
 * @returns {number} Week number
 */
function dayToWeek(day) {
  return Math.ceil(day / WORKING_DAYS_PER_WEEK);
}

/**
 * Calculate duration based on activity type
 * @param {Object} task - Task object
 * @returns {number} Duration in working days
 */
function calculateDuration(task) {
  const { activityType, tentativeEtaDays } = task;

  switch (activityType) {
    case ACTIVITY_TYPES.API_1_DAY:
      return 1;
    
    case ACTIVITY_TYPES.MILESTONE:
      return 0;
    
    case ACTIVITY_TYPES.RECURRING_WEEKLY:
      return 1; // 1 day per week
    
    case ACTIVITY_TYPES.ONE_TIME:
    case ACTIVITY_TYPES.BUFFER:
    case ACTIVITY_TYPES.CONTINUOUS:
    case ACTIVITY_TYPES.PARALLEL_ALLOWED:
    default:
      return tentativeEtaDays ?? 1;
  }
}

/**
 * Check if task can overlap with others for same owner
 * @param {string} activityType - Activity type
 * @returns {boolean}
 */
function canOverlap(activityType) {
  return activityType === ACTIVITY_TYPES.PARALLEL_ALLOWED;
}

/**
 * Main SprintView Scheduling Algorithm
 * Implements resource-aware task scheduling with proper sequencing
 * 
 * @param {Array} tasks - Array of task objects
 * @returns {Object} Scheduled tasks and project metadata
 */
function scheduleSprintViewTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return {
      scheduledTasks: [],
      totalProjectDays: 0,
      totalProjectWeeks: 0,
      ownerTimelines: {},
      projectStartDate: new Date()
    };
  }

  // Determine project start date from tasks
  const projectStartDate = getProjectStartDate(tasks);
  
  // Track next available day for each owner
  const ownerAvailability = {};
  
  // Track continuous tasks that need end date adjustment
  const continuousTasks = [];
  
  // Results array
  const scheduledTasks = [];

  // Process tasks in order (FIFO per owner)
  tasks.forEach((task, index) => {
    const {
      taskName,
      tentativeEtaDays,
      activityType,
      taskOwner,
      startDate,
      dueDate
    } = task;

    // Initialize owner availability
    if (!ownerAvailability[taskOwner]) {
      ownerAvailability[taskOwner] = 1; // Start at Day 1
    }

    // Calculate duration
    const durationDays = calculateDuration(task);

    // Determine start day
    let startDay;
    let actualStartDate;
    
    if (startDate) {
      // Use actual start date from task
      actualStartDate = new Date(startDate);
      startDay = dateToWorkingDay(actualStartDate, projectStartDate);
    } else if (canOverlap(activityType)) {
      // PARALLEL_ALLOWED: Start at Day 1, doesn't block owner
      startDay = 1;
      actualStartDate = new Date(projectStartDate);
    } else {
      // Sequential: Start at next available day for this owner
      startDay = ownerAvailability[taskOwner];
      actualStartDate = addWorkingDays(projectStartDate, startDay - 1);
    }

    // Calculate end day
    let endDay;
    let actualEndDate;
    
    const isZeroDuration = durationDays === 0;

    // For fractional days (0.5), ensure at least 1 day duration for rendering.
    // For 0-day tasks, preserve true zero duration.
    const effectiveDuration = isZeroDuration ? 0 : Math.max(1, Math.ceil(durationDays));
    
    if (activityType === ACTIVITY_TYPES.MILESTONE || isZeroDuration) {
      // Milestone: No duration
      endDay = startDay;
      actualEndDate = actualStartDate;
    } else if (activityType === ACTIVITY_TYPES.CONTINUOUS) {
      // Continuous: Mark for later adjustment to project end
      endDay = startDay + effectiveDuration - 1;
      actualEndDate = addWorkingDays(actualStartDate, effectiveDuration - 1);
      continuousTasks.push(scheduledTasks.length); // Store index
    } else if (activityType === ACTIVITY_TYPES.RECURRING_WEEKLY) {
      // Recurring: 1 day per week, doesn't block full week
      endDay = startDay; // Each occurrence is 1 day
      actualEndDate = actualStartDate;
    } else {
      // ONE_TIME, BUFFER, API_1_DAY
      endDay = startDay + effectiveDuration - 1;
      actualEndDate = addWorkingDays(actualStartDate, effectiveDuration - 1);
    }

    // Update owner availability (only if not parallel and no explicit start date)
    if (!startDate && !canOverlap(activityType) && activityType !== ACTIVITY_TYPES.RECURRING_WEEKLY && !isZeroDuration) {
      ownerAvailability[taskOwner] = endDay + 1;
    } else if (!startDate && activityType === ACTIVITY_TYPES.RECURRING_WEEKLY) {
      // Recurring weekly: Increment by 1 day (doesn't block full duration)
      ownerAvailability[taskOwner] = startDay + 1;
    }

    // Calculate weeks
    const startWeek = dayToWeek(startDay);
    const endWeek = dayToWeek(endDay);

    // Create scheduled task - preserve all original fields + add calculated dates
    const scheduledTask = {
      ...task, // Preserve all original fields (dueDate, completed, taskId, etc.)
      taskName,
      taskOwner,
      activityType,
      tentativeEtaDays,
      durationDays: durationDays, // Original duration (can be 0.5)
      effectiveDuration, // Rounded up duration for scheduling
      startDay,
      endDay,
      startWeek,
      endWeek,
      calculatedStartDate: actualStartDate.toISOString(),
      calculatedEndDate: actualEndDate.toISOString()
    };

    scheduledTasks.push(scheduledTask);
  });

  // Calculate total project duration
  const totalProjectDays = Math.max(...scheduledTasks.map(t => t.endDay), 0);
  const totalProjectWeeks = dayToWeek(totalProjectDays);

  // Update CONTINUOUS tasks to extend to project end
  continuousTasks.forEach(index => {
    scheduledTasks[index].endDay = totalProjectDays;
    scheduledTasks[index].endWeek = totalProjectWeeks;
    scheduledTasks[index].durationDays = totalProjectDays - scheduledTasks[index].startDay + 1;
  });

  // Build owner timeline summary
  const ownerTimelines = {};
  Object.keys(ownerAvailability).forEach(owner => {
    const ownerTasks = scheduledTasks.filter(t => t.taskOwner === owner);
    ownerTimelines[owner] = {
      totalTasks: ownerTasks.length,
      lastAvailableDay: ownerAvailability[owner],
      tasks: ownerTasks.map(t => t.taskName)
    };
  });

  return {
    scheduledTasks,
    totalProjectDays,
    totalProjectWeeks,
    ownerTimelines,
    projectStartDate: projectStartDate.toISOString(),
    metadata: {
      totalTasks: tasks.length,
      workingDaysPerWeek: WORKING_DAYS_PER_WEEK,
      scheduledAt: new Date().toISOString()
    }
  };
}

/**
 * Generate recurring task occurrences across weeks
 * @param {Object} task - Scheduled recurring task
 * @param {number} totalWeeks - Total project weeks
 * @returns {Array} Array of task occurrences
 */
function expandRecurringTask(task, totalWeeks) {
  if (task.activityType !== ACTIVITY_TYPES.RECURRING_WEEKLY) {
    return [task];
  }

  const occurrences = [];
  for (let week = task.startWeek; week <= totalWeeks; week++) {
    const dayInWeek = (week - 1) * WORKING_DAYS_PER_WEEK + 1; // First day of week
    occurrences.push({
      ...task,
      startDay: dayInWeek,
      endDay: dayInWeek,
      startWeek: week,
      endWeek: week,
      isRecurringOccurrence: true,
      occurrenceWeek: week
    });
  }
  return occurrences;
}

/**
 * Validate input tasks
 * @param {Array} tasks - Tasks to validate
 * @returns {Object} Validation result
 */
function validateTasks(tasks) {
  const errors = [];

  if (!Array.isArray(tasks)) {
    return { valid: false, errors: ['Tasks must be an array'] };
  }

  tasks.forEach((task, index) => {
    if (!task.taskName) {
      errors.push(`Task ${index}: taskName is required`);
    }
    if (!task.taskOwner) {
      errors.push(`Task ${index}: taskOwner is required`);
    }
    if (task.tentativeEtaDays !== undefined && (typeof task.tentativeEtaDays !== 'number' || task.tentativeEtaDays < 0)) {
      errors.push(`Task ${index}: tentativeEtaDays must be a positive number`);
    }
    if (task.activityType && !Object.values(ACTIVITY_TYPES).includes(task.activityType)) {
      errors.push(`Task ${index}: invalid activityType "${task.activityType}"`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  scheduleSprintViewTasks,
  expandRecurringTask,
  validateTasks,
  ACTIVITY_TYPES,
  WORKING_DAYS_PER_WEEK
};
