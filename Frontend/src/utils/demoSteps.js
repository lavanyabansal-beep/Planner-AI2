/**
 * Demo Tour Steps Configuration
 * 
 * Defines the flow and content of the guided product tour.
 * Each step highlights a specific UI element and explains its purpose.
 * 
 * Step Properties:
 * - id: Unique identifier
 * - target: CSS selector for the element to highlight
 * - title: Step title
 * - content: Explanation text
 * - placement: Tooltip position (top, bottom, left, right)
 * - requireAction: If true, user must perform action before advancing
 * - actionType: Type of action to detect ('click', 'change', 'custom')
 * - actionTarget: Element that triggers the action (defaults to target)
 * - completionMessage: Message shown when action is completed
 */

export const demoSteps = [
  {
    id: 'welcome',
    target: 'body',
    title: 'Welcome to Planner-AI',
    content: 'A resource-aware project scheduling system that calculates realistic project timelines. Unlike traditional tools that ignore team capacity, Planner-AI understands that your team members cannot clone themselves.',
    placement: 'center',
    spotlightPadding: 0
  },
  {
    id: 'board-selector',
    target: '#board-selector',
    title: 'Project Selection',
    content: 'Select your active project here. In Planner-AI, a project is the scheduling boundary where all capacity calculations and timeline forecasts happen.',
    placement: 'bottom',
    spotlightPadding: 8
  },
  {
    id: 'create-board',
    target: '[data-tour="create-board-btn"]',
    title: 'Create New Project',
    content: 'Click the "New Project" button to see how projects are created.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="create-board-btn"]',
    completionMessage: 'Great! Now you can close the modal or create a project.'
  },
  {
    id: 'add-member',
    target: '[data-tour="add-member-btn"]',
    title: 'Add Team Members',
    content: 'Click "Add Member" to see how team members are added. Members are resources that the scheduler uses to calculate timelines.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="add-member-btn"]',
    completionMessage: 'Perfect! You can close the modal or add a member.'
  },
  {
    id: 'member-filter',
    target: '#member-filter',
    title: 'Filter by Member',
    content: 'Try selecting a member from this dropdown to filter tasks by assignee.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'change',
    actionTarget: '#member-filter',
    completionMessage: 'Excellent! You can now see filtered tasks.'
  },
  {
    id: 'board-view',
    target: '[data-tour="workflow-bucket"]',
    title: 'Workflow Buckets',
    content: 'These are your workflow stages (Backlog, In Progress, Review, Done). Buckets organize your work visually but do NOT affect the calculated timeline. Only task estimates and owners change the schedule.',
    placement: 'top',
    spotlightPadding: 12
  },
  {
    id: 'add-bucket',
    target: '[data-tour="add-bucket-btn"]',
    title: 'Add Workflow Stage',
    content: 'Click "Add Bucket" to create a custom workflow stage.',
    placement: 'left',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="add-bucket-btn"]',
    completionMessage: 'Nice! You can cancel or create the bucket.'
  },
  {
    id: 'add-task',
    target: '[data-tour="add-task-btn"]',
    title: 'Create Tasks',
    content: 'Click "Add Task" to see how tasks are created with estimates and owners.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="add-task-btn"]',
    completionMessage: 'Well done! You can cancel or create the task.'
  },
  {
    id: 'task-card',
    target: '[data-tour="task-card"]',
    title: 'Task Details',
    content: 'Click on this task card to open the detailed task editor where you can configure all task properties.',
    placement: 'right',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="task-card"]',
    completionMessage: 'Perfect! Now you can see the task details modal.'
  },
  {
    id: 'task-title',
    target: '[data-tour="task-title"]',
    title: 'Task Name',
    content: 'Give your task a clear, descriptive name. This helps everyone understand what needs to be done.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'focus',
    actionTarget: '[data-tour="task-title"]',
    completionMessage: 'Great! Task name is important for clarity.'
  },
  {
    id: 'task-description',
    target: '[data-tour="task-description"]',
    title: 'Task Description',
    content: 'Add detailed information about the task. Include requirements, acceptance criteria, or any important notes.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'focus',
    actionTarget: '[data-tour="task-description"]',
    completionMessage: 'Excellent! Clear descriptions prevent confusion.'
  },
  {
    id: 'task-assignedto',
    target: '[data-tour="task-assignedto"]',
    title: 'Assign Task Owner',
    content: 'This is the most critical field for scheduling. Click here to assign who will work on this task. The scheduler uses this to calculate resource availability.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="task-assignedto"]',
    completionMessage: 'Great! You understand task ownership.'
  },
  {
    id: 'task-activity-type',
    target: '[data-tour="task-activity-type"]',
    title: 'Activity Type Configuration',
    content: 'Select the activity type to control how this task schedules. One-Time tasks use the estimated days. Continuous tasks run until project end. Try changing it!',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'change',
    actionTarget: '[data-tour="task-activity-type"]',
    completionMessage: 'Excellent! You now understand activity types.'
  },
  {
    id: 'task-estimated-days',
    target: '[data-tour="task-estimated-days"]',
    title: 'Tentative ETA (Days)',
    content: 'Enter the estimated duration in days (0.5 day increments allowed). This drives the SprintView timeline calculation. Click and try entering a value!',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'focus',
    actionTarget: '[data-tour="task-estimated-days"]',
    completionMessage: 'Perfect! You know how to set task estimates.'
  },
  {
    id: 'task-start-date',
    target: '[data-tour="task-start-date"]',
    title: 'Start Date',
    content: 'Set when this task should begin. The scheduler uses this as a constraint when calculating the timeline.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'focus',
    actionTarget: '[data-tour="task-start-date"]',
    completionMessage: 'Good! Start dates help plan the schedule.'
  },
  {
    id: 'task-due-date',
    target: '[data-tour="task-due-date"]',
    title: 'Due Date',
    content: 'Set the deadline for this task. This helps track if the calculated schedule meets your deadlines.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'focus',
    actionTarget: '[data-tour="task-due-date"]',
    completionMessage: 'Excellent! Due dates keep projects on track.'
  },
  {
    id: 'task-checklist',
    target: '[data-tour="task-checklist"]',
    title: 'Task Checklist',
    content: 'Break down the task into smaller subtasks. Click here to add checklist items that can be tracked individually.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'focus',
    actionTarget: '[data-tour="task-checklist"]',
    completionMessage: 'Nice! Checklists help track progress.'
  },
  {
    id: 'task-save',
    target: '[data-tour="task-save"]',
    title: 'Save Changes',
    content: 'Click here to save all your changes. The task will be updated and the SprintView timeline will recalculate based on your inputs.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="task-save"]',
    completionMessage: 'Perfect! Your task is now saved.'
  },
  {
    id: 'sprintview',
    target: '[data-tour="sprintview-btn"]',
    title: 'SprintView: The Calculated Timeline',
    content: 'Click "SprintView" to see the automated timeline that calculates when each task can start based on resource availability.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="sprintview-btn"]',
    completionMessage: 'Awesome! The SprintView chart is now displayed.'
  },
  {
    id: 'user-day-view',
    target: '[data-tour="user-day-view-btn"]',
    title: 'User Day View',
    content: 'Click to switch to User Day View - a strategic capacity view showing each team member\'s daily task assignments across the entire project timeline.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="user-day-view-btn"]',
    completionMessage: 'Great! Now you can see the User Day View.'
  },
  {
    id: 'sprintview-export-csv',
    target: '[data-tour="sprintview-export-csv"]',
    title: 'Export to CSV',
    content: 'Click here to export the SprintView timeline data as a CSV file for use in Excel, Google Sheets, or other tools.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="sprintview-export-csv"]',
    completionMessage: 'Perfect! CSV export initiated.'
  },
  {
    id: 'sprintview-refresh',
    target: '[data-tour="sprintview-refresh"]',
    title: 'Refresh SprintView',
    content: 'Click to recalculate the timeline. Use this after making changes to tasks, estimates, or team member assignments.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="sprintview-refresh"]',
    completionMessage: 'Excellent! SprintView is refreshing.'
  },
  {
    id: 'final-report',
    target: '[data-tour="final-report-btn"]',
    title: 'Final Project Report',
    content: 'Click "Final Report" to see the completion summary with all tasks, owners, and the real project finish date.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="final-report-btn"]',
    completionMessage: 'Excellent! The final report is now open.'
  },
  {
    id: 'final-report-refresh',
    target: '[data-tour="final-report-refresh"]',
    title: 'Refresh Final Report',
    content: 'Click to regenerate the final project report with the latest data. This updates the completion timeline and resource allocation.',
    placement: 'bottom',
    spotlightPadding: 8,
    requireAction: true,
    actionType: 'click',
    actionTarget: '[data-tour="final-report-refresh"]',
    completionMessage: 'Perfect! Report is refreshing.'
  },
  {
    id: 'complete',
    target: 'body',
    title: 'You\'re All Set!',
    content: 'You now understand the three-tier visualization: Kanban (operational), SprintView (tactical timeline), and User-Day View (strategic capacity). Start by creating tasks with realistic estimates, and let Planner-AI tell you when your project will actually finish.',
    placement: 'center',
    spotlightPadding: 0
  }
];

/**
 * Helper function to check if a step's target element exists in the DOM
 */
export const isStepAvailable = (stepId) => {
  const step = demoSteps.find(s => s.id === stepId);
  if (!step || step.target === 'body') return true;
  
  const element = document.querySelector(step.target);
  return element !== null;
};

/**
 * Get the next available step (skips steps whose elements don't exist)
 */
export const getNextAvailableStep = (currentIndex) => {
  for (let i = currentIndex + 1; i < demoSteps.length; i++) {
    if (isStepAvailable(demoSteps[i].id)) {
      return i;
    }
  }
  return demoSteps.length - 1; // Return last step if no others available
};
