// In-memory seed data and helpers for the Planner backend
const id = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`

const users = [
  { id: 'u-1', name: 'Alice Johnson', initials: 'AJ', color: 'bg-blue-500' },
  { id: 'u-2', name: 'Bob Martin', initials: 'BM', color: 'bg-green-500' },
  { id: 'u-3', name: 'Clara Lee', initials: 'CL', color: 'bg-purple-500' }
]

const labels = [
  { id: 'l-1', name: 'Frontend', color: 'bg-indigo-300' },
  { id: 'l-2', name: 'Backend', color: 'bg-amber-300' },
  { id: 'l-3', name: 'Bug', color: 'bg-red-300' }
]

const buckets = [
  {
    id: id('b-'),
    title: 'To do',
    tasks: [
      {
        id: id('t-'),
        title: 'Example task',
        description: 'This is a sample task from the backend',
        due: '',
        start: '',
        completed: false,
        assigned: ['u-1'],
        labels: ['l-1'],
        priority: 'Medium',
        progress: 'Not Started',
        repeat: 'Does not repeat',
        notes: '',
        checklist: [ { id: id('c-'), text: 'First item', done: false } ],
        attachments: [ ] ,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  { id: id('b-'), title: 'In progress', tasks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: id('b-'), title: 'Done', tasks: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
]

module.exports = {
  id,
  users,
  labels,
  buckets
}
