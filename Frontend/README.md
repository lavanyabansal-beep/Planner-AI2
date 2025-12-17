# Planner AI - Frontend

Modern, production-ready React frontend for the Planner AI task management system.

## Tech Stack

- **Vite** - Fast build tool
- **React 18** - UI library (functional components)
- **Tailwind CSS** - Utility-first styling
- **@dnd-kit** - Drag and drop functionality
- **Axios** - HTTP client
- **date-fns** - Date utilities

## Features

✅ **Board Management** - View and switch between boards
✅ **Bucket Management** - Create, rename, delete, and reorder buckets
✅ **Task Management** - Full CRUD operations for tasks
✅ **Drag & Drop** - Intuitive task movement between buckets
✅ **Team Members** - Add members and assign to tasks
✅ **Task Details** - Complete task editor with:
- Description
- Assigned members
- Priority levels
- Progress tracking
- Start/due dates
- Checklist items
- File attachments
✅ **Real-time Sync** - All changes persist to MongoDB immediately
✅ **Error Handling** - Graceful error states and retry mechanisms
✅ **Responsive UI** - Modern, clean design inspired by Microsoft Teams Planner

## Project Structure

```
Frontend/
├── src/
│   ├── components/
│   │   ├── common/           # Reusable UI components
│   │   │   ├── Avatar.jsx
│   │   │   ├── AvatarGroup.jsx
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Spinner.jsx
│   │   │   └── Textarea.jsx
│   │   ├── board/            # Board-specific components
│   │   │   ├── AddBucketButton.jsx
│   │   │   ├── AddTaskButton.jsx
│   │   │   ├── BoardView.jsx
│   │   │   ├── Bucket.jsx
│   │   │   └── TaskCard.jsx
│   │   ├── members/          # Member management
│   │   │   ├── AddMemberModal.jsx
│   │   │   └── MemberPicker.jsx
│   │   └── task/             # Task components
│   │       └── TaskDetailsModal.jsx
│   ├── hooks/
│   │   └── useBoard.js       # Custom hook for board operations
│   ├── pages/
│   │   └── Home.jsx          # Main application page
│   ├── services/
│   │   └── api.js            # Centralized API service
│   ├── utils/
│   │   └── helpers.js        # Helper functions
│   ├── App.jsx               # Root component
│   ├── main.jsx              # Entry point
│   └── index.css             # Global styles
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## API Integration

The frontend integrates with the following backend endpoints:

### Users
- `GET /api/users` - Fetch all team members
- `POST /api/users` - Create new member

### Boards
- `GET /api/boards` - Fetch all boards
- `POST /api/boards` - Create board

### Buckets
- `GET /api/buckets?boardId={id}` - Fetch buckets for board
- `GET /api/boards/:boardId/buckets` - Alternative endpoint
- `POST /api/buckets` - Create bucket
- `PUT /api/buckets/:id` - Update bucket
- `DELETE /api/buckets/:id` - Delete bucket

### Tasks
- `GET /api/tasks?bucketId={id}` - Fetch tasks for bucket
- `GET /api/tasks/:id` - Fetch single task
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/move` - Move task between buckets

### Uploads
- `POST /api/uploads` - Upload file attachment

## Environment Variables

Create a `.env` file in the Frontend directory:

```env
VITE_API_URL=http://localhost:4000
```

## Installation & Setup

1. **Install dependencies:**
```bash
cd Frontend
npm install
```

2. **Start the development server:**
```bash
npm run dev
```

The application will run on `http://localhost:5174`

3. **Build for production:**
```bash
npm run build
```

4. **Preview production build:**
```bash
npm run preview
```

## Key Features Implementation

### Drag & Drop
Uses `@dnd-kit` for smooth drag and drop:
- Drag tasks between buckets
- Visual feedback during drag
- Automatic state updates
- Backend sync on drop

### State Management
Custom `useBoard` hook manages all board state:
- Centralized data fetching
- Optimistic updates
- Error handling
- Automatic refetch on errors

### API Service Layer
Centralized API service (`src/services/api.js`):
- Single source of truth for API calls
- Consistent error handling
- Type-safe responses
- Easy to maintain and extend

### UI/UX Principles
- **Modern Design** - Clean, professional aesthetic
- **Soft Colors** - Calming neutral palette with primary accent
- **Smooth Transitions** - All interactions feel fluid
- **Clear Hierarchy** - Visual weight guides user attention
- **Responsive Feedback** - Loading states, hover effects, success/error indicators
- **Accessibility** - Keyboard navigation, ARIA labels, focus management

## Component Architecture

### Reusable Components
All components follow functional component patterns with hooks:
- Clear prop interfaces
- Minimal side effects
- Single responsibility
- Composable design

### Data Flow
1. `Home.jsx` - Main container, manages global state
2. `useBoard` hook - Handles all board/bucket/task operations
3. Components - Receive data via props, emit events via callbacks
4. API service - All backend communication

## Development Notes

### No Local State for Backend Data
All data comes from MongoDB via the backend. No mock data or local-only state.

### Error Handling
- Network errors show user-friendly messages
- Failed operations can be retried
- Optimistic updates revert on failure
- Console errors for debugging

### Performance
- Lazy loading for modals
- Efficient re-renders via React
- Minimal bundle size
- Fast Vite HMR

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

When adding new features:
1. Create components in appropriate folders
2. Use existing common components
3. Follow existing patterns
4. Add error handling
5. Test with real backend data

## License

See parent directory LICENSE file.
