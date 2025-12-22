/**
 * Final Project Report Scheduler
 * 
 * Completion-safe scheduling that preserves completed tasks and shows ALL team members
 */

/**
 * Check if task is completed
 */
function isTaskCompleted(task) {
  return task.completed === true || task.progress === 'completed';
}

/**
 * Get project start date
 */
function getProjectStartDate(tasks) {
  if (!tasks || tasks.length === 0) return new Date();
  
  let earliest = new Date();
  tasks.forEach(task => {
    const taskStart = task.actualStartDate || task.startDate;
    if (taskStart && new Date(taskStart) < earliest) {
      earliest = new Date(taskStart);
    }
  });
  
  return earliest;
}

/**
 * Convert day to week (1-indexed)
 */
function dayToWeek(day) {
  return Math.ceil(day / 5);
}

/**
 * Calculate working days between dates
 */
function getWorkingDaysBetween(startDate, endDate) {
  let days = 0;
  let current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) days++;
    current.setDate(current.getDate() + 1);
  }
  
  return Math.max(1, days);
}

/**
 * Get all task owner names from a task
 */
function getTaskOwnerNames(task) {
  const owners = [];
  
  if (task.assignedTo && task.assignedTo.length > 0) {
    task.assignedTo.forEach(assigned => {
      if (typeof assigned === 'string') {
        owners.push(assigned);
      } else if (assigned.name) {
        owners.push(assigned.name);
      } else if (assigned._id) {
        owners.push(assigned._id.toString());
      }
    });
  }
  
  if (owners.length === 0) {
    return [task.taskOwner || 'Unassigned'];
  }
  
  return owners;
}

/**
 * Schedule tasks for Final Project Report
 * Shows ALL team members (even without tasks)
 */
