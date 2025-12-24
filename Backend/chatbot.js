  const express = require('express')
  const axios = require('axios')

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
You are an AI project management assistant.

IMPORTANT TERMINOLOGY:
- User says "project"
- Internally it maps to "board" in database

Your task:
- Understand the user's intent
- Treat "project" and "board" as the SAME thing
- Extract required fields from natural language

REQUIRED FIELDS:
- create_project → data.title
- add_bucket → data.title
- add_task → data.title AND data.bucket
- add_member → data.name
- delete → data.type AND data.name
- rename_* → data.oldName AND data.newName
- set_activity_type → data.task AND data.activityType
- update_task → data.title AND data.activityType


OPTIONAL FIELDS:
- project
- user
- date
- range

ADDITIONAL INTENTS:
- show_projects
- show_buckets
- show_tasks
- set_active_project
- rename_project
- rename_bucket
- rename_task
- rename_member
- show_sprint_view
- show_user_day
- show_today
- show_tomorrow
- show_user_tasks

IMPORTANT DISAMBIGUATION RULES:

- "progress" and "activity type" are DIFFERENT fields
- Progress values are ONLY:
  not started, in progress, completed

- Activity types are ONLY:
  One-Time, Continuous, API/1-Day, Recurring Weekly, Buffer, Parallel Allowed

- If the user mentions the word "progress",
  YOU MUST update progress and NEVER activityType

- If the user mentions the word "activity" or "activity time",
  YOU MUST update activityType and NEVER progress



RULES:
- Respond ONLY in valid JSON
- Never include markdown or explanations
- Never leave required fields empty
- If missing info, set action="none" and ask a clear question in reply
- When the user says:
"assign priority X to task Y"
OR
"set priority of Y to X"

You MUST extract:
 data.title = Y
 data.priority = X

- When the user asks:
"show all work assigned to <user>"
"show all tasks of <user>"
"what is <user> working on"

Use action: show_user_tasks
with data.user = <user>

- When the user says ANY of the following:
"set activity type to X in Y"
"set activity time to X in Y"
"change activity of Y to X"
"update activity of task Y to X"

You MUST extract:
 action: "update_task"
 data.title = Y
 data.activityType = X


JSON FORMAT:
{
  "actions": [{ "action": "...", "data": {} }],
  "reply": "User-facing response"
}

EXAMPLES:
User: set activity time to buffer in html
{
  "actions": [
    {
      "action": "update_task",
      "data": {
        "title": "html",
        "activityType": "buffer"
      }
    }
  ],
  "reply": "Activity type set to Buffer for task html."
}

User: change activity of java to one-time
{
  "actions": [
    {
      "action": "update_task",
      "data": {
        "title": "java",
        "activityType": "one-time"
      }
    }
  ],
  "reply": "Activity type updated for task java."
}


User: show all work assigned to ram
{
  "actions": [{ "action": "show_user_tasks", "data": { "user": "ram" } }],
  "reply": "Here are all tasks assigned to ram."
}

User: assign priority to medium to task java
{
  "actions": [
    {
      "action": "update_task",
      "data": {
        "title": "java",
        "priority": "medium"
      }
    }
  ],
  "reply": "Priority set to medium for task java."
}

User: delete task openkey
{
  "actions": [{ "action": "delete", "data": { "type": "task", "name": "openkey" } }],
  "reply": "Task 'openkey' deleted."
}

User: rename project api to api1
{
  "actions": [{ "action": "rename_project", "data": { "oldName": "api", "newName": "api1" } }],
  "reply": "Project renamed from 'api' to 'api1'."
}

User: set activity type of task openkey to continuous in cpp
{
  "actions": [{ "action": "update_task", "data": { "title": "openkey", "activityType": "continuous", "language": "cpp" } }],
  "reply": "Task 'openkey' activity type set to 'continuous' in cpp."
}

User: view all tasks of jhon
{
  "actions": [{ "action": "show_user_day", "data": { "user": "jhon" } }],
  "reply": "Here are all tasks assigned to jhon."
}

