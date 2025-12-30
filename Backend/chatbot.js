  const express = require('express')
  const axios = require('axios')
  const { format } = require('date-fns')

  const Board = require('./models/Board')   // internal DB name stays Board
  const Bucket = require('./models/Bucket')
  const Task = require('./models/Task')
  const User = require('./models/User')

  const sprintScheduler = require('./utils/sprintviewScheduler')
  const expandUserDay = require('./utils/userDayExpander')


  const router = express.Router()


  /* =====================================================
    🧠 In-memory state (undo + context)
  ===================================================== */
  const memory = new Map()

  // Helper to save state for undoing renames
  function saveRenameUndo(ctx, model, id, oldName) {
    ctx.lastRename = {
      model,
      id,
      oldName
    }
  }

  function pushHistory(ctx, role, content) {
    if (!ctx.history) ctx.history = []

    ctx.history.push({ role, content })

    // keep last 10 messages only (prevent token explosion)
    if (ctx.history.length > 10) {
      ctx.history = ctx.history.slice(-10)
    }
  }
  
  function getCtx(req) {
    if (!memory.has(req.ip)) memory.set(req.ip, {})
    return memory.get(req.ip)
  }

  function normalize(text) {
    return typeof text === 'string' ? text.trim() : text
  }

  function enumFromSchema(schema, field) {
    return schema.path(field)?.enumValues || []
  }

  function formatEnumList(list) {
  return list.map(v => `• ${v.replace(/_/g, ' ')}`).join('\n')
}

function formatError(title, value, allowed) {
  return `🤖 Invalid ${title} value: ${value}\n\nAllowed values:\n${formatEnumList(allowed)}`
}

// Allowed activity types (DB-safe)
const allowedActivityTypes = [
  'ONE_TIME',
  'CONTINUOUS',
  'API_1_DAY',
  'RECURRING_WEEKLY',
  'BUFFER',
  'PARALLEL_ALLOWED',
  'MILESTONE'
]

// Normalize user input → DB value
function normalizeActivityType(input) {
  if (!input) return null

  const value = input.toLowerCase().trim()

  const map = {
    'one-time': 'ONE_TIME',
    'one time': 'ONE_TIME',

    'continuous': 'CONTINUOUS',

    'api/1-day': 'API_1_DAY',
    'api 1 day': 'API_1_DAY',

    'recurring weekly': 'RECURRING_WEEKLY',
    'weekly': 'RECURRING_WEEKLY',

    'buffer': 'BUFFER',

    'parallel allowed': 'PARALLEL_ALLOWED',
    'parallel': 'PARALLEL_ALLOWED',

    'milestone': 'MILESTONE'
  }

  return map[value] || null
}


async function resolveUsersByNames(names = []) {
  const users = []
  const missing = []

  for (const name of names) {
    const user = await User.findOne({ name: new RegExp(`^${name}$`, 'i') })
    if (!user) missing.push(name)
    else users.push(user._id)
  }
  return { users, missing }
  }


  /* =====================================================
    🤖 PURE LLM BRAIN (FREE MODEL SAFE)
  ===================================================== */
