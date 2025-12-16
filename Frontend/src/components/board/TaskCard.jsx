import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AvatarGroup from '../common/AvatarGroup';
import { formatDate, getPriorityColor } from '../../utils/helpers';

const TaskCard = ({ task, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id, data: { type: 'task', task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasChecklist = task.checklist && task.checklist.length > 0;
  const completedChecklist = task.checklist?.filter(item => item.done).length || 0;
  const totalChecklist = task.checklist?.length || 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-all duration-200 cursor-pointer group"
    >
      <div className="space-y-2">
        {/* Title */}
        <h4 className={`font-medium text-gray-900 ${task.completed ? 'line-through text-gray-500' : ''}`}>
          {task.title}
        </h4>

        {/* Meta Info */}
        <div className="flex flex-wrap gap-2 text-xs">
          {task.priority && task.priority !== 'medium' && (
            <span className={`px-2 py-1 rounded-full font-medium ${getPriorityColor(task.priority)}`}>
              {task.priority}
            </span>
          )}
          
          {task.dueDate && (
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(task.dueDate)}
            </span>
          )}

          {hasChecklist && (
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {completedChecklist}/{totalChecklist}
            </span>
          )}

          {task.attachments && task.attachments.length > 0 && (
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {task.attachments.length}
            </span>
          )}
        </div>

        {/* Assigned Users */}
        {task.assignedTo && task.assignedTo.length > 0 && (
          <div className="pt-1">
            <AvatarGroup users={task.assignedTo} size="sm" max={3} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
