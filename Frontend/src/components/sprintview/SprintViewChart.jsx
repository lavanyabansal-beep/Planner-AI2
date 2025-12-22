import React, { useState, useMemo } from 'react';
import { 
  ACTIVITY_TYPE_CONFIG, 
  isTaskOverdue, 
  OVERDUE_COLOR,
  normalizeDate,
  getProjectStartDate,
  dateToProjectDay,
  projectDayToDate,
  getWorkingDaysDiff,
  addWorkingDays,
  calculateDueDateDay
} from '../../utils/sprintviewConfig';

/**
 * Enterprise-Grade SprintView Chart Component
 * Calendar-accurate Gantt chart with proper date calculations
 */
const SprintViewChart = ({ 
  scheduledTasks = [], 
  totalProjectWeeks = 0,
  ownerTimelines = {},
  projectStartDate: providedStartDate,
  showLegend = true,
  compact = false 
}) => {
  const [hoveredTask, setHoveredTask] = useState(null);
  const currentDate = normalizeDate(new Date());

  // Use provided project start date from backend, or calculate from tasks
  const projectStartDate = useMemo(() => {
    try {
      if (providedStartDate) {
        return normalizeDate(providedStartDate);
      }
      if (scheduledTasks && scheduledTasks.length > 0) {
        return getProjectStartDate(scheduledTasks);
      }
      return normalizeDate(new Date());
    } catch (error) {
      console.error('Error calculating project start date:', error);
      return normalizeDate(new Date());
    }
  }, [providedStartDate, scheduledTasks]);

  // Generate week columns
  const weeks = useMemo(() => {
    return Array.from({ length: totalProjectWeeks }, (_, i) => i + 1);
  }, [totalProjectWeeks]);

  // Generate day columns with ONLY working days (excluding weekends)
  const days = useMemo(() => {
    if (!projectStartDate || totalProjectWeeks === 0) {
      return [];
    }
    
    const dayArray = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    try {
      // Calculate total calendar days needed
      let currentCalendarDate = new Date(projectStartDate);
      let workingDayCount = 0;
      let calendarDayIndex = 0;
      
      // Generate days until we have enough working days for all weeks
      const totalWorkingDaysNeeded = totalProjectWeeks * 5;
      
      while (workingDayCount < totalWorkingDaysNeeded) {
        const dayOfWeek = currentCalendarDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // Skip weekends - don't add them to the array at all
        if (!isWeekend) {
          workingDayCount++;
          const weekNumber = Math.ceil(workingDayCount / 5);
          
          dayArray.push({
            absoluteDay: workingDayCount,
            calendarDay: calendarDayIndex + 1,
            week: weekNumber,
            dayInWeek: ((workingDayCount - 1) % 5) + 1,
            label: dayNames[dayOfWeek],
            shortLabel: dayNames[dayOfWeek].substring(0, 3),
            date: new Date(currentCalendarDate),
            isToday: currentCalendarDate.getTime() === currentDate.getTime(),
            isWeekend: false,
            isWorkingDay: true
          });
        }
        
        currentCalendarDate.setDate(currentCalendarDate.getDate() + 1);
        calendarDayIndex++;
      }
      
      return dayArray;
    } catch (error) {
      console.error('Error generating days:', error);
      return [];
    }
  }, [totalProjectWeeks, projectStartDate, currentDate]);

  // Transform data: Group tasks by taskId with accurate date calculations
  const transformedTasks = useMemo(() => {
    const taskMap = new Map();
    
    console.log('=== SprintView Transform Start ===');
    console.log('Total scheduledTasks:', scheduledTasks.length);
    console.log('Project Start Date:', projectStartDate.toISOString());

    scheduledTasks.forEach(scheduledTask => {
      const taskId = scheduledTask.taskId || scheduledTask.taskName;
      
      // Calculate overdue status (needed for both new tasks and member calculations)
      const overdueStatus = isTaskOverdue(scheduledTask, currentDate);
      
      if (!taskMap.has(taskId)) {
        // Calculate actual start and end dates from day numbers
        const taskStartDate = projectDayToDate(scheduledTask.startDay, projectStartDate);
        const taskEndDate = projectDayToDate(scheduledTask.endDay, projectStartDate);
        
        // Determine the effective end date (completed date if completed, otherwise due date or end date)
        let effectiveEndDate = taskEndDate;
        if (scheduledTask.completed && scheduledTask.completedDate) {
          effectiveEndDate = normalizeDate(scheduledTask.completedDate);
        } else if (scheduledTask.dueDate) {
          const dueDate = normalizeDate(scheduledTask.dueDate);
          // Task visual should not extend past due date if not completed
          // unless it's actually running longer
          if (dueDate < taskEndDate && !scheduledTask.completed) {
            // Will be handled in split-bar logic
          }
        }
        
        console.log(`\nProcessing task: ${scheduledTask.taskName}`);
        console.log('  - Task data:', {
          startDate: taskStartDate.toISOString(),
          endDate: taskEndDate.toISOString(),
          dueDate: scheduledTask.dueDate,
          completed: scheduledTask.completed,
          isOverdue: overdueStatus,
          activityType: scheduledTask.activityType
        });
        
        // Create parent task entry
        taskMap.set(taskId, {
          taskId,
          taskName: scheduledTask.taskName,
          activityType: scheduledTask.activityType,
          totalEstimatedDays: scheduledTask.durationDays,
          startWeek: scheduledTask.startWeek,
          endWeek: scheduledTask.endWeek,
          startDay: scheduledTask.startDay,
          endDay: scheduledTask.endDay,
          startDate: taskStartDate,
          endDate: taskEndDate,
          dueDate: scheduledTask.dueDate,
          completed: scheduledTask.completed || false,
          completedDate: scheduledTask.completedDate,
          isOverdue: overdueStatus,
          members: []
        });
      }

      const taskEntry = taskMap.get(taskId);
      
      // Add member to this task
      // Calculate effective endDay for display
      let effectiveEndDay = scheduledTask.endDay;
      
      // If task is overdue and not completed, extend to today
      if (overdueStatus && !scheduledTask.completed) {
        const todayDay = dateToProjectDay(currentDate, projectStartDate);
        effectiveEndDay = Math.max(effectiveEndDay, todayDay);
      }
      // If task is completed, end at completion date
      else if (scheduledTask.completed && scheduledTask.completedDate) {
        const completedDay = dateToProjectDay(scheduledTask.completedDate, projectStartDate);
        effectiveEndDay = Math.min(effectiveEndDay, completedDay);
      }
      
      taskEntry.members.push({
        memberId: scheduledTask.taskOwner,
        memberName: scheduledTask.taskOwner,
        assignedDays: scheduledTask.durationDays / (scheduledTask.allOwners?.length || 1),
        startWeek: scheduledTask.startWeek,
        endWeek: scheduledTask.endWeek,
        startDay: scheduledTask.startDay,
        endDay: effectiveEndDay,
        originalEndDay: scheduledTask.endDay,
        durationDays: scheduledTask.durationDays
      });
    });

    const results = Array.from(taskMap.values());
    console.log('=== Transform Results ===');
    console.log('Total transformed tasks:', results.length);
    console.log('Overdue tasks:', results.filter(t => t.isOverdue).length);
    results.forEach(t => {
      console.log(`📊 Task: "${t.taskName}"`);
      console.log(`   - isOverdue: ${t.isOverdue}, completed: ${t.completed}`);
      console.log(`   - dueDate: ${t.dueDate || 'None'}`);
      console.log(`   - Members (${t.members.length}):`, t.members.map(m => ({
        name: m.memberName,
        startDay: m.startDay,
        originalEndDay: m.originalEndDay,
        extendedEndDay: m.endDay
      })));
    });
    console.log('=== SprintView Transform End ===\n');
    
    return results;
  }, [scheduledTasks, projectStartDate, currentDate]);

  // Group tasks by owner for better visualization
  const tasksByOwner = useMemo(() => {
    const grouped = {};
    scheduledTasks.forEach(task => {
      if (!grouped[task.taskOwner]) {
        grouped[task.taskOwner] = [];
      }
      grouped[task.taskOwner].push(task);
    });
    return grouped;
  }, [scheduledTasks]);

  // Calculate bar position and width
  const calculateBarStyle = (task) => {
    const { startWeek, endWeek, activityType, isOverdue } = task;
    const totalWeeks = weeks.length;
    
    if (totalWeeks === 0) return { display: 'none' };

    const startPercent = ((startWeek - 1) / totalWeeks) * 100;
    const widthPercent = ((endWeek - startWeek + 1) / totalWeeks) * 100;

    const config = ACTIVITY_TYPE_CONFIG[activityType] || ACTIVITY_TYPE_CONFIG.ONE_TIME;
    
    // Use red color for overdue tasks
    const barColor = isOverdue ? OVERDUE_COLOR : config.color;

    return {
      left: `${startPercent}%`,
      width: activityType === 'MILESTONE' ? '8px' : `${widthPercent}%`,
      minWidth: activityType === 'MILESTONE' ? '8px' : '4px',
      backgroundColor: barColor,
      borderStyle: config.borderStyle,
      borderWidth: config.borderStyle === 'dashed' ? '2px' : '0',
      borderColor: barColor,
      opacity: config.opacity,
    };
  };

  // Calculate bar position and width for members (calendar-day based)
  const calculateMemberBarStyle = (member, task) => {
    const { startDay, endDay } = member;
    
    if (days.length === 0) return { display: 'none' };
    
    // Since days array now only contains working days, directly find by absoluteDay
    const startCalendarDay = days.find(d => d.absoluteDay === startDay);
    const endCalendarDay = days.find(d => d.absoluteDay === endDay);
    
    if (!startCalendarDay || !endCalendarDay) {
      return { display: 'none' };
    }
    
    const startIndex = days.findIndex(d => d.absoluteDay === startDay);
    const endIndex = days.findIndex(d => d.absoluteDay === endDay);
    
    const startPercent = (startIndex / days.length) * 100;
    
    // Calculate proportional width based on actual duration
    const actualDuration = member.durationDays || 1;
    const dayWidth = (1 / days.length) * 100; // Width of one day
    const widthPercent = actualDuration * dayWidth;

    return {
      left: `${startPercent}%`,
      width: `${widthPercent}%`,
      minWidth: '4px'
    };
  };

  /**
   * Render member bar with ACCURATE overdue split-bar logic
   * CRITICAL: Only the portion AFTER due date AND before completion should be red
   */
  const renderMemberBar = (member, task, memberIndex) => {
    const config = ACTIVITY_TYPE_CONFIG[task.activityType] || ACTIVITY_TYPE_CONFIG.ONE_TIME;
    const isHovered = hoveredTask === `${task.taskId}-member-${memberIndex}`;
    
    const { startDay, endDay } = member;
    if (days.length === 0) return null;

    // Determine if we need split-bar rendering for overdue tasks
    const shouldSplitBar = task.isOverdue && !task.completed;
    
    if (shouldSplitBar) {
      const originalEndDay = member.originalEndDay || member.endDay;
      const todayDay = dateToProjectDay(currentDate, projectStartDate);
      
      const startCalendarDay = days.find(d => d.absoluteDay === startDay);
      const originalEndCalendarDay = days.find(d => d.absoluteDay === originalEndDay);
      const todayCalendarDay = days.find(d => d.absoluteDay === todayDay);
      
      if (startCalendarDay && originalEndCalendarDay && todayCalendarDay) {
        const startIndex = days.findIndex(d => d.absoluteDay === startDay);
        const originalEndIndex = days.findIndex(d => d.absoluteDay === originalEndDay);
        const todayIndex = days.findIndex(d => d.absoluteDay === todayDay);
        
        const actualDuration = member.durationDays || 1;
        const dayWidth = (1 / days.length) * 100;
        
        const normalStartPercent = (startIndex / days.length) * 100;
        const normalWidthPercent = (actualDuration * dayWidth);
        
        const normalEndPercent = normalStartPercent + normalWidthPercent;
        const todayEndPercent = (todayIndex / days.length) * 100;
        const overdueStartPercent = normalEndPercent;
        const overdueWidthPercent = todayEndPercent - normalEndPercent;
        
        return (
          <React.Fragment key={`member-${memberIndex}`}>
            {/* Normal portion */}
            <div
              className={`absolute cursor-pointer transition-all duration-200 ${
                isHovered ? 'z-20 scale-105' : 'z-10'
              } ${config.className}`}
              style={{
                left: `${normalStartPercent}%`,
                width: `${normalWidthPercent}%`,
                minWidth: '8px',
                height: '100%',
                backgroundColor: config.color,
                borderStyle: config.borderStyle,
                borderWidth: config.borderStyle === 'dashed' ? '2px' : '0',
                borderColor: config.color,
                opacity: config.opacity,
                pointerEvents: 'auto'
              }}
              onMouseEnter={() => setHoveredTask(`${task.taskId}-member-${memberIndex}`)}
              onMouseLeave={() => setHoveredTask(null)}
            >
              <div className="px-2 h-full flex items-center text-xs font-medium truncate text-white">
                {member.memberName}
              </div>
            </div>
            
            {/* Overdue portion */}
            {overdueWidthPercent > 0 && (
              <div
                className={`absolute cursor-pointer transition-all duration-200 ${
                  isHovered ? 'z-20 scale-105' : 'z-10'
                } rounded-md`}
                style={{
                  left: `${overdueStartPercent}%`,
                  width: `${overdueWidthPercent}%`,
                  minWidth: '8px',
                  height: '100%',
                  backgroundColor: OVERDUE_COLOR,
                  opacity: 0.9,
                  pointerEvents: 'auto'
                }}
                onMouseEnter={() => setHoveredTask(`${task.taskId}-member-${memberIndex}`)}
                onMouseLeave={() => setHoveredTask(null)}
              />
            )}
            
            {/* Tooltip */}
            {isHovered && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none">
                <div className="font-semibold">{task.taskName}</div>
                <div className="text-gray-300 mt-1">
                  <div>Member: {member.memberName}</div>
                  <div>Scheduled: {member.durationDays} days</div>
                  <div className="border-t border-gray-700 my-1 pt-1">
                    <div>Start: {projectDayToDate(startDay, projectStartDate).toLocaleDateString()}</div>
                    <div>Due: {projectDayToDate(originalEndDay, projectStartDate).toLocaleDateString()}</div>
                    <div>Today: {currentDate.toLocaleDateString()}</div>
                  </div>
                  {task.dueDate && (
                    <div>Task Due: {new Date(task.dueDate).toLocaleDateString()}</div>
                  )}
                  <div className="capitalize">{task.activityType.replace(/_/g, ' ')}</div>
                  <div className="text-red-400 font-semibold mt-1">⚠️ OVERDUE - {todayDay - originalEndDay} days late</div>
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            )}
          </React.Fragment>
        );
      }
    }
    
    // Default: single bar rendering
    const barStyle = calculateMemberBarStyle(member, task);
    const barColor = task.isOverdue ? OVERDUE_COLOR : config.color;

    return (
      <div
        key={`member-${memberIndex}`}
        className={`absolute cursor-pointer transition-all duration-200 ${
          isHovered ? 'z-20 scale-105' : 'z-10'
        } ${config.className}`}
        style={{
          ...barStyle,
          height: '100%',
          backgroundColor: barColor,
          borderStyle: config.borderStyle,
          borderWidth: config.borderStyle === 'dashed' ? '2px' : '0',
          borderColor: barColor,
          opacity: config.opacity,
          pointerEvents: 'auto'
        }}
        onMouseEnter={() => setHoveredTask(`${task.taskId}-member-${memberIndex}`)}
        onMouseLeave={() => setHoveredTask(null)}
      >
        {/* Tooltip */}
        {isHovered && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none">
            <div className="font-semibold">{task.taskName}</div>
            <div className="text-gray-300 mt-1">
              <div>Member: {member.memberName}</div>
              <div>Assigned: {member.assignedDays.toFixed(1)} days</div>
              <div>Duration: {member.durationDays} days</div>
              <div className="border-t border-gray-700 my-1 pt-1">
                <div>Start: {projectDayToDate(member.startDay, projectStartDate).toLocaleDateString()}</div>
                <div>End: {projectDayToDate(member.endDay, projectStartDate).toLocaleDateString()}</div>
              </div>
              {task.dueDate && (
                <div>Due: {new Date(task.dueDate).toLocaleDateString()}</div>
              )}
              <div className="capitalize">{task.activityType.replace(/_/g, ' ')}</div>
              {task.isOverdue && (
                <div className="text-red-400 font-semibold mt-1">⚠️ OVERDUE</div>
              )}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        )}

        {/* Member name label */}
        <div className="px-2 h-full flex items-center text-xs font-medium truncate text-white">
          {member.memberName}
        </div>
      </div>
    );
  };

  if (scheduledTasks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="text-gray-400 text-lg">No tasks scheduled</div>
        <div className="text-gray-500 text-sm mt-2">Add tasks to generate SprintView chart</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Project SprintView Chart</h2>
            <div className="text-sm text-gray-600 mt-1">
              {transformedTasks.length} unique tasks • {scheduledTasks.length} assignments • {totalProjectWeeks} weeks • {Object.keys(tasksByOwner).length} team members
            </div>
            {days.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                📅 {projectStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {days[days.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>
          {showLegend && <Legend />}
        </div>
      </div>

      {/* SprintView Grid */}
      <div className="overflow-x-auto">
        <div className={`${compact ? 'min-w-[800px]' : 'min-w-[1200px]'}`}>
          {/* Timeline Header */}
          <div className="grid gap-0 border-b border-gray-200 bg-gray-50" style={{
            gridTemplateColumns: compact ? '200px 1fr' : '300px 1fr'
          }}>
            {/* Task Info Header */}
            <div className="grid grid-cols-3 gap-2 px-4 py-3 border-r border-gray-200 font-semibold text-xs text-gray-700">
              <div>Task / Owner</div>
              <div>Duration</div>
              <div>Type</div>
            </div>

            {/* Week and Day Headers */}
            <div>
              {/* Week row - only working days */}
              <div className="grid border-b border-gray-300" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(60px, 1fr))` }}>
                {days.map((day, idx) => {
                  // Show week label only at start of each week (Monday)
                  const showWeekLabel = day.dayInWeek === 1;
                  
                  if (!showWeekLabel) return null;
                  
                  // Calculate week span - count working days until next Monday or end (always 5)
                  let weekSpan = 0;
                  for (let i = idx; i < days.length && weekSpan < 5; i++) {
                    if (days[i].week === day.week) {
                      weekSpan++;
                    } else {
                      break;
                    }
                  }
                  
                  return (
                    <div
                      key={idx}
                      className="px-2 py-1 text-center text-xs font-bold text-blue-800 bg-blue-50 border-l-2 border-blue-400"
                      style={{ gridColumn: `span ${weekSpan}` }}
                    >
                      Week {day.week}
                    </div>
                  );
                })}
              </div>
              
              {/* Day row with dates - only working days */}
              <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(60px, 1fr))` }}>
                {days.map((day, idx) => (
                  <div
                    key={idx}
                    className={`border-l px-1 py-2 text-center text-xs font-semibold ${
                      day.dayInWeek === 1 
                        ? 'border-l-2 border-gray-400 bg-blue-100' 
                        : 'border-gray-200 bg-gray-50'
                    } ${day.isToday ? 'ring-2 ring-yellow-400 bg-yellow-100' : ''}`}
                  >
                    <div className={day.dayInWeek === 1 ? 'text-blue-700' : 'text-gray-600'}>
                      {day.shortLabel}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${day.isToday ? 'text-yellow-700 font-bold' : 'text-gray-500'}`}>
                      {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Task Rows */}
          {transformedTasks.map((task, taskIndex) => (
            <React.Fragment key={task.taskId || taskIndex}>
              {/* Parent Task Row */}
              <div
                className="grid gap-0 bg-white border-b border-gray-200"
                style={{
                  gridTemplateColumns: compact ? '200px 1fr' : '300px 1fr'
                }}
              >
                {/* Task Info */}
                <div className="px-4 py-3 border-r border-gray-200 bg-gray-50">
                  <div className="font-bold text-gray-900 flex items-center gap-1 break-words" title={task.taskName}>
                    📋 {task.taskName}
                    {task.isOverdue && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800" title="Task is overdue">
                        ⚠️
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {task.members.length} member{task.members.length > 1 ? 's' : ''} • {task.totalEstimatedDays}d total
                  </div>
                  <div className="text-xs text-gray-600 capitalize font-medium mt-1">
                    {task.activityType.replace(/_/g, ' ')}
                  </div>
                </div>

                {/* Empty timeline for parent task */}
                <div 
                  className="relative grid bg-white" 
                  style={{ 
                    gridTemplateColumns: `repeat(${days.length}, minmax(60px, 1fr))`,
                    minHeight: '40px'
                  }}
                >
                  {/* Day columns (visual grid) */}
                  {days.map((day, idx) => (
                    <div
                      key={idx}
                      className={`${
                        day.dayInWeek === 1 
                          ? 'border-l-2 border-gray-400' 
                          : 'border-l border-gray-200'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Member Rows - Each member gets its own row */}
              {task.members.map((member, memberIndex) => (
                <div
                  key={`member-row-${memberIndex}`}
                  className="grid gap-0 bg-white border-b border-gray-100"
                  style={{
                    gridTemplateColumns: compact ? '200px 1fr' : '300px 1fr'
                  }}
                >
                  {/* Member Info */}
                  <div className="px-4 py-2 border-r border-gray-200 bg-gray-50 pl-8">
                    <div className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="text-gray-400">└</span>
                      <span className="font-medium">👤 {member.memberName}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 ml-4">
                      {member.durationDays}d • Days {member.startDay}-{member.endDay}
                    </div>
                  </div>

                  {/* Member Timeline */}
                  <div 
                    className="relative grid bg-white" 
                    style={{ 
                      gridTemplateColumns: `repeat(${days.length}, minmax(60px, 1fr))`,
                      minHeight: compact ? '40px' : '50px'
                    }}
                  >
                    {/* Day columns (visual grid) */}
                    {days.map((day, idx) => (
                      <div
                        key={idx}
                        className={`${
                          day.dayInWeek === 1 
                            ? 'border-l-2 border-gray-400' 
                            : 'border-l border-gray-200'
                        }`}
                      />
                    ))}

                    {/* Member bar */}
                    <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          left: 0,
                          right: 0,
                          height: '32px',
                          pointerEvents: 'auto'
                        }}
                      >
                        {renderMemberBar(member, task, memberIndex)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <div className="flex gap-6 text-xs text-gray-600">
          <div>
            <span className="font-semibold">Unique Tasks:</span> {transformedTasks.length}
          </div>
          <div>
            <span className="font-semibold">Total Assignments:</span> {scheduledTasks.length}
          </div>
          <div>
            <span className="font-semibold">Total Duration:</span> {Math.ceil(totalProjectWeeks * 5 / 7)} weeks
          </div>
          <div>
            <span className="font-semibold">Working Days:</span> {totalProjectWeeks * 5} days
          </div>
          <div className={transformedTasks.filter(t => t.isOverdue).length > 0 ? 'text-red-600 font-bold' : ''}>
            <span className="font-semibold">⚠️ Overdue Tasks:</span> {transformedTasks.filter(t => t.isOverdue).length}
          </div>
        </div>
      </div>
    </div>
  );
};

// Legend Component
const Legend = () => {
  const items = [
    { type: 'ONE_TIME', label: 'One-Time' },
    { type: 'CONTINUOUS', label: 'Continuous' },
    { type: 'API_1_DAY', label: 'API' },
    { type: 'RECURRING_WEEKLY', label: 'Recurring' },
    { type: 'MILESTONE', label: 'Milestone' },
    { type: 'BUFFER', label: 'Buffer' },
    { type: 'PARALLEL_ALLOWED', label: 'Parallel' },
  ];

  return (
    <div className="flex gap-3 flex-wrap items-center">
      {items.map(item => {
        const config = ACTIVITY_TYPE_CONFIG[item.type];
        return (
          <div key={item.type} className="flex items-center gap-1.5">
            <div
              className="w-6 h-3 rounded-sm"
              style={{
                backgroundColor: config.color,
                borderStyle: config.borderStyle,
                borderWidth: config.borderStyle === 'dashed' ? '1px' : '0',
                borderColor: config.color,
                opacity: config.opacity
              }}
            />
            <span className="text-xs text-gray-600">{item.label}</span>
          </div>
        );
      })}
      <div className="border-l border-gray-300 pl-3 ml-2">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-3 rounded-sm" style={{ backgroundColor: OVERDUE_COLOR }} />
          <span className="text-xs text-gray-600">Overdue</span>
        </div>
      </div>
    </div>
  );
};

export default SprintViewChart;
