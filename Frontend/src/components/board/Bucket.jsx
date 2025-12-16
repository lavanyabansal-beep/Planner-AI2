import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskCard from './TaskCard';
import AddTaskButton from './AddTaskButton';
import Button from '../common/Button';
import Input from '../common/Input';

const Bucket = ({ bucket, tasks, onAddTask, onDeleteBucket, onUpdateBucket, onTaskClick }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(bucket.title);
  const [showMenu, setShowMenu] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bucket._id, data: { type: 'bucket' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleUpdateTitle = async () => {
    if (title.trim() && title !== bucket.title) {
      try {
        await onUpdateBucket(bucket._id, { title: title.trim() });
      } catch (err) {
        console.error('Failed to update bucket title:', err);
        setTitle(bucket.title);
      }
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (tasks.length > 0) {
      if (!confirm(`Delete "${bucket.title}" and all ${tasks.length} tasks inside?`)) {
        return;
      }
    }
    try {
      await onDeleteBucket(bucket._id);
    } catch (err) {
      console.error('Failed to delete bucket:', err);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex-shrink-0 w-80 bg-gray-50 rounded-xl border border-gray-200 flex flex-col max-h-full"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white rounded-t-xl">
        <div className="flex items-center justify-between gap-2">
          {isEditing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleUpdateTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdateTitle();
                if (e.key === 'Escape') {
                  setTitle(bucket.title);
                  setIsEditing(false);
                }
              }}
              autoFocus
              className="flex-1"
            />
          ) : (
            <>
              <button
                {...listeners}
                {...attributes}
                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
              </button>
              <h3
                className="flex-1 font-semibold text-gray-900 truncate cursor-pointer"
                onClick={() => setIsEditing(true)}
              >
                {bucket.title}
              </h3>
              <span className="text-sm text-gray-500 font-medium">{tasks.length}</span>
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          handleDelete();
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {tasks.map(task => (
          <TaskCard key={task._id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </div>

      {/* Add Task */}
      <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
        <AddTaskButton bucketId={bucket._id} onAdd={onAddTask} />
      </div>
    </div>
  );
};

export default Bucket;