function scheduleForFinalReport(tasks, allUsers = []) {
  const projectStartDate = getProjectStartDate(tasks);
  
  // Initialize owner timelines with ALL users
  const ownerTimelines = {};
  allUsers.forEach(user => {
    const userName = user.name || user.email || user._id.toString();
    ownerTimelines[userName] = {
      lastAvailableDay: 1,
      totalTasks: 0,
      completedTasks: 0,
      activeTasks: 0,
      tasks: []
    };
  });
  
  if (!tasks || tasks.length === 0) {
    return {
      scheduledTasks: [],
      completedTasks: [],
      activeTasks: [],
      ownerTimelines,
      totalProjectWeeks: 0,
      totalProjectDays: 0,
      projectStartDate: projectStartDate.toISOString(),
      reportGeneratedAt: new Date().toISOString(),
      stats: {
        totalTasks: 0,
        completedCount: 0,
        activeCount: 0,
        completionRate: 0
      }
    };
  }
  
  // Separate completed and active tasks
  const completedTasks = tasks.filter(isTaskCompleted);
  const activeTasks = tasks.filter(t => !isTaskCompleted(t));
  
  // Process completed tasks (frozen) - create entry for EACH assigned member
  const processedCompleted = [];
  completedTasks.forEach(task => {
    const owners = getTaskOwnerNames(task);
    const actualStart = task.actualStartDate || task.startDate || projectStartDate;
    const actualEnd = task.actualEndDate || task.dueDate || actualStart;
    
    const startDay = getWorkingDaysBetween(projectStartDate, actualStart);
    const endDay = getWorkingDaysBetween(projectStartDate, actualEnd);
    const durationDays = Math.max(1, endDay - startDay + 1);
    
    // Create a task entry for EACH assigned member
    owners.forEach(owner => {
      processedCompleted.push({
        ...task,
        taskId: task._id?.toString() || task.taskId,
        taskName: task.title || task.taskName,
        taskOwner: owner,
        allOwners: owners, // Store all owners for display
        startDay,
        endDay,
        startWeek: dayToWeek(startDay),
        endWeek: dayToWeek(endDay),
        durationDays,
        status: 'completed',
        isFrozen: true
      });
    });
  });
  
  // Add completed tasks to owner timelines
  processedCompleted.forEach(task => {
    const owner = task.taskOwner;
    
    if (!ownerTimelines[owner]) {
      ownerTimelines[owner] = {
        lastAvailableDay: 1,
        totalTasks: 0,
        completedTasks: 0,
        activeTasks: 0,
        tasks: []
      };
    }
    
    ownerTimelines[owner].completedTasks++;
    ownerTimelines[owner].totalTasks++;
    ownerTimelines[owner].tasks.push({
      taskId: task.taskId,
      taskName: task.taskName,
      status: 'completed',
      startDay: task.startDay,
      endDay: task.endDay,
      durationDays: task.durationDays,
      activityType: task.activityType,
      allOwners: task.allOwners
    });
    
    ownerTimelines[owner].lastAvailableDay = 
      Math.max(ownerTimelines[owner].lastAvailableDay, task.endDay + 1);
  });
  
  // Schedule active tasks - create entry for EACH assigned member
  const processedActive = [];
  
  activeTasks.forEach(task => {
    const owners = getTaskOwnerNames(task);
    
    // For each owner, schedule the task
    owners.forEach(owner => {
      if (!ownerTimelines[owner]) {
        ownerTimelines[owner] = {
          lastAvailableDay: 1,
          totalTasks: 0,
          completedTasks: 0,
          activeTasks: 0,
          tasks: []
        };
      }
      
      const startDay = ownerTimelines[owner].lastAvailableDay;
      let durationDays = task.estimatedDays || task.tentativeEtaDays || 1;
      const activityType = task.activityType;
      
      if (activityType === 'API_1_DAY') durationDays = 1;
      if (activityType === 'MILESTONE') durationDays = 0;
      
      const endDay = activityType === 'MILESTONE' ? startDay : startDay + durationDays - 1;
      
      processedActive.push({
        ...task,
        taskId: task._id?.toString() || task.taskId,
        taskName: task.title || task.taskName,
        taskOwner: owner,
        allOwners: owners, // Store all owners for display
        startDay,
        endDay,
        startWeek: dayToWeek(startDay),
        endWeek: dayToWeek(endDay),
        durationDays,
        status: task.progress || 'not_started',
        isFrozen: false
      });
      
      ownerTimelines[owner].activeTasks++;
      ownerTimelines[owner].totalTasks++;
      ownerTimelines[owner].tasks.push({
        taskId: task._id?.toString() || task.taskId,
        taskName: task.title || task.taskName,
        status: task.progress || 'not_started',
        startDay,
        endDay,
        durationDays,
        activityType: task.activityType,
        allOwners: owners
      });
      
      // No overlap for same person
      if (activityType !== 'MILESTONE') {
        ownerTimelines[owner].lastAvailableDay = endDay + 1;
      }
    });
  });
  
  const allScheduledTasks = [...processedCompleted, ...processedActive];
  const maxEndDay = allScheduledTasks.reduce((max, t) => Math.max(max, t.endDay), 0);
  
  return {
    scheduledTasks: allScheduledTasks,
    completedTasks: processedCompleted,
    activeTasks: processedActive,
    ownerTimelines,
    totalProjectWeeks: dayToWeek(maxEndDay),
    totalProjectDays: maxEndDay,
    projectStartDate: projectStartDate.toISOString(),
    reportGeneratedAt: new Date().toISOString(),
    stats: {
      totalTasks: allScheduledTasks.length,
      completedCount: processedCompleted.length,
      activeCount: processedActive.length,
      completionRate: allScheduledTasks.length > 0 
        ? Math.round((processedCompleted.length / allScheduledTasks.length) * 100) 
        : 0
    }
  };
}

module.exports = {
  scheduleForFinalReport,
  isTaskCompleted,
  getProjectStartDate
};
