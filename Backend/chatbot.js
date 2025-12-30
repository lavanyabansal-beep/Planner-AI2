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
      content: `
You are an AI Project Management Assistant integrated into a real backend system.

Your job is NOT to execute actions directly.
Your job is to UNDERSTAND user intent, manage conversational workflows, and guide the user naturally.

====================================================
CORE CONCEPTS
====================================================

• The user says "project" → internally this maps to "board"
• The system already has:
  - projects (boards)
  - buckets (lists)
  - tasks
  - users
• The system supports multi-turn conversations and memory.

You MUST behave like a HUMAN ASSISTANT, not a command parser.

====================================================
CRITICAL BEHAVIOR RULES (NON-NEGOTIABLE)
====================================================

1️⃣ NATURAL LANGUAGE FIRST
- Accept ANY natural phrasing.
- Never require specific keywords or rigid prompts.
- Examples that MUST work:
  - "get rid of this project"
  - "undo that"
  - "add bucket git to github"
  - "rename gan as GAN"
  - "yes", "create it", "use existing one"

2️⃣ CONTEXT AWARENESS
- Remember previous turns.
- If the assistant just asked "Which project?", and the user says "testing", interpret it as "set active project to testing".
- If the assistant just asked "Create bucket X?", and the user says "yes", interpret it as "confirm".

3️⃣ ACTIVE PROJECT HANDLING (AUTOMATIC)
- NEVER ask the user to repeatedly "set active project".
- Determine project using this priority:
  1. Project explicitly mentioned by user (EXTRACT THIS!)
  2. Previously active project
  3. If only one project exists → auto select
  4. Otherwise → ask ONCE and remember

4️⃣ MISSING INFORMATION FLOW
- If required info is missing:
  - Ask a clear, friendly question
  - Wait for answer
  - Resume original action automatically
- DO NOT restart or re-ask everything.

5️⃣ NON-EXISTING PROJECT HANDLING
If user refers to a project that does not exist:
- DO NOT fail
- DO NOT say "invalid project"
- Instead:
  - Explain the project does not exist
  - Show ALL existing project names
  - Ask:
    • Create the project
    • OR use an existing one

6️⃣ UNDO MUST ALWAYS WORK
- Undo must work for:
  - delete project/bucket/task/member
  - delete ALL projects/buckets/tasks/members
  - rename project/bucket/task
- If nothing can be undone, say so clearly.
- Never ask vague questions like “what do you want to undo”.

7️⃣ REAL-TIME CONVERSATION
- Never say things that imply refresh or restart.
- Assume backend state updates instantly.
- Speak as if everything updates immediately.

8️⃣ FRIENDLY GUIDANCE (NO DEAD ENDS)
- NEVER respond with:
  - “Active project is invalid”
  - “Please set active project”
  - “Invalid command”
- ALWAYS guide the user forward.

9️⃣ DATA ACCURACY (CRITICAL)
- **NEVER** guess or hallucinate data about projects, tasks, or members.
- If the user asks for data (e.g., "how many projects", "who is a member", "show tasks"), you **MUST** use the appropriate \`show_*\` action.
- Do NOT assume you know the answer. Let the system fetch it.

====================================================
🪣 BUCKET vs PROJECT DISAMBIGUATION (CRITICAL)
====================================================

When the user says: "add task <task> to <X>"

1. <X> is ALWAYS a BUCKET. NEVER a project.
   - Example: "add task fix bugs to frontend ui"
     → bucket = "frontend ui"
     → project = (do not change)

2. NEVER infer a project switch from an "add task" command.
   - If an active project exists, use it.

3. Bucket names can be multi-word (e.g., "voice agent", "api testing").

4. RESPONSE FORMAT:
   - Use PRESENT CONTINUOUS tense (e.g., "Adding task...", "Creating task...").
   - Do NOT say "done" or "success" in the intent reply.

   Example JSON:
   {
     "actions": [
       {
         "action": "add_task",
         "data": { "title": "agent", "bucket": "voice agent" }
       }
     ],
     "reply": "Adding the task agent to the bucket voice agent."
   }

====================================================
INTENT EXTRACTION RULES
====================================================

Return ONLY valid JSON.

Format:
{
  "actions": [
    {
      "action": "<intent_name>",
      "data": { ... }
    }
  ],
  "reply": "<friendly human response>"
}

====================================================
SUPPORTED ACTIONS
====================================================

create_project
add_bucket
add_task
add_member
delete
delete_all
rename_project
rename_bucket
rename_task
update_task
set_active_project
show_projects
show_buckets
show_members
show_tasks
show_user_tasks
show_user_day
show_today
show_tomorrow
show_sprint_view
show_activity_types
show_allowed_values
show_capabilities
greet
confirm
cancel
undo
reset_chat
none

====================================================
REQUIRED FIELD EXTRACTION
====================================================

• create_project → data.title
• add_bucket → data.title AND data.project (if specified)
• add_task → data.title AND data.bucket
• rename_* → data.oldName AND data.newName
• delete → data.type AND data.name
• delete_all → data.type (projects, members, tasks)
• add_member → data.name
• update_task → data.title (and fields being updated)
• show_allowed_values → data.field (priority, progress, activityType)

====================================================
SPECIAL RULES
====================================================

• **PRIORITY vs PROGRESS**:
  - **Priority** values are ONLY: urgent, important, medium, low
  - **Progress** values are ONLY: not started, in progress, completed
  - **Activity Types** are ONLY: One-Time, Continuous, API/1-Day, Recurring Weekly, Buffer, Parallel Allowed, Milestone

• If user says "set priority to not started", CORRECT them to "progress".
• If user says "set progress to urgent", CORRECT them to "priority".

• If user asks "what values can I set for X", use action: show_allowed_values with data.field = X.

• If user says "undo" → ALWAYS use action: undo

• If user says "yes" or "confirm" (after a confirmation request) → use action: confirm
• If user says "no" or "cancel" → use action: cancel

• If user asks "what can you do" or "help" → use action: show_capabilities
• If user asks "what activity types" → use action: show_activity_types

• If user says "hello", "hi", "hey" → use action: greet

• If user says "revert to greeting" or "reset", use action: reset_chat

• **Single Word Project Selection**:
  If the user provides a single word (e.g., "testing", "gan") and it looks like a project name, especially after being asked to select a project, assume action: set_active_project with data.title = <word>.

• If information is missing:
  - Use action: none
  - Ask a clear follow-up question

====================================================
TONE & STYLE
====================================================

• Friendly
• Clear
• Helpful
• Confident
• Never robotic
• Never technical to the user

====================================================
EXAMPLES
====================================================

User: add bucket git to github
→ { "actions": [{ "action": "add_bucket", "data": { "title": "git", "project": "github" } }] }

User: github does not exist
Reply: "Project 'github' does not exist..."

User: yes
→ create project github
→ add bucket git

User: rename gan to GAN
→ rename_project

User: undo
→ revert rename

User: delete all projects
→ { "actions": [{ "action": "delete_all", "data": { "type": "project" } }] }

User: yes (answering confirmation)
→ { "actions": [{ "action": "confirm" }] }

User: what values for priority
→ { "actions": [{ "action": "show_allowed_values", "data": { "field": "priority" } }] }

User: what can i set progress to
→ { "actions": [{ "action": "show_allowed_values", "data": { "field": "progress" } }] }

User: assign generative to ram
→ { "actions": [{ "action": "update_task", "data": { "title": "generative", "assignedTo": ["ram"] } }] }

User: what work is assigned to ram
→ { "actions": [{ "action": "show_user_tasks", "data": { "user": "ram" } }] }

User: ram (answering "Which user?")
→ { "actions": [{ "action": "show_user_tasks", "data": { "user": "ram" } }] }

User: testing (answering "Which project?")
→ { "actions": [{ "action": "set_active_project", "data": { "title": "testing" } }] }

User: revert to greeting
→ { "actions": [{ "action": "reset_chat" }] }

User: hello
→ { "actions": [{ "action": "greet" }] }

User: Would you like to create "dbbase"? (Bot) -> yes (User)
→ { "actions": [{ "action": "confirm" }] }

====================================================
FINAL RULE
====================================================

You are a WORKFLOW CONTROLLER.
Your goal is to help the user succeed with minimum friction.

NEVER break the conversation flow.
NEVER require exact prompts.
ALWAYS guide forward.
`
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

  async function listProjectsAndAsk(res, message) {
    const projects = await Board.find().sort({ createdAt: -1 })
    const projectList = projects.map(p => `• ${p.title}`).join('\n')
    return res.json({
      reply: `${message}\n\nHere are the existing projects:\n${projectList}\n\nWould you like to create a new one or use one of these?`
    })
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
      let responded = false;
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

      /* =====================================================
        🔁 AUTO SWITCH PROJECT IF PROVIDED
      ===================================================== */
      let finalReply = ai.reply || 'How can I help you with your project?';
      
      for (const step of actions) {
        const action = step.action || 'none'
        const data = step.data || {}

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
            responded = true;
            
            // Store pending state for creation
            ctx.pendingProjectCreation = {
              title: data.project,
              nextAction: step
            }

            const projects = await Board.find().sort({ createdAt: -1 })
            const projectList = projects.length > 0 
              ? projects.map(p => `• ${p.title}`).join('\n')
              : 'None'

            return res.json({
              reply: `Project "${data.project}" does not exist.\n\nAvailable projects:\n${projectList}\n\nWould you like to create "${data.project}"?`
            })
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
        const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)]
        return res.json({ reply: randomGreeting })
      }

      /* ========== RESET CHAT ========== */
      case 'reset_chat': {
        ctx.history = []
        return res.json({ reply: 'Hello! I am your Planner AI. How can I help you today? 👋' })
      }

      /* ========== SHOW CAPABILITIES ========== */
      case 'show_capabilities': {
        return res.json({
          reply: `I can help you with the following:
• Create and manage projects (boards)
• Add, rename, and delete buckets (lists)
• Add, update, and assign tasks
• Manage team members
• Show daily schedules and sprint views
• Undo recent changes (including delete all)
• Answer questions about your project data (e.g., "what is ram doing")

Just ask me naturally! 🚀`
        })
      }

      /* ========== SHOW ACTIVITY TYPES ========== */
      case 'show_activity_types': {
        const list = allowedActivityTypes.map(t => `• ${t.replace(/_/g, ' ')}`).join('\n')
        return res.json({
          reply: `Here are the available activity types:\n${list}`
        })
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
            return res.json({ reply: 'I can show allowed values for: Priority, Progress, and Activity Type.' });
        }

        const list = values.map(v => `• ${v.replace(/_/g, ' ')}`).join('\n');
        return res.json({
            reply: `Here are the allowed values for ${name}:\n${list}`
        });
      }


      /* ========== SHOW USER TASKS (ALL – CHATBOT OUTPUT) ========== */
      case 'show_user_tasks': {
        if (!data.user) {
          return res.json({ reply: 'Which user should I check?' })
        }

        const user = await User.findOne({
          name: new RegExp(`^${data.user}$`, 'i')
        })

        if (!user) {
          return res.json({ reply: `User "${data.user}" not found.` })
        }

        const tasks = await Task.find({
          assignedTo: user._id
        })
          .populate('bucketId', 'title')
          .select('title priority progress bucketId activityType estimatedDays dueDate')

        if (!tasks.length) {
          return res.json({
            reply: `No tasks are assigned to ${user.name}.`
          })
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

      return res.json({
        reply: `Here is the work assigned to ${user.name}:${LINE}${LINE}${taskLines.join(`${LINE}${LINE}`)}`
      })
      }


      /* ========== ADD TASK (Formerly create_task) ========== */
      case 'add_task': {
        // Required: title, bucket
        // Optional: description, assignedTo, priority, progress, activityType, etaDays, startDate, dueDate, checklist
        const missing = [];
        if (!data.title) missing.push('title');
        if (!data.bucket) missing.push('bucket');

        // Ask for missing required fields
        if (missing.length) {
          responded = true;
          return res.json({
            reply: `Please provide: ${missing.join(', ')} to add a task.`
          });
        }

        const project = await Board.findById(ctx.activeBoardId);
        if (!project) {
           return listProjectsAndAsk(res, 'Please select a project first.')
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

          return res.json({
            reply: `Bucket "${data.bucket}" does not exist in project "${project.title}".
            
Available buckets:
${bucketList}

Would you like to create "${data.bucket}"?`
          })
        }

        // 🚫 Check for Duplicate Task
        const existingTask = await Task.findOne({ 
            title: new RegExp(`^${data.title}$`, 'i'), 
            bucketId: bucket._id 
        });
        if (existingTask) {
            return res.json({
                reply: `Task "${data.title}" already exists in bucket "${bucket.title}".`
            });
        }

        // Validate users
        let assignedIds = [];
        if (data.assignedTo?.length) {
          const { users, missing } = await resolveUsersByNames(data.assignedTo);
          if (missing.length) {
            return res.json({
              reply: `User(s) ${missing.join(', ')} do not exist. Should I create them?`
            });
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
          return res.json({
        reply: formatError(
          'activity type',
          data.activityType,
          allowedActivityTypes
        )
      })
      }

      taskData.activityType = normalizedActivity
      }
      const task = await Task.create(taskData);
      shouldRefresh = true; // Task Created
      return res.json({
      reply: `Task "${task.title}" created in bucket "${bucket.title}".`,
      shouldRefresh,
      activeBoardId: ctx.activeBoardId
      });
            }

 /* ========== UPDATE TASK (FULL) ========== */
case 'update_task': {
  // 🚨 Safety: prevent progress words being treated as activity
const forbiddenAsActivity = ['completed', 'in progress', 'not started']

if (data.activityType && forbiddenAsActivity.includes(data.activityType.toLowerCase())) {
  return res.json({
    reply: `Did you mean to update progress instead of activity? 
Try: "set progress to ${data.activityType} in ${data.title}".`
  })
}

  if (!data.title) {
    return res.json({ reply: 'Please specify the task title to update.' })
  }

  const project = await Board.findById(ctx.activeBoardId)
  if (!project) {
    return listProjectsAndAsk(res, 'Please select a project first.')
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
        return res.json({ reply: `"${isProject.title}" is a project. I can only update priority/progress for tasks.` })
    }
    const isBucket = await Bucket.findOne({ title: new RegExp(`^${data.title}$`, 'i'), boardId: project._id })
    if (isBucket) {
        return res.json({ reply: `"${isBucket.title}" is a bucket. I can only update priority/progress for tasks.` })
    }

    return res.json({ reply: `Task "${data.title}" not found in this project.` })
  }

  // ===== Priority =====
  if (data.priority) {
    const priorityEnum = enumFromSchema(Task.schema, 'priority')
    const matchedPriority = priorityEnum.find(
      p => p.toLowerCase() === data.priority.toLowerCase()
    )

    if (!matchedPriority) {
      return res.json({
  reply: formatError(
    'priority',
    data.priority,
    enumFromSchema(Task.schema, 'priority')
  )
})

    }

    task.priority = matchedPriority
  }

  // ===== Progress =====
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
    return res.json({
  reply: formatError(
    'progress',
    data.progress,
    enumFromSchema(Task.schema, 'progress')
  )
})
}

  task.progress = matchedProgress
}