async function callLLM(ctx, message) {
  const messages = [
    {
      role: 'system',
      content: `You are an AI Project Management Assistant connected to a REAL backend system.

You MUST behave as a REAL-TIME controller, not a narrator.

====================================================
⏱️ REAL-TIME EXECUTION GUARANTEE (NON-NEGOTIABLE)
====================================================

1️⃣ NEVER CONFIRM SUCCESS EARLY
- Do NOT say an action is completed unless the backend has executed it.
- Use PRESENT CONTINUOUS tense for all actions.

❌ WRONG:
"Assigned Ram to task Calling."
"Deleted project test."

✅ CORRECT:
"Assigning Ram to task Calling."
"Deleting project test now."

2️⃣ ACTION ↔ REPLY CONSISTENCY
Your reply MUST match the actions you emit.
If you emit: { "action": "update_task" }
You may say: "Assigning Ram to the task Calling."

3️⃣ NO STATE ASSUMPTIONS
❌ Do NOT assume:
- a project exists
- a bucket exists
- a task was created
- a member was assigned
Backend decides truth. You only REQUEST actions.

====================================================
❗ CRITICAL INTENT MAPPING RULES (MUST FOLLOW)
====================================================

----------------------------------------------------
1️⃣ USER WORK / ASSIGNMENT QUERIES
----------------------------------------------------

If the user asks ANY variation of:
- "what work is assigned to <user>"
- "what is <user> working on"
- "tasks assigned to <user>"
- "<user>'s work"

You MUST return:

{
  "actions": [
    {
      "action": "show_user_tasks",
      "data": { "user": "<user>" }
    }
  ],
  "reply": "Checking work assigned to <user>..."
}

----------------------------------------------------
2️⃣ DELETE ALL (CRITICAL)
----------------------------------------------------

If the user says ANY variation of:
- "delete all members"
- "delete all projects"
- "delete all tasks"
- "remove all members"
- "delete all projects and members"

You MUST use **delete_all**, NOT delete.

MULTIPLE delete_all:
If the user mentions MULTIPLE types, you MUST SPLIT THEM.

User: "delete all projects and members"

Return:
{
  "actions": [
    { "action": "delete_all", "data": { "type": "project" } },
    { "action": "delete_all", "data": { "type": "member" } }
  ],
  "reply": "Requesting deletion of all projects and all members..."
}

❌ NEVER ask for name for delete_all
❌ NEVER use action "delete" for delete-all
❌ NEVER merge into one object

----------------------------------------------------
3️⃣ CONFIRMATION IS REAL-TIME
----------------------------------------------------

If the assistant has JUST asked for confirmation
and the user replies with ANY of: "yes", "y", "ok", "confirm", "yses"

You MUST return:

{
  "actions": [ { "action": "confirm" } ],
  "reply": "Confirming the action now."
}

❌ NEVER repeat delete_all
❌ NEVER re-ask confirmation

----------------------------------------------------
4️⃣ MULTI-STEP REAL-TIME FLOWS
----------------------------------------------------

For chained commands:
"add bucket frontend and add task html to it"

You MUST:
- Treat "frontend" as a BUCKET
- Create task ONLY AFTER bucket creation
- Never confuse bucket name as project

Reply example:
"Creating the frontend bucket and adding the task html to it."

----------------------------------------------------
5️⃣ SHOW ACTIONS MUST BE REAL
----------------------------------------------------

If user asks: "show all members and projects"

Return:
{
  "actions": [
    { "action": "show_members" },
    { "action": "show_projects" }
  ],
  "reply": "Here are the members and projects:"
}

❌ NEVER summarize without actions
❌ NEVER invent names

====================================================
📦 STRICT JSON OUTPUT FORMAT
====================================================

Return ONLY valid JSON.

{
  "actions": [
    { "action": "<action_name>", "data": { ... } }
  ],
  "reply": "<present-tense, truthful summary>"
}

• NO markdown
• NO explanations
• NO assumptions
• NO extra text

====================================================
SUPPORTED ACTIONS
====================================================

create_project, add_bucket, add_task, add_member
delete, delete_all, rename_project, rename_bucket, rename_task, update_task
set_active_project, show_projects, show_buckets, show_members, show_tasks
show_user_tasks, show_user_day, show_today, show_tomorrow, show_sprint_view
show_activity_types, show_allowed_values, show_capabilities
greet, confirm, cancel, undo, reset_chat, none

====================================================
TARGET BEHAVIOR
====================================================

You request actions. Backend executes. Backend confirms.
You NEVER lie. You NEVER assume. You NEVER get ahead of execution.`
    },
    ...(ctx.history || []),
    { role: 'user', content: message }
  ]

  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages
      },
      {
        timeout: 10000,
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY1}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Planner AI'
        }
      }
    );
    console.log('Raw LLM response:', res.data.choices[0].message.content);
    return JSON.parse(res.data.choices[0].message.content);
  } catch (err) {
    console.error('LLM ERROR:', err.message);
    return {
  actions: [],
  reply: 'I could not understand that. Please rephrase.'
};

  }
}


  /* =====================================================
    🚀 CHAT ROUTE
  ===================================================== */

  async function listProjectsAndAsk(message) {
    const projects = await Board.find().sort({ createdAt: -1 })
    const projectList = projects.map(p => `• ${p.title}`).join('\n')
    return `${message}\n\nHere are the existing projects:\n${projectList}\n\nWould you like to create a new one or use one of these?`
  }
 
  router.post('/', async (req, res) => {

    const message = req.body.message
    if (!message) return res.json({ reply: 'Empty message' })
      console.log('Incoming message:', message)


    const ctx = getCtx(req)
    let shouldRefresh = false // Track if state changed

    // frontend-controlled active project
    if (req.body.activeProjectId) {
      ctx.activeBoardId = req.body.activeProjectId
    }

    /* =====================================================
      🤖 AUTO SELECT SINGLE PROJECT
    ===================================================== */
    if (!ctx.activeBoardId) {
      const count = await Board.countDocuments()
      if (count === 1) {
        const onlyProject = await Board.findOne()
        ctx.activeBoardId = onlyProject._id
        shouldRefresh = true // Maybe refreshed selection
      }
    }

    try {
      pushHistory(ctx, 'user', message);

      const ai = await callLLM(ctx, message);
      console.log('LLM output:', ai);

      if (ai?.reply) {
        pushHistory(ctx, 'assistant', ai.reply);
      }

      const actions = Array.isArray(ai.actions)
        ? ai.actions
        : ai.action
          ? [{ action: ai.action, data: ai.data || {} }]
          : [];

      console.log('Actions to process:', actions);

      let accumulatedReplies = [];
      let stopProcessing = false;

      // Special case: If multiple show_* actions, we probably want to see them all.
      // If mix of modification and show, we want both.
      
      for (const step of actions) {
        if (stopProcessing) break;

        const action = step.action || 'none'
        const data = step.data || {}
        let actionReply = null; // Specific reply for this action

        // 🔁 auto switch project (VALIDATED)
        if (data.project) {
          const project = await Board.findOne({
            title: new RegExp(`^${data.project}$`, 'i')
          })
          if (project) {
              ctx.activeBoardId = project._id
              shouldRefresh = true
          } else {
              // 🔥 Project NOT FOUND
              // We must stop to ask user
              const projects = await Board.find().sort({ createdAt: -1 })
              const projectList = projects.length > 0
                ? projects.map(p => `• ${p.title}`).join('\n')
                : 'None'

              accumulatedReplies.push(`Project "${data.project}" does not exist.\n\nAvailable projects:\n${projectList}\n\nWould you like to create "${data.project}"?`);

              // Store pending state for creation
              ctx.pendingProjectCreation = {
                title: data.project,
                nextAction: step
              }
              stopProcessing = true;
              break;
          }
        }

      switch (action) {

      /* ========== GREET ========== */
      case 'greet': {
        const greetings = [
          'Hello! 👋 How can I help you manage your projects today?',
          'Hi there! 🚀 Ready to organize some tasks?',
          'Hey! What can I do for you?',
          'Greetings! 🤖 I am at your service.'
        ]
        actionReply = greetings[Math.floor(Math.random() * greetings.length)]
        break;
      }

      /* ========== RESET CHAT ========== */
      case 'reset_chat': {
        ctx.history = []
        actionReply = 'Hello! I am your Planner AI. How can I help you today? 👋';
        break;
      }

      /* ========== SHOW CAPABILITIES ========== */
      case 'show_capabilities': {
        actionReply = `I can help you with the following:
• Create and manage projects (boards)
• Add, rename, and delete buckets (lists)
• Add, update, and assign tasks
• Manage team members
• Show daily schedules and sprint views
• Undo recent changes (including delete all)
• Answer questions about your project data (e.g., "what is ram doing")

Just ask me naturally! 🚀`;
        break;
      }

      /* ========== SHOW ACTIVITY TYPES ========== */
      case 'show_activity_types': {
        const list = allowedActivityTypes.map(t => `• ${t.replace(/_/g, ' ')}`).join('\n')
        actionReply = `Here are the available activity types:\n${list}`;
        break;
      }

      /* ========== SHOW ALLOWED VALUES ========== */
      case 'show_allowed_values': {
        const field = data.field ? data.field.toLowerCase() : null;
        let values = [];
        let name = '';

        if (field === 'priority') {
            values = enumFromSchema(Task.schema, 'priority');
            name = 'Priority';
        } else if (field === 'progress') {
            values = enumFromSchema(Task.schema, 'progress');
            name = 'Progress';
        } else if (field === 'activitytype' || field === 'activity type') {
            values = allowedActivityTypes;
            name = 'Activity Type';
        } else {
            actionReply = 'I can show allowed values for: Priority, Progress, and Activity Type.';
            break;
        }

        const list = values.map(v => `• ${v.replace(/_/g, ' ')}`).join('\n');
        actionReply = `Here are the allowed values for ${name}:\n${list}`;
        break;
      }


      /* ========== SHOW USER TASKS (ALL – CHATBOT OUTPUT) ========== */
      case 'show_user_tasks': {
        if (!data.user) {
          actionReply = 'Which user should I check?';
          break;
        }

        const user = await User.findOne({
          name: new RegExp(`^${data.user}$`, 'i')
        })

        if (!user) {
          actionReply = `User "${data.user}" not found.`;
          break;
        }

        const tasks = await Task.find({
          assignedTo: user._id
        })
          .populate('bucketId', 'title')
          .select('title priority progress bucketId activityType estimatedDays dueDate')

        if (!tasks.length) {
          actionReply = `No tasks are assigned to ${user.name}.`;
          break;
        }


        // 🔥 Convert tasks to readable chatbot text
      const LINE = '\u2028'   // Unicode line separator

      const taskLines = tasks.map((task, index) => {
        const bucket = task.bucketId?.title || 'No Bucket'
        const progress = task.progress ? task.progress.replace('_', ' ') : 'Not Set'
        const activity = task.activityType || 'Not Set'
        const eta = task.estimatedDays ? `${task.estimatedDays} days` : 'Not Set'
        const due = task.dueDate ? format(new Date(task.dueDate), 'MMM dd, yyyy') : 'Not Set'

        return (
          `${index + 1}. ${task.title}${LINE}` +
          `   • Priority: ${task.priority || 'None'}${LINE}` +
          `   • Progress: ${progress}${LINE}` +
          `   • Activity Type: ${activity}${LINE}` +
          `   • Est. Time: ${eta}${LINE}` +
          `   • Due Date: ${due}${LINE}` +
          `   • Bucket: ${bucket}`
        )
      })

      actionReply = `Here is the work assigned to ${user.name}:${LINE}${LINE}${taskLines.join(`${LINE}${LINE}`)}`;
      break;
      }


      /* ========== ADD TASK (Formerly create_task) ========== */
      case 'add_task': {
        // Required: title, bucket
        const missing = [];
        if (!data.title) missing.push('title');
        if (!data.bucket) missing.push('bucket');

        if (missing.length) {
          actionReply = `Please provide: ${missing.join(', ')} to add a task.`;
          break;
        }

        const project = await Board.findById(ctx.activeBoardId);
        if (!project) {
           actionReply = await listProjectsAndAsk('Please select a project first.');
           stopProcessing = true;
           break;
        }

        const bucket = await Bucket.findOne({
          title: new RegExp(`^${data.bucket}$`, 'i'),
          boardId: project._id
        });
        
        // 🚀 Auto-prompt to create bucket if missing
        if (!bucket) {
          ctx.pendingBucketCreation = {
            bucketName: data.bucket,
            taskData: data,
            projectId: project._id
          }
          
          const existingBuckets = await Bucket.find({ boardId: project._id })
          const bucketList = existingBuckets.length > 0 
            ? existingBuckets.map(b => `• ${b.title}`).join('\n')
            : 'No buckets found.'

          actionReply = `Bucket "${data.bucket}" does not exist in project "${project.title}".\n\nAvailable buckets:\n${bucketList}\n\nWould you like to create "${data.bucket}"?`;
          stopProcessing = true; // Interactive break
          break;
        }

        // 🚫 Check for Duplicate Task
        const existingTask = await Task.findOne({ 
            title: new RegExp(`^${data.title}$`, 'i'), 
            bucketId: bucket._id 
        });
        if (existingTask) {
            actionReply = `Task "${data.title}" already exists in bucket "${bucket.title}".`;
            break;
        }

        // Validate users
        let assignedIds = [];
        if (data.assignedTo?.length) {
          const { users, missing: missingUsers } = await resolveUsersByNames(data.assignedTo);
          if (missingUsers.length) {
            actionReply = `User(s) ${missingUsers.join(', ')} do not exist. Should I create them?`;
            stopProcessing = true; // Maybe we should support user creation flow, but for now break
            break;
          }
          assignedIds = users;
        }

        // Validate enums
        const priorityEnum = enumFromSchema(Task.schema, 'priority');
        const progressEnum = enumFromSchema(Task.schema, 'progress');

        // Checklist support
        let checklist = [];
        if (Array.isArray(data.checklist)) {
          checklist = data.checklist.map(item => ({ text: item, done: false }));
        }

        const taskData = {
          title: normalize(data.title),
          bucketId: bucket._id,
          description: normalize(data.description || ''),
          assignedTo: assignedIds,
          labels: data.labels || [],
          priority: priorityEnum.includes(data.priority) ? data.priority : undefined,
          progress: progressEnum.includes(data.progress) ? data.progress : undefined,
          estimatedDays: data.etaDays,
          startDate: data.startDate ? expandUserDay(data.startDate) : undefined,
          dueDate: data.dueDate ? expandUserDay(data.dueDate) : undefined,
          checklist
        };

        // ===== Activity Type (CREATE) =====
      if (data.activityType) {
        const normalizedActivity = normalizeActivityType(data.activityType)

        if (!normalizedActivity) {
            actionReply = formatError('activity type', data.activityType, allowedActivityTypes);
            break;
        }
        taskData.activityType = normalizedActivity
      }

      const task = await Task.create(taskData);
      shouldRefresh = true; // Task Created
      actionReply = `Task "${task.title}" created in bucket "${bucket.title}".`;
      break;
    }

 /* ========== UPDATE TASK (FULL) ========== */
case 'update_task': {
  // 🚨 Safety: prevent progress words being treated as activity
const forbiddenAsActivity = ['completed', 'in progress', 'not started']

if (data.activityType && forbiddenAsActivity.includes(data.activityType.toLowerCase())) {
  actionReply = `Did you mean to update progress instead of activity? Try: "set progress to ${data.activityType} in ${data.title}".`;
  break;
}

  if (!data.title) {
    actionReply = 'Please specify the task title to update.';
    break;
  }

  const project = await Board.findById(ctx.activeBoardId)
  if (!project) {
    actionReply = await listProjectsAndAsk('Please select a project first.');
    stopProcessing = true;
    break;
  }

  const buckets = await Bucket.find({ boardId: project._id })
  const bucketIds = buckets.map(b => b._id)

  const task = await Task.findOne({
    title: new RegExp(`^${data.title}$`, 'i'),
    bucketId: { $in: bucketIds }
  })

  if (!task) {
    // 💡 Check if user named a Project or Bucket instead
    const isProject = await Board.findOne({ title: new RegExp(`^${data.title}$`, 'i') })
    if (isProject) {
        actionReply = `"${isProject.title}" is a project. I can only update priority/progress for tasks.`;
        break;
    }
    const isBucket = await Bucket.findOne({ title: new RegExp(`^${data.title}$`, 'i'), boardId: project._id })
    if (isBucket) {
        actionReply = `"${isBucket.title}" is a bucket. I can only update priority/progress for tasks.`;
        break;
    }

    actionReply = `Task "${data.title}" not found in this project.`;
    break;
  }

  // ===== Priority =====
  if (data.priority) {
    const priorityEnum = enumFromSchema(Task.schema, 'priority')
    const matchedPriority = priorityEnum.find(
      p => p.toLowerCase() === data.priority.toLowerCase()
    )

    if (!matchedPriority) {
        actionReply = formatError('priority', data.priority, enumFromSchema(Task.schema, 'priority'));
        break;
    }
    task.priority = matchedPriority
  }

  // ===== Progress =====
if (data.progress) {
  const progressEnum = enumFromSchema(Task.schema, 'progress')

  const normalizedInput = data.progress
    .toLowerCase()
    .replace(/\s+/g, '_')   // "in progress" → "in_progress"

  // map common synonyms
  const progressAliasMap = {
    done: 'completed',
    complete: 'completed',
    completed: 'completed',
    started: 'in_progress',
    ongoing: 'in_progress',
    pending: 'not_started',
    'not started': 'not_started'
  }

  const finalValue = progressAliasMap[normalizedInput] || normalizedInput

  const matchedProgress = progressEnum.find(
    p => p === finalValue
  )

  if (!matchedProgress) {
      actionReply = formatError('progress', data.progress, enumFromSchema(Task.schema, 'progress'));
      break;
  }
  task.progress = matchedProgress
}

// ===== Activity Type (UPDATE) =====
if (data.activityType) {
  const normalizedActivity = normalizeActivityType(data.activityType)

  if (!normalizedActivity || !allowedActivityTypes.includes(normalizedActivity)) {
    actionReply = `Invalid activity type: ${data.activityType}.`;
    break;
  }
  task.activityType = normalizedActivity
}

  // ===== Other fields =====
  if (data.newTitle) task.title = normalize(data.newTitle)
  if (data.description !== undefined) task.description = normalize(data.description)
  if (data.etaDays !== undefined) task.estimatedDays = data.etaDays
  if (data.startDate) task.startDate = expandUserDay(data.startDate)
  if (data.dueDate) task.dueDate = expandUserDay(data.dueDate)
  if (data.language) task.language = data.language

  if (data.assignedTo) {
    const { users, missing } = await resolveUsersByNames(data.assignedTo)
    if (missing.length) {
      actionReply = `User(s) ${missing.join(', ')} do not exist.`;
      break;
    }
    task.assignedTo = users
  }

  if (Array.isArray(data.checklist)) {
    task.checklist = data.checklist.map(item => ({ text: item, done: false }))
  } else if (data.addChecklistItem) {
    task.checklist.push({ text: data.addChecklistItem, done: false })
  }

  await task.save()
  shouldRefresh = true; // Task Updated

  const activityLabelMap = {
  ONE_TIME: 'One-Time',
  CONTINUOUS: 'Continuous',
  API_1_DAY: 'API/1-Day',
  RECURRING_WEEKLY: 'Recurring Weekly',
  BUFFER: 'Buffer',
  PARALLEL_ALLOWED: 'Parallel Allowed',
  MILESTONE: 'Milestone'
}

const activityLabel = task.activityType
  ? activityLabelMap[task.activityType] || task.activityType
  : 'unchanged'

actionReply = `Task "${task.title}" updated successfully.
Priority: ${task.priority || 'unchanged'}
Progress: ${task.progress || 'unchanged'}
Activity Type: ${activityLabel}`;
  break;
}

      /* ========== RENAME PROJECT ========== */
      case 'rename_project': {
        if (!data.oldName || !data.newName) {
            actionReply = "Please provide the old and new project names.";
            break;
        }

        const project = await Board.findOne({
          title: new RegExp(`^${data.oldName}$`, 'i')
        })
        
        if (!project) {
            actionReply = `Project "${data.oldName}" not found.`;
            break;
        }

        saveRenameUndo(ctx, Board, project._id, project.title)

        project.title = data.newName
        await project.save()
        shouldRefresh = true; // Renamed
        
        actionReply = `Project renamed to "${data.newName}".`;
        break;
      }


          //rename bucket
 case 'rename_bucket': {
  if (!data.oldName || !data.newName) {
    actionReply = 'Please provide old and new bucket names.';
    break;
  }

        const project = await Board.findById(ctx.activeBoardId)
        if (!project) {
          actionReply = await listProjectsAndAsk('Please select a project first.');
          stopProcessing = true;
          break;
        }

        const bucket = await Bucket.findOne({
          title: new RegExp(`^${data.oldName}$`, 'i'),
          boardId: project._id
        })

        if (!bucket) {
          actionReply = 'Bucket not found.';
          break;
        }

        saveRenameUndo(ctx, Bucket, bucket._id, bucket.title)

        bucket.title = data.newName
        await bucket.save()
        shouldRefresh = true; // Renamed

        actionReply = `Bucket renamed to "${data.newName}"`;
        break;
      }

      // rename task
      case 'rename_task': {
  if (!data.oldName || !data.newName) {
    actionReply = 'Please provide old and new task names.'
    break
  }

  const project = await Board.findById(ctx.activeBoardId)
  if (!project) {
    actionReply = await listProjectsAndAsk('Please select a project first.');
    stopProcessing = true;
    break;
  }

  const bucket = data.bucket
    ? await Bucket.findOne({
        title: new RegExp(`^${data.bucket}$`, 'i'),
        boardId: project._id
      })
    : await Bucket.findOne({ boardId: project._id })

  if (!bucket) {
    actionReply = 'Bucket not found.';
    break;
  }

  const task = await Task.findOne({
    title: new RegExp(`^${data.oldName}$`, 'i'),
    bucketId: bucket._id
  })

  if (!task) {
    actionReply = `Task "${data.oldName}" not found in "${bucket.title}".`;
    break
  }

  saveRenameUndo(ctx, Task, task._id, task.title)

  task.title = normalize(data.newName)
  await task.save()
  shouldRefresh = true; // Renamed

  actionReply = `Task renamed to "${task.title}".`;
  break;
}


        /* ========== CREATE PROJECT ========== */
        case 'create_project': {
          if (!data.title){
            actionReply = 'Project title is missing.';
            break;
          }

          // 🚫 Check for Duplicate Project
          const existingProject = await Board.findOne({ 
              title: new RegExp(`^${data.title}$`, 'i') 
          });
          if (existingProject) {
             // 🚀 Frictionless: Switch to it instead of failing
             ctx.activeBoardId = existingProject._id;
             shouldRefresh = true;
             actionReply = `Project "${existingProject.title}" already exists. Switched to it.`;
          } else {
             const project = await Board.create({ title: data.title })
             ctx.activeBoardId = project._id
             shouldRefresh = true; // Created Project
             actionReply = `Project "${project.title}" created.`;
          }
          break;
        }

        /* ========== SET ACTIVE PROJECT ========== */
        case 'set_active_project': {
          if (!data.title){
            actionReply = 'Project title is missing.';
            break;
          }

          const project = await Board.findOne({
            title: new RegExp(`^${data.title}$`, 'i')
          })

          if (!project){
             actionReply = await listProjectsAndAsk(`Project "${data.title}" not found.`);
             stopProcessing = true;
             break;
          }
          ctx.activeBoardId = project._id
          shouldRefresh = true; // Switched Project (Refresh to show it)
          actionReply = `Switched to project "${project.title}"`;
          break;
        }

        /* ========== ADD BUCKET ========== */
        case 'add_bucket': {
          if (!data.title){
            actionReply = 'Bucket title is missing.';
            break;
          }

          const project = await Board.findById(ctx.activeBoardId)

          if (!project) {
            ctx.activeBoardId = null
            actionReply = await listProjectsAndAsk('Active project is invalid. Please select a project.');
            stopProcessing = true;
            break;
          }

          // 🚫 Check for Duplicate Bucket
          const existingBucket = await Bucket.findOne({ 
              title: new RegExp(`^${data.title}$`, 'i'), 
              boardId: project._id 
          });
          if (existingBucket) {
             actionReply = `Bucket "${existingBucket.title}" already exists in project "${project.title}".`;
          } else {
             await Bucket.create({
                title: data.title,
                boardId: project._id
             })
             shouldRefresh = true; // Bucket Added
             actionReply = `Bucket "${data.title}" added to project "${project.title}"`;
          }
          break;
        }

        /* ========== ADD MEMBER ========== */
        case 'add_member': {
          if (!data.name){
            actionReply = 'Member name is missing.';
            break;
          }

          await User.create({
            name: data.name,
            initials: data.name
              .split(' ')
              .map(w => w[0])
              .join('')
              .toUpperCase(),
            avatarColor: 'bg-blue-500'
          });
          shouldRefresh = true; // Member Added
          actionReply = `Member "${data.name}" added successfully.`;
          break;
        }

        /* ========== DELETE ========== */
        case 'delete': {
          if (!data.type || !data.name){
            actionReply = 'Missing type or name for deletion.';
            break;
          }
          let Model, field

          if (data.type === 'task') { Model = Task; field = 'title' }
          if (data.type === 'bucket') { Model = Bucket; field = 'title' }
          if (data.type === 'project') { Model = Board; field = 'title' }
          if (data.type === 'member') { Model = User; field = 'name' }

          if (!Model) {
            actionReply = 'Invalid delete request.';
            break;
          }

          const doc = await Model.findOne({
            [field]: new RegExp(data.name, 'i')
          })

          if (!doc) {
            actionReply = `Nothing found to delete for ${data.type} "${data.name}".`;
            break;
          }

          ctx.lastDeleted = {
            model: Model,
            data: doc.toObject()
          }

          await Model.deleteOne({ _id: doc._id })
          shouldRefresh = true; // Deleted

          if (
            data.type === 'project' &&
            ctx.activeBoardId?.toString() === doc._id.toString()
          ) {
            ctx.activeBoardId = null
          }
          actionReply = `${data.type} "${doc[field]}" deleted.`;
          break;
        }

        /* ========== DELETE ALL ========== */
        case 'delete_all': {
          if (!data.type) {
            actionReply = 'What would you like to delete all of?';
            break;
          }

          if (!ctx.pendingConfirmations) ctx.pendingConfirmations = []

          ctx.pendingConfirmations.push({
            action: 'delete_all',
            type: data.type
          })

          actionReply = `⚠️ Are you sure you want to PERMANENTLY delete ALL ${data.type}s? This cannot be undone.`;
          // We do NOT stop processing here to allow accumulating multiple delete_all confirmations.
          break;
        }

        /* ========== CONFIRM ========== */
        case 'confirm': {
          
          let somethingConfirmed = false;

          // 0. Pending Delete All (Multi)
          if (ctx.pendingConfirmations && ctx.pendingConfirmations.length > 0) {
              const results = [];
              for (const conf of ctx.pendingConfirmations) {
                  if (conf.action === 'delete_all') {
                      if (conf.type === 'project') {
                        const projects = await Board.find({})
                        if (projects.length > 0) {
                            ctx.lastDeletedAll = { type: 'project', items: projects.map(p => p.toObject()) }
                            await Board.deleteMany({})
                        }
                        ctx.activeBoardId = null
                        results.push('projects');
                      } else if (conf.type === 'member') {
                        const users = await User.find({})
                        if (users.length > 0) {
                            ctx.lastDeletedAll = { type: 'member', items: users.map(u => u.toObject()) }
                            await User.deleteMany({})
                        }
                        results.push('members');
                      } else if (conf.type === 'task') {
                         const tasks = await Task.find({})
                         if (tasks.length > 0) {
                            ctx.lastDeletedAll = { type: 'task', items: tasks.map(t => t.toObject()) }
                            await Task.deleteMany({})
                         }
                         results.push('tasks');
                      }
                  }
              }
              ctx.pendingConfirmations = []; // Clear
              shouldRefresh = true;
              actionReply = `All ${results.join(' and ')} have been deleted. You can say "undo" to restore them.`;
              somethingConfirmed = true;
          }

          // 1. Pending Delete All (Legacy single support)
          if (ctx.pendingConfirmation) {
            const { action, type } = ctx.pendingConfirmation
            ctx.pendingConfirmation = null

            if (action === 'delete_all') {
              if (type === 'project') {
                const projects = await Board.find({})
                if (projects.length > 0) {
                    ctx.lastDeletedAll = { type: 'project', items: projects.map(p => p.toObject()) }
                    await Board.deleteMany({})
                }
                ctx.activeBoardId = null
                shouldRefresh = true;
                actionReply = 'All projects have been deleted. You can say "undo" to restore them.';
              } else if (type === 'member') {
                const users = await User.find({})
                if (users.length > 0) {
                    ctx.lastDeletedAll = { type: 'member', items: users.map(u => u.toObject()) }
                    await User.deleteMany({})
                }
                shouldRefresh = true;
                actionReply = 'All members have been deleted. You can say "undo" to restore them.';
              } else if (type === 'task') {
                 const tasks = await Task.find({})
                 if (tasks.length > 0) {
                    ctx.lastDeletedAll = { type: 'task', items: tasks.map(t => t.toObject()) }
                    await Task.deleteMany({})
                 }
                 shouldRefresh = true;
                 actionReply = 'All tasks have been deleted. You can say "undo" to restore them.';
              }
            }
            somethingConfirmed = true;
          }
          
          // 2. Pending Bucket Creation
          else if (ctx.pendingBucketCreation) {
             const { bucketName, taskData, projectId } = ctx.pendingBucketCreation
             ctx.pendingBucketCreation = null
             
             // Create Bucket
             const bucket = await Bucket.create({
                title: bucketName,
                boardId: projectId
             })
             
             // Then Create Task
             const priorityEnum = enumFromSchema(Task.schema, 'priority');
             const progressEnum = enumFromSchema(Task.schema, 'progress');
             
             let assignedIds = [];
             if (taskData.assignedTo?.length) {
               const { users } = await resolveUsersByNames(taskData.assignedTo);
               assignedIds = users;
             }
             
             const task = await Task.create({
                title: normalize(taskData.title),
                bucketId: bucket._id,
                description: normalize(taskData.description || ''),
                assignedTo: assignedIds,
                labels: taskData.labels || [],
                priority: priorityEnum.includes(taskData.priority) ? taskData.priority : undefined,
                progress: progressEnum.includes(taskData.progress) ? taskData.progress : undefined,
                estimatedDays: taskData.etaDays,
                activityType: taskData.activityType 
                  ? normalizeActivityType(taskData.activityType) 
                  : undefined
             })
             
             shouldRefresh = true;
             actionReply = `Bucket "${bucket.title}" created. Task "${task.title}" added to it. ✅`;
             somethingConfirmed = true;
          }

          // 3. Pending Project Creation
          else if (ctx.pendingProjectCreation) {
             const { title, nextAction } = ctx.pendingProjectCreation
             ctx.pendingProjectCreation = null
             
             // Create Project
             const project = await Board.create({ title })
             ctx.activeBoardId = project._id
             shouldRefresh = true;
             
             // Execute next action (add_bucket)
             if (nextAction && nextAction.action === 'add_bucket') {
                 await Bucket.create({
                    title: nextAction.data.title,
                    boardId: project._id
                 })
                 actionReply = `Project "${project.title}" created and Bucket "${nextAction.data.title}" added. ✅`;
             } else {
                 actionReply = `Project "${project.title}" created and set as active. ✅`;
             }
             somethingConfirmed = true;
          }

          if (!somethingConfirmed) {
              actionReply = 'Action confirmed.';
          }
          break;
        }

        /* ========== CANCEL ========== */
        case 'cancel': {
           if (ctx.pendingConfirmation) {
             ctx.pendingConfirmation = null
             actionReply = 'Action cancelled.';
           } else if (ctx.pendingConfirmations) {
             ctx.pendingConfirmations = [];
             actionReply = 'Actions cancelled.';
           } else if (ctx.pendingBucketCreation) {
             ctx.pendingBucketCreation = null
             actionReply = 'Task creation cancelled.';
           } else if (ctx.pendingProjectCreation) {
             ctx.pendingProjectCreation = null
             actionReply = 'Project creation cancelled.';
           } else {
             actionReply = 'Nothing to cancel.';
           }
           break;
        }


        /* ========== UNDO ========== */
        case 'undo': {
          // Priority 0: Undo Delete All
          if (ctx.lastDeletedAll) {
             const { type, items } = ctx.lastDeletedAll
             if (type === 'project') await Board.insertMany(items)
             if (type === 'member') await User.insertMany(items)
             if (type === 'task') await Task.insertMany(items)
             
             ctx.lastDeletedAll = null
             shouldRefresh = true
             actionReply = `Undo successful: All ${type}s restored. ✅`;
             break;
          }

          // Priority 1: Undo Delete
          if (ctx.lastDeleted) {
            await ctx.lastDeleted.model.create(ctx.lastDeleted.data)
            ctx.lastDeleted = null
            shouldRefresh = true;
            actionReply = 'Undo successful: Deleted item restored. ✅';
            break;
          }

          // Priority 2: Undo Rename
          if (ctx.lastRename) {
            const { model, id, oldName } = ctx.lastRename
            
            await model.findByIdAndUpdate(id, { title: oldName })
            ctx.lastRename = null
            shouldRefresh = true;
            actionReply = `Undo successful: Renamed back to "${oldName}". ✅`;
            break;
          }

          actionReply = 'Nothing to undo.';
          break;
        }

        /* ========== SHOW PROJECTS ========== */
        case 'show_projects': {
          const projects = await Board.find().sort({ createdAt: -1 })
          const projectList = projects.length > 0
            ? projects.map(p => `• ${p.title}`).join('\n')
            : 'No projects found.'
          
          actionReply = `Here are your projects:\n${projectList}`;
          break;
        }

        /* ========== SHOW BUCKETS ========== */
        case 'show_buckets': {
          const project = await Board.findById(ctx.activeBoardId)
          if (!project) {
             actionReply = await listProjectsAndAsk('Please select a project first.');
             stopProcessing = true;
             break;
          }

          const buckets = await Bucket.find({ boardId: project._id })
          ctx.lastResult = buckets
          
          const bucketList = buckets.length > 0
             ? buckets.map(b => `• ${b.title}`).join('\n')
             : 'No buckets found.'
          
          actionReply = `Here are the buckets in ${project.title}:\n${bucketList}`;
          break;
        }

        /* ========== SHOW MEMBERS ========== */
        case 'show_members': {
          const users = await User.find().sort({ name: 1 })
          const userList = users.length > 0
             ? users.map(u => `• ${u.name}`).join('\n')
             : 'No members found.'
          
          actionReply = `Here are the members:\n${userList}`;
          break;
        }

      /* ========== SHOW TASKS ========== */
  case 'show_tasks': {
    const project = await Board.findById(ctx.activeBoardId)
    if (!project) {
      actionReply = 'Please select a project first.';
      stopProcessing = true; // stop?
      break
    }

    let bucket

    if (data.bucket) {
      bucket = await Bucket.findOne({
        title: new RegExp(`^${data.bucket}$`, 'i'),
        boardId: project._id
      })
    } else {
      bucket = await Bucket.findOne({ boardId: project._id })
    }

    if (!bucket) {
      actionReply = 'No bucket found in the active project.';
      break
    }

    const tasks = await Task.find({ bucketId: bucket._id })
    ctx.lastResult = tasks

    const taskList = tasks.length > 0 
      ? tasks.map(t => `• ${t.title} [${t.priority || '-'}]`).join('\n')
      : 'No tasks found.'

    actionReply = `Tasks in ${bucket.title}:\n${taskList}`;
    break;
  }

  /* =====================================================
    📅 SHOW SPRINT VIEW
  ===================================================== */
  case 'show_sprint_view': {
    const project = await Board.findById(ctx.activeBoardId)
    if (!project) {
      actionReply = 'Please select a project first.';
      break
    }

    const sprintData = await sprintScheduler(project._id)
    ctx.lastResult = sprintData

    actionReply = ai.reply || 'Here is the sprint view.';
    break
  }

  /* =====================================================
    👤 SHOW USER DAY VIEW
  ===================================================== */
  case 'show_user_day': {
    if (!data.user) {
      actionReply = 'Which user should I check?';
      break
    }

    const user = await User.findOne({
      name: new RegExp(`^${data.user}$`, 'i')
    })

    if (!user) {
      actionReply = `User "${data.user}" not found.`;
      break
    }

    const day = data.date
      ? expandUserDay(data.date)
      : expandUserDay('today')

    const tasks = await Task.find({
      assignedTo: user._id,
      startDate: { $lte: day },
      dueDate: { $gte: day }
    })
      .select('title priority progress activityType estimatedDays dueDate')

    ctx.lastResult = tasks

    const taskLines = tasks.map((task, index) => {
        const activity = task.activityType || 'Not Set'
        return `${index + 1}. ${task.title} (${activity})`
      })
    
    actionReply = `Here is ${user.name}'s schedule for ${format(day, 'yyyy-MM-dd')}:\n${taskLines.join('\n')}`;
    break;
  }

  /* =====================================================
    📆 SHOW TODAY
  ===================================================== */
  case 'show_today': {
    const today = expandUserDay('today')

    const tasks = await Task.find({
      startDate: { $lte: today },
      dueDate: { $gte: today }
    })

    ctx.lastResult = tasks
    
    const taskList = tasks.map(t => `• ${t.title}`).join('\n')
    actionReply = `Tasks for Today:\n${taskList}`;
    break;
  }

  /* =====================================================
    📆 SHOW TOMORROW
  ===================================================== */
  case 'show_tomorrow': {
    const tomorrow = expandUserDay('tomorrow')

    const tasks = await Task.find({
      startDate: { $lte: tomorrow },
      dueDate: { $gte: tomorrow }
    })

    ctx.lastResult = tasks
    const taskList = tasks.map(t => `• ${t.title}`).join('\n')
    actionReply = `Tasks for Tomorrow:\n${taskList}`;
    break;
  }

  case 'none':
  default:
    // do nothing
    break
  }   // ✅ CLOSE switch

  // Append action reply if it exists
  if (actionReply) {
      accumulatedReplies.push(actionReply);
  }

  }   // ✅ CLOSE for-loop

  /* ===== FINAL RESPONSE (AFTER LOOP) ===== */

  // If we had actions that generated replies, join them.
  let finalResponseText = '';

  if (accumulatedReplies.length > 0) {
      finalResponseText = accumulatedReplies.join('\n\n');
  } else {
      // Fallback to LLM reply if no backend actions generated output (e.g. general chitchat)
      finalResponseText = ai?.reply || 'How can I help you with your project?';
  }

    console.log('Final fallback response:', finalResponseText);
    return res.json({
      reply: finalResponseText,
      shouldRefresh,
      activeBoardId: ctx.activeBoardId
    });

  }
   catch (err) 
  {
    console.error('Chatbot route error:', err);
    return res.status(500).json({
      reply: 'Something went wrong. Please try again.'
    })
  }
  })
                                 
module.exports = router;