User: filter tasks for jhon with activity type coding
{
  "actions": [{ "action": "show_user_day", "data": { "user": "jhon", "activityType": "coding" } }],
  "reply": "Here are all coding tasks assigned to jhon."
}
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

 
  router.post('/', async (req, res) => {

    const message = req.body.message
    if (!message) return res.json({ reply: 'Empty message' })
      console.log('Incoming message:', message)


    const ctx = getCtx(req)


    // frontend-controlled active project
    if (req.body.activeProjectId) {
      ctx.activeBoardId = req.body.activeProjectId
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
          .select('title priority progress bucketId')

        if (!tasks.length) {
          return res.json({
            reply: `No tasks are assigned to ${user.name}.`
          })
        }


        // 🔥 Convert tasks to readable chatbot text
      const LINE = '\u2028'   // Unicode line separator

      const taskLines = tasks.map((task, index) => {
        const bucket = task.bucketId?.title || 'No Bucket'
        const progress = task.progress.replace('_', ' ')

        return (
          `${index + 1}. ${task.title}${LINE}` +
          `Priority: ${task.priority}${LINE}` +
          `Progress: ${progress}${LINE}` +
          `Bucket: ${bucket}`
        )
      })

      return res.json({
        reply: `Here is all work assigned to ${user.name}:${LINE}${LINE}${taskLines.join(`${LINE}${LINE}`)}`
      })
      }


      /* ========== CREATE TASK (FULL) ========== */
      case 'create_task': {
        // Required: title, bucket
        // Optional: description, assignedTo, priority, progress, activityType, etaDays, startDate, dueDate, checklist
        const missing = [];
        if (!data.title) missing.push('title');
        if (!data.bucket) missing.push('bucket');

        // Ask for missing required fields
        if (missing.length) {
          responded = true;
          return res.json({
            reply: `Please provide: ${missing.join(', ')} to create a task.`
          });
        }

        const project = await Board.findById(ctx.activeBoardId);
        if (!project)
          return res.json({ reply: 'Please select a project first.' });

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
    return res.json({ reply: 'Please select a project first.' })
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
        if (!project)
          return res.json({ reply: 'Please select a project first.' })

        const bucket = await Bucket.findOne({
          title: new RegExp(`^${data.oldName}$`, 'i'),
          boardId: project._id
        })

        if (!bucket)
          return res.json({ reply: 'Bucket not found.' })

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
    finalReply = 'Please select a project first.'
    responded = true
    break
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

  task.title = normalize(data.newName)
  await task.save()

  finalReply = `Task renamed to "${task.title}".`
  responded = true
  break
}


        /* ==========s CREATE PROJECT ========== */
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
            responded = true
return res.json({ reply: 'Project not found.' })
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
            return res.json({
              reply: 'Active project is invalid. Please select a project.'
            })
          }

          await Bucket.create({
            title: data.title,
            boardId: project._id
          })

          return res.json({
            reply: `Bucket "${data.title}" added to project "${project.title}"`
          })
        }

            /* ========== ADD TASK ========== */
            case 'add_task': {
        if (!data.title || !data.bucket){
          responded = true
return res.json({ reply: ai.reply })
        }


        const project = await Board.findById(ctx.activeBoardId)
        if (!project)
          return res.json({ reply: 'Please select a project first.' })

        const bucket = await Bucket.findOne({
          title: new RegExp(`^${data.bucket}$`, 'i'),
          boardId: project._id
        })
        if (!bucket)
          return res.json({ reply: 'Bucket not found in the active project.' })

        // 🧠 resolve users
        let assignedIds = []
        if (data.assignedTo?.length) {
          const { users, missing } = await resolveUsersByNames(data.assignedTo)
          if (missing.length) {
            return res.json({
              reply: `User(s) ${missing.join(', ')} do not exist. Should I create them?`
            })
          }
          assignedIds = users
        }

    // 🧠 validate enums dynamically
    const priorityEnum = enumFromSchema(Task.schema, 'priority')
    const progressEnum = enumFromSchema(Task.schema, 'progress')

    const taskData = {
      title: normalize(data.title),
      bucketId: bucket._id,
      description: normalize(data.description || ''),
      assignedTo: assignedIds,
      labels: data.labels || [],
      priority: priorityEnum.includes(data.priority)
        ? data.priority
        : undefined,
      progress: progressEnum.includes(data.progress)
        ? data.progress
        : undefined,
      repeat: data.repeat,
      estimatedDays: data.estimatedDays,
      activityType: data.activityType
    }

    // 🗓 date handling (reusing utils)
    if (data.startDate)
      taskData.startDate = expandUserDay(data.startDate)

    if (data.dueDate)
      taskData.dueDate = expandUserDay(data.dueDate)

    const task = await Task.create(taskData)

    return res.json({
      reply: `Task "${task.title}" added to project "${project.title}".`
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
          return res.json({ reply: ai.reply });

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
return res.json({ reply: ai.reply })
}

        }

        /* ========== UNDO ========== */
        case 'undo': {
          if (!ctx.lastDeleted)
            return res.json({ reply: 'Nothing to undo.' })

          await ctx.lastDeleted.model.create(ctx.lastDeleted.data)
          ctx.lastDeleted = null

          return res.json({ reply: 'Undo successful ✅' })
        }

        /* ========== SHOW PROJECTS ========== */
        case 'show_projects': {
          const projects = await Board.find().sort({ createdAt: -1 })
          ctx.lastResult = projects;
          responded = true;
          return res.json({ reply: ai.reply });
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

    // reply stays generic; frontend reads ctx.lastResult
    break
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

    ctx.lastResult = tasks
    finalReply = ai.reply || `Here is ${user.name}'s schedule.`
    break
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
    finalReply = ai.reply || 'Here are today’s tasks.'
    break
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
    finalReply = ai.reply || 'Here are tomorrow’s tasks.'
    break
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




