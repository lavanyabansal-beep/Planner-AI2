import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import AvatarGroup from '../common/AvatarGroup';
import { formatDate, getPriorityColorDark, getProgressLabel } from '../../utils/helpers';

const BucketDetailsModal = ({ isOpen, onClose, bucket, tasks, users, onUpdate, onDelete, onTaskClick, onUpdateTask }) => {
  const [formData, setFormData] = useState({
    title: bucket?.title || '',
  });
  const [isEditing, setIsEditing] = useState(false);

  if (!bucket) return null;

  const handleSave = async () => {
    try {
      await onUpdate(bucket._id, {
        title: formData.title.trim(),
      });
      setIsEditing(false);
      onClose();
    } catch (err) {
      console.error('Failed to update bucket:', err);
    }
  };

  const handleDelete = async () => {
    if (tasks.length > 0) {
      if (!confirm(`Delete "${bucket.title}" and all ${tasks.length} tasks inside?`)) {
        return;
      }
    }
    try {
      await onDelete(bucket._id);
      onClose();
    } catch (err) {
      console.error('Failed to delete bucket:', err);
    }
  };

  // Calculate statistics
  const completedTasks = tasks.filter(t => t.completed).length;
  const inProgressTasks = tasks.filter(t => t.progress === 'in_progress').length;
  const notStartedTasks = tasks.filter(t => t.progress === 'not_started').length;

  const populateAssignedTo = (task) => (task.assignedTo || []).map(userId => {
    if (typeof userId === 'string') {
      return users.find(u => u._id === userId) || { _id: userId, name: 'Unknown' };
    }
    return userId;
  }).filter(Boolean);

  const getMemberNames = (task) => populateAssignedTo(task)
    .map(u => (u?.name || 'Unknown'))
    .filter(Boolean)
    .join(', ');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bucket Details" size="xl">
      <div className="p-6 space-y-6">
        {/* Bucket Name */}
        <div>
          <Input
            label="Bucket Name"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Enter bucket name"
            required
            disabled={!isEditing}
            className="bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
          />
        </div>

        {/* Statistics */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="font-semibold text-white">Statistics</h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary-400">{tasks.length}</div>
              <div className="text-xs text-gray-400 mt-1">Total Tasks</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-success-400">{completedTasks}</div>
              <div className="text-xs text-gray-400 mt-1">Completed</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">{inProgressTasks}</div>
              <div className="text-xs text-gray-400 mt-1">In Progress</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-400">{notStartedTasks}</div>
              <div className="text-xs text-gray-400 mt-1">Not Started</div>
            </div>
          </div>
        </div>

        {/* Created Date */}
        {bucket.createdAt && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <span className="text-sm text-gray-400">Created: </span>
                <span className="text-sm text-white font-medium">{formatDate(bucket.createdAt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List */}
        <div>
          <label className="form-label">Tasks ({tasks.length})</label>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-900/30 rounded-lg border border-gray-700">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">No tasks yet</p>
              </div>
            ) : (
              tasks.map(task => {
                const assignedUsers = populateAssignedTo(task);
                const memberNames = getMemberNames(task);
                const hasChecklist = task.checklist && task.checklist.length > 0;
                const completedChecklist = task.checklist?.filter(item => item.done).length || 0;
                const totalChecklist = task.checklist?.length || 0;
                const hasAttachments = task.attachments && task.attachments.length > 0;

                return (
                  <div
                    key={task._id}
                    className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-all cursor-pointer"
                    onClick={() => {
                      onClose();
                      onTaskClick(task);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClose();
                        onTaskClick(task);
                      }
                    }}
                  >
                    {/* Task Header */}
                    <div className="p-4 bg-gradient-to-b from-gray-700/30 to-transparent border-b border-gray-700/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-2 mb-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${getPriorityColorDark(task.priority || 'medium')}`}>
                              {(task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                              task.progress === 'completed' 
                                ? 'bg-success-500/20 text-success-300 border-success-500/30'
                                : task.progress === 'in_progress'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : 'bg-gray-600/50 text-gray-300 border-gray-600'
                            }`}>
                              {getProgressLabel(task.progress)}
                            </span>
                            {task.completed && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-success-500/20 text-success-300 border border-success-500/30">
                                ✓ Completed
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-semibold text-white break-words leading-snug">
                            {task.title}
                          </h3>
                        </div>
                      </div>
                    </div>

                    {/* Task Body */}
                    <div className="p-4 space-y-4">
                      {/* Description */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                          Description
                        </label>
                        {task.description ? (
                          <p className="text-sm text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                            {task.description}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">No description provided</p>
                        )}
                      </div>

                      {/* Meta Information */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Activity Type & ETA */}
                        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              Activity Type
                            </label>
                          </div>
                          <p className="text-sm font-medium text-gray-200">
                            {task.activityType || 'ONE_TIME'}
                          </p>
                          {task.estimatedDays > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              Estimated: <span className="font-semibold text-primary-300">{task.estimatedDays} days</span>
                            </p>
                          )}
                        </div>

                        {/* Dates */}
                        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              Timeline
                            </label>
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm">
                              <span className="text-gray-400">Start:</span>{' '}
                              <span className="font-medium text-gray-200">
                                {task.startDate ? formatDate(task.startDate) : 'Not set'}
                              </span>
                            </div>
                            <div className="text-sm">
                              <span className="text-gray-400">Due:</span>{' '}
                              <span className="font-medium text-gray-200">
                                {task.dueDate ? formatDate(task.dueDate) : 'Not set'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Checklist */}
                      {hasChecklist && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            Checklist ({completedChecklist}/{totalChecklist})
                          </label>
                          <div className="space-y-2">
                            {task.checklist.map((item, idx) => (
                              <div 
                                key={idx} 
                                className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  readOnly
                                  className="w-4 h-4 text-primary-600 bg-gray-800 border-gray-600 rounded focus:ring-primary-500 cursor-pointer"
                                  aria-label={`${item.text} - ${item.done ? 'completed' : 'not completed'}`}
                                />
                                <span className={`flex-1 text-sm ${item.done ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                  {item.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Attachments */}
                      {hasAttachments && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            Attachments ({task.attachments.length})
                          </label>
                          <div className="space-y-2">
                            {task.attachments.map((att, idx) => (
                              <a
                                key={idx}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700 hover:bg-gray-900/70 hover:border-primary-500/50 transition-all group"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex-shrink-0 w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center border border-primary-500/30 group-hover:bg-primary-500/30 transition-colors">
                                  <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-200 truncate group-hover:text-primary-300 transition-colors">
                                    {att.name}
                                  </div>
                                  {att.size && (
                                    <div className="text-xs text-gray-500">{att.size}</div>
                                  )}
                                </div>
                                <svg className="w-5 h-5 text-gray-500 group-hover:text-primary-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Assigned Members */}
                      <div className="pt-3 border-t border-gray-700">
                        <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                          Assigned To
                        </label>
                        {assignedUsers.length > 0 ? (
                          <div className="flex items-center gap-3">
                            <AvatarGroup users={assignedUsers} size="sm" max={8} />
                            <div className="text-sm text-gray-300" title={memberNames}>
                              {memberNames}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 italic">No assignees</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t border-gray-700">
          <Button onClick={handleDelete} variant="danger" fullWidth className="sm:w-auto">
            Delete Bucket
          </Button>
          <div className="flex gap-3">
            {isEditing ? (
              <>
                <Button 
                  onClick={() => {
                    setFormData({
                      title: bucket.title,
                    });
                    setIsEditing(false);
                  }} 
                  variant="secondary" 
                  fullWidth 
                  className="sm:w-auto"
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} variant="primary" fullWidth className="sm:w-auto">
                  Save Changes
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)} variant="primary" fullWidth className="sm:w-auto">
                Edit Bucket
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BucketDetailsModal;