// ===== Activity Type (UPDATE) =====
if (data.activityType) {
  const normalizedActivity = normalizeActivityType(data.activityType)

  if (!normalizedActivity || !allowedActivityTypes.includes(normalizedActivity)) {
    return res.json({
      reply: `Invalid activity type: ${data.activityType}.
Allowed values are:
• One-Time
• Continuous
• API/1-Day
• Recurring Weekly
• Buffer
• Parallel Allowed
• Milestone`
    })
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
      return res.json({
        reply: `User(s) ${missing.join(', ')} do not exist.`
      })
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

  console.log('✅ TASK UPDATED:', {
    id: task._id,
    title: task.title,
    priority: task.priority,
    progress: task.progress,
    activityType: task.activityType
  })

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

return res.json({
  reply: `Task "${task.title}" updated successfully.
Priority: ${task.priority || 'unchanged'}
Progress: ${task.progress || 'unchanged'}
Activity Type: ${activityLabel}`,
  shouldRefresh,
  activeBoardId: ctx.activeBoardId
})

}

      

      /* ========== RENAME PROJECT ========== */
      case 'rename_project': {
        if (!data.oldName || !data.newName) {
            finalReply = "Please provide the old and new project names.";
            break;
        }

        const project = await Board.findOne({
          title: new RegExp(`^${data.oldName}$`, 'i')
        })
        
        if (!project) {
            finalReply = `Project "${data.oldName}" not found.`;
            break;
        }

        saveRenameUndo(ctx, Board, project._id, project.title)

        project.title = data.newName
        await project.save()
        shouldRefresh = true; // Renamed
        
        return res.json({
            reply: `Project renamed to "${data.newName}".`,
            shouldRefresh,
            activeBoardId: ctx.activeBoardId
        });
      }


          //rename bucket
 case 'rename_bucket': {
  if (!data.oldName || !data.newName) {
    responded = true
    return res.json({ reply: ai.reply || 'Done.' })
  }


        const project = await Board.findById(ctx.activeBoardId)
        if (!project) {
          return listProjectsAndAsk(res, 'Please select a project first.')
        }

        const bucket = await Bucket.findOne({
          title: new RegExp(`^${data.oldName}$`, 'i'),
          boardId: project._id
        })

        if (!bucket)
          return res.json({ reply: 'Bucket not found.' })

        saveRenameUndo(ctx, Bucket, bucket._id, bucket.title)

        bucket.title = data.newName
        await bucket.save()
        shouldRefresh = true; // Renamed

        return res.json({
          reply: `Bucket renamed to "${data.newName}"`,
          shouldRefresh,
          activeBoardId: ctx.activeBoardId
        })
      }



      // rename task
      case 'rename_task': {
  if (!data.oldName || !data.newName) {
    finalReply = 'Please provide old and new task names.'
    break
  }

  const project = await Board.findById(ctx.activeBoardId)
  if (!project) {
    return listProjectsAndAsk(res, 'Please select a project first.')
  }

  const bucket = data.bucket
    ? await Bucket.findOne({
        title: new RegExp(`^${data.bucket}$`, 'i'),
        boardId: project._id
      })
    : await Bucket.findOne({ boardId: project._id })

  if (!bucket) {
    finalReply = 'Bucket not found.'
    break
  }

  const task = await Task.findOne({
    title: new RegExp(`^${data.oldName}$`, 'i'),
    bucketId: bucket._id
  })

  if (!task) {
    finalReply = `Task "${data.oldName}" not found in "${bucket.title}".`
    break
  }

  saveRenameUndo(ctx, Task, task._id, task.title)

  task.title = normalize(data.newName)
  await task.save()
  shouldRefresh = true; // Renamed

  return res.json({
    reply: `Task renamed to "${task.title}".`,
    shouldRefresh,
    activeBoardId: ctx.activeBoardId
  })
}


        /* ========== CREATE PROJECT ========== */
        case 'create_project': {
          if (!data.title){
            responded = true
return res.json({ reply: ai.reply })
          }

          // 🚫 Check for Duplicate Project
          const existingProject = await Board.findOne({ 
              title: new RegExp(`^${data.title}$`, 'i') 
          });
          if (existingProject) {
              return res.json({
                  reply: `Project "${existingProject.title}" already exists. Please choose a different name.`
              });
          }

          const project = await Board.create({ title: data.title })
          ctx.activeBoardId = project._id
          shouldRefresh = true; // Created Project

          return res.json({
            reply: `Project "${project.title}" created and set as active`,
            shouldRefresh,
            activeBoardId: ctx.activeBoardId
          })
        }

        /* ========== SET ACTIVE PROJECT ========== */
        case 'set_active_project': {
          if (!data.title){
          responded = true
return res.json({ reply: ai.reply })
          }


          const project = await Board.findOne({
            title: new RegExp(`^${data.title}$`, 'i')
          })

          if (!project){
             return listProjectsAndAsk(res, 'Project not found.')
        }
          ctx.activeBoardId = project._id
          shouldRefresh = true; // Switched Project (Refresh to show it)
          return res.json({ 
            reply: `Switched to project "${project.title}"`,
            shouldRefresh,
            activeBoardId: ctx.activeBoardId
          })
        }

        /* ========== ADD BUCKET ========== */
        case 'add_bucket': {
          if (!data.title){
            responded = true
return res.json({ reply: ai.reply })
          }


          const project = await Board.findById(ctx.activeBoardId)

          if (!project) {
            ctx.activeBoardId = null
            return listProjectsAndAsk(res, 'Active project is invalid. Please select a project.')
          }

          // 🚫 Check for Duplicate Bucket
          const existingBucket = await Bucket.findOne({ 
              title: new RegExp(`^${data.title}$`, 'i'), 
              boardId: project._id 
          });
          if (existingBucket) {
              return res.json({
                  reply: `Bucket "${existingBucket.title}" already exists in project "${project.title}".`
              });
          }

          await Bucket.create({
            title: data.title,
            boardId: project._id
          })
          shouldRefresh = true; // Bucket Added

          return res.json({
            reply: `Bucket "${data.title}" added to project "${project.title}"`,
            shouldRefresh,
            activeBoardId: ctx.activeBoardId
          })
        }

        /* ========== ADD MEMBER ========== */
        case 'add_member': {
          if (!data.name){
            responded = true
return res.json({ reply: ai.reply })
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
          responded = true;
          return res.json({ 
            reply: `Member "${data.name}" added successfully.`,
            shouldRefresh,
            activeBoardId: ctx.activeBoardId
          });

        }

        /* ========== DELETE ========== */
        case 'delete': {
          if (!data.type || !data.name){
            responded = true
return res.json({ reply: ai.reply })

          }
          let Model, field

          if (data.type === 'task') { Model = Task; field = 'title' }
          if (data.type === 'bucket') { Model = Bucket; field = 'title' }
          if (data.type === 'project') { Model = Board; field = 'title' }
          if (data.type === 'member') { Model = User; field = 'name' }

          if (!Model)
            return res.json({ reply: 'Invalid delete request.' })

          const doc = await Model.findOne({
            [field]: new RegExp(data.name, 'i')
          })

          if (!doc)
            return res.json({ reply: 'Nothing found to delete.' })

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
{
          responded = true
return res.json({ 
  reply: ai.reply || `${data.type} deleted.`,
  shouldRefresh,
  activeBoardId: ctx.activeBoardId
 })
}

        }

        /* ========== DELETE ALL ========== */
        case 'delete_all': {
          if (!data.type) {
            return res.json({ reply: 'What would you like to delete all of?' })
          }

          ctx.pendingConfirmation = {
            action: 'delete_all',
            type: data.type
          }

          return res.json({
            reply: `⚠️ Are you sure you want to PERMANENTLY delete ALL ${data.type}s? This cannot be undone.`
          })
        }

        /* ========== CONFIRM ========== */
        case 'confirm': {
          
          // 1. Pending Delete All
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
                return res.json({ reply: 'All projects have been deleted. You can say "undo" to restore them.', shouldRefresh, activeBoardId: null })
              }
              if (type === 'member') {
                const users = await User.find({})
                if (users.length > 0) {
                    ctx.lastDeletedAll = { type: 'member', items: users.map(u => u.toObject()) }
                    await User.deleteMany({})
                }
                shouldRefresh = true;
                return res.json({ reply: 'All members have been deleted. You can say "undo" to restore them.', shouldRefresh, activeBoardId: ctx.activeBoardId })
              }
              if (type === 'task') {
                 const tasks = await Task.find({})
                 if (tasks.length > 0) {
                    ctx.lastDeletedAll = { type: 'task', items: tasks.map(t => t.toObject()) }
                    await Task.deleteMany({})
                 }
                 shouldRefresh = true;
                 return res.json({ reply: 'All tasks have been deleted. You can say "undo" to restore them.', shouldRefresh, activeBoardId: ctx.activeBoardId })
              }
            }
          }
          
          // 2. Pending Bucket Creation
          if (ctx.pendingBucketCreation) {
             const { bucketName, taskData, projectId } = ctx.pendingBucketCreation
             ctx.pendingBucketCreation = null
             
             // Create Bucket
             const bucket = await Bucket.create({
                title: bucketName,
                boardId: projectId
             })
             
             // Then Create Task
             // Re-validate logic similar to add_task
             // (Simplified here assuming data is valid as it came from add_task)
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
             return res.json({
               reply: `Bucket "${bucket.title}" created. Task "${task.title}" added to it. ✅`,
               shouldRefresh,
               activeBoardId: ctx.activeBoardId
             })
          }

          // 3. Pending Project Creation
          if (ctx.pendingProjectCreation) {
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
                 return res.json({
                    reply: `Project "${project.title}" created and Bucket "${nextAction.data.title}" added. ✅`,
                    shouldRefresh,
                    activeBoardId: ctx.activeBoardId
                 })
             }
             
             return res.json({
               reply: `Project "${project.title}" created and set as active. ✅`,
               shouldRefresh,
               activeBoardId: ctx.activeBoardId
             })
          }
          
          return res.json({ reply: 'Action confirmed.' })
        }

        /* ========== CANCEL ========== */
        case 'cancel': {
           if (ctx.pendingConfirmation) {
             ctx.pendingConfirmation = null
             return res.json({ reply: 'Action cancelled.' })
           }
           if (ctx.pendingBucketCreation) {
             ctx.pendingBucketCreation = null
             return res.json({ reply: 'Task creation cancelled.' })
           }
           if (ctx.pendingProjectCreation) {
             ctx.pendingProjectCreation = null
             return res.json({ reply: 'Project creation cancelled.' })
           }
           return res.json({ reply: 'Nothing to cancel.' })
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
             return res.json({ reply: `Undo successful: All ${type}s restored. ✅`, shouldRefresh, activeBoardId: ctx.activeBoardId })
          }

          // Priority 1: Undo Delete
          if (ctx.lastDeleted) {
            await ctx.lastDeleted.model.create(ctx.lastDeleted.data)
            ctx.lastDeleted = null
            shouldRefresh = true;
            return res.json({ reply: 'Undo successful: Deleted item restored. ✅', shouldRefresh, activeBoardId: ctx.activeBoardId })
          }

          // Priority 2: Undo Rename
          if (ctx.lastRename) {
            const { model, id, oldName } = ctx.lastRename
            
            await model.findByIdAndUpdate(id, { title: oldName })
            ctx.lastRename = null
            shouldRefresh = true;
            return res.json({ reply: `Undo successful: Renamed back to "${oldName}". ✅`, shouldRefresh, activeBoardId: ctx.activeBoardId })
          }

          return res.json({ reply: 'Nothing to undo.' })
        }

        /* ========== SHOW PROJECTS ========== */
        case 'show_projects': {
          const projects = await Board.find().sort({ createdAt: -1 })
          const projectList = projects.length > 0
            ? projects.map(p => `• ${p.title}`).join('\n')
            : 'No projects found.'
          
          return res.json({ 
            reply: `Here are your projects:\n${projectList}` 
          })
        }

        /* ========== SHOW BUCKETS ========== */
        case 'show_buckets': {
          const project = await Board.findById(ctx.activeBoardId)
          if (!project) {
             return listProjectsAndAsk(res, 'Please select a project first.')
          }

          const buckets = await Bucket.find({ boardId: project._id })
          ctx.lastResult = buckets
          
          const bucketList = buckets.length > 0
             ? buckets.map(b => `• ${b.title}`).join('\n')
             : 'No buckets found.'
          
          return res.json({ 
            reply: `Here are the buckets in ${project.title}:\n${bucketList}` 
          })
        }

        /* ========== SHOW MEMBERS ========== */
        case 'show_members': {
          const users = await User.find().sort({ name: 1 })
          const userList = users.length > 0
             ? users.map(u => `• ${u.name}`).join('\n')
             : 'No members found.'
          
          return res.json({
            reply: `Here are the members:\n${userList}`
          })
        }

      /* ========== SHOW TASKS ========== */
  case 'show_tasks': {
    const project = await Board.findById(ctx.activeBoardId)
    if (!project) {
      finalReply = 'Please select a project first.'
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
      finalReply = 'No bucket found in the active project.'
      break
    }

    const tasks = await Task.find({ bucketId: bucket._id })
    ctx.lastResult = tasks

    const taskList = tasks.length > 0 
      ? tasks.map(t => `• ${t.title} [${t.priority || '-'}]`).join('\n')
      : 'No tasks found.'

    return res.json({
      reply: `Tasks in ${bucket.title}:\n${taskList}`
    })
  }

  /* =====================================================
    📅 SHOW SPRINT VIEW
  ===================================================== */
  case 'show_sprint_view': {
    const project = await Board.findById(ctx.activeBoardId)
    if (!project) {
      finalReply = 'Please select a project first.'
      break
    }

    const sprintData = await sprintScheduler(project._id)
    ctx.lastResult = sprintData

    finalReply = ai.reply || 'Here is the sprint view.'
    break
  }

  /* =====================================================
    👤 SHOW USER DAY VIEW
  ===================================================== */
  case 'show_user_day': {
    if (!data.user) {
      finalReply = 'Which user should I check?'
      break
    }

    const user = await User.findOne({
      name: new RegExp(`^${data.user}$`, 'i')
    })

    if (!user) {
      finalReply = `User "${data.user}" not found.`
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
    
    return res.json({
      reply: `Here is ${user.name}'s schedule for ${format(day, 'yyyy-MM-dd')}:\n${taskLines.join('\n')}`
    })
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
    return res.json({ reply: `Tasks for Today:\n${taskList}` })
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
    return res.json({ reply: `Tasks for Tomorrow:\n${taskList}` })
  }

  case 'none':
  default:
    // do nothing, reply already handled
    break
  }   // ✅ CLOSE switch
  }   // ✅ CLOSE for-loop

  /* ===== FINAL RESPONSE (AFTER LOOP) ===== */
  if (!responded) {
    console.log('Final fallback response:', finalReply || ai?.reply || 'How can I help you with your project?');
    return res.json({
      reply: finalReply || ai?.reply || 'How can I help you with your project?',
      shouldRefresh,
      activeBoardId: ctx.activeBoardId
    });
  }

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
