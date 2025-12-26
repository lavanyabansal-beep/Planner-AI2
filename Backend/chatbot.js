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
    'parallel': 'PARALLEL_ALLOWED'
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
- If you ask a question and the user answers it, CONTINUE the action.
- Never forget what you were trying to do.

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
  - delete project
  - delete bucket
  - delete task
  - rename project
  - rename bucket
  - rename task
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
confirm
cancel
undo
none

====================================================
REQUIRED FIELD EXTRACTION
====================================================

• create_project → data.title
• add_bucket → data.title
• add_task → data.title AND data.bucket
• rename_* → data.oldName AND data.newName
• delete → data.type AND data.name
• delete_all → data.type (projects, members, tasks)
• add_member → data.name
• update_task → data.title (and fields being updated)

====================================================
SPECIAL RULES
====================================================

• “progress” ≠ “activity type”
• Progress values only:
  - not started
  - in progress
  - completed

• Activity types only:
  - One-Time
  - Continuous
  - API/1-Day
  - Recurring Weekly
  - Buffer
  - Parallel Allowed

• If user says "undo" → ALWAYS use action: undo

• If user says "yes" or "confirm" (after a confirmation request) → use action: confirm
• If user says "no" or "cancel" → use action: cancel

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
→ github does not exist

Reply:
"Project 'github' does not exist.
Would you like me to create it or use an existing project?"

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

User: what all activity type do you have
→ { "actions": [{ "action": "show_activity_types" }] }

User: assign generative to ram
→ { "actions": [{ "action": "update_task", "data": { "title": "generative", "assignedTo": ["ram"] } }] }

User: what work is assigned to ram
→ { "actions": [{ "action": "show_user_tasks", "data": { "user": "ram" } }] }

User: ram (answering "Which user?")
→ { "actions": [{ "action": "show_user_tasks", "data": { "user": "ram" } }] }

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

      // 🔁 auto switch project
      if (data.project) {
        const project = await Board.findOne({
          title: new RegExp(`^${data.project}$`, 'i')
        })
        if (project) ctx.activeBoardId = project._id
      }

      switch (action) {

      /* ========== SHOW ACTIVITY TYPES ========== */
      case 'show_activity_types': {
        const list = allowedActivityTypes.map(t => `• ${t.replace(/_/g, ' ')}`).join('\n')
        return res.json({
          reply: `Here are the available activity types:\n${list}`
        })
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
        if (!bucket)
          return res.json({ reply: 'Bucket not found in the active project.' });

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
      return res.json({
      reply: `Task "${task.title}" created in bucket "${bucket.title}".`
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
    return res.json({ reply: 'Task not found in this project.' })
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
• Parallel Allowed`
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
  PARALLEL_ALLOWED: 'Parallel Allowed'
}

const activityLabel = task.activityType
  ? activityLabelMap[task.activityType] || task.activityType
  : 'unchanged'

return res.json({
  reply: `Task "${task.title}" updated successfully.
Priority: ${task.priority || 'unchanged'}
Progress: ${task.progress || 'unchanged'}
Activity Type: ${activityLabel}`
})

}

      

      /* ========== RENAME PROJECT ========== */
      case 'rename_project': {
        if (!data.oldName || !data.newName) break

        const project = await Board.findOne({
          title: new RegExp(`^${data.oldName}$`, 'i')
        })
        if (!project) break

        saveRenameUndo(ctx, Board, project._id, project.title)

        project.title = data.newName
        await project.save()
        break
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

        return res.json({
          reply: `Bucket renamed to "${data.newName}"`
        })
      }



      // rename task
      case 'rename_task': {
  if (!data.oldName || !data.newName) {
    finalReply = 'Please provide old and new task names.'
    responded = true
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
    responded = true
    break
  }

  const task = await Task.findOne({
    title: new RegExp(`^${data.oldName}$`, 'i'),
    bucketId: bucket._id
  })

  if (!task) {
    finalReply = `Task "${data.oldName}" not found in "${bucket.title}".`
    responded = true
    break
  }

  saveRenameUndo(ctx, Task, task._id, task.title)

  task.title = normalize(data.newName)
  await task.save()

  finalReply = `Task renamed to "${task.title}".`
  responded = true
  break
}


        /* ========== CREATE PROJECT ========== */
        case 'create_project': {
          if (!data.title){
            responded = true
return res.json({ reply: ai.reply })
          }


          const project = await Board.create({ title: data.title })
          ctx.activeBoardId = project._id

          return res.json({
            reply: `Project "${project.title}" created and set as active`
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
          return res.json({ reply: `Switched to project "${project.title}"` })
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

          await Bucket.create({
            title: data.title,
            boardId: project._id
          })

          return res.json({
            reply: `Bucket "${data.title}" added to project "${project.title}"`
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
          responded = true;
          return res.json({ reply: `Member "${data.name}" added successfully.` });

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

          if (
            data.type === 'project' &&
            ctx.activeBoardId?.toString() === doc._id.toString()
          ) {
            ctx.activeBoardId = null
          }
{
          responded = true
return res.json({ reply: ai.reply || `${data.type} deleted.` })
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
          if (!ctx.pendingConfirmation) {
            return res.json({ reply: 'There is nothing pending to confirm.' })
          }

          const { action, type } = ctx.pendingConfirmation
          ctx.pendingConfirmation = null

          if (action === 'delete_all') {
            if (type === 'project') {
              await Board.deleteMany({})
              ctx.activeBoardId = null
              return res.json({ reply: 'All projects have been deleted.' })
            }
            if (type === 'member') {
              await User.deleteMany({})
              return res.json({ reply: 'All members have been deleted.' })
            }
            if (type === 'task') {
               // Deletes all tasks in active project or globally?
               // Assuming globally for now based on "delete all".
               // Or maybe restrict to active project? 
               // "delete all projects" implies global.
               await Task.deleteMany({})
               return res.json({ reply: 'All tasks have been deleted.' })
            }
          }
          
          return res.json({ reply: 'Action confirmed.' })
        }

        /* ========== CANCEL ========== */
        case 'cancel': {
           if (ctx.pendingConfirmation) {
             ctx.pendingConfirmation = null
             return res.json({ reply: 'Action cancelled.' })
           }
           return res.json({ reply: 'Nothing to cancel.' })
        }


        /* ========== UNDO ========== */
        case 'undo': {
          // Priority 1: Undo Delete
          if (ctx.lastDeleted) {
            await ctx.lastDeleted.model.create(ctx.lastDeleted.data)
            ctx.lastDeleted = null
            return res.json({ reply: 'Undo successful: Deleted item restored. ✅' })
          }

          // Priority 2: Undo Rename
          if (ctx.lastRename) {
            const { model, id, oldName } = ctx.lastRename
            
            await model.findByIdAndUpdate(id, { title: oldName })
            ctx.lastRename = null
            return res.json({ reply: `Undo successful: Renamed back to "${oldName}". ✅` })
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
      reply: finalReply || ai?.reply || 'How can I help you with your project?'
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
