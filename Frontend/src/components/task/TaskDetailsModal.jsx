import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Textarea from '../common/Textarea';
import MemberPicker from '../members/MemberPicker';
import AvatarGroup from '../common/AvatarGroup';
import { uploadsAPI } from '../../services/api';
import { getProgressLabel, getProgressColor } from '../../utils/helpers';

const TaskDetailsModal = ({ isOpen, onClose, task, users, onUpdate, onDelete }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: [],
    priority: 'medium',
    progress: 'not_started',
    startDate: '',
    dueDate: '',
    checklist: [],
    attachments: [],
    completed: false,
  });
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (task) {
      // Populate assigned users with full user objects
      const populatedAssignedTo = (task.assignedTo || []).map(userId => {
        if (typeof userId === 'string') {
          return users.find(u => u._id === userId) || { _id: userId, name: 'Unknown' };
        }
        return userId;
      }).filter(Boolean);

      setFormData({
        title: task.title || '',
        description: task.description || '',
        assignedTo: populatedAssignedTo,
        priority: task.priority || 'medium',
        progress: task.progress || 'not_started',
        startDate: task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : '',
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        checklist: task.checklist || [],
        attachments: task.attachments || [],
        completed: task.completed || false,
      });
    }
  }, [task, users]);

  const handleSave = async () => {
    try {
      await onUpdate(task._id, {
        ...formData,
        assignedTo: formData.assignedTo.map(u => u._id),
        startDate: formData.startDate || undefined,
        dueDate: formData.dueDate || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDelete = async () => {
    if (confirm('Delete this task?')) {
      try {
        await onDelete(task._id);
        onClose();
      } catch (err) {
        console.error('Failed to delete task:', err);
      }
    }
  };

  const handleAddChecklistItem = (e) => {
    e.preventDefault();
    if (!newChecklistItem.trim()) return;
    setFormData({
      ...formData,
      checklist: [...formData.checklist, { text: newChecklistItem.trim(), done: false }],
    });
    setNewChecklistItem('');
  };

  const toggleChecklistItem = (index) => {
    const updated = [...formData.checklist];
    updated[index].done = !updated[index].done;
    setFormData({ ...formData, checklist: updated });
  };

  const removeChecklistItem = (index) => {
    setFormData({
      ...formData,
      checklist: formData.checklist.filter((_, i) => i !== index),
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadedFile = await uploadsAPI.upload(file);
      setFormData({
        ...formData,
        attachments: [...formData.attachments, uploadedFile],
      });
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter((_, i) => i !== index),
    });
  };

  if (!task) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Task Details" size="lg">
      <div className="p-6 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Task name"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Add a description..."
            rows={4}
          />
        </div>

        {/* Assigned Members */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
          <div className="flex items-center gap-3">
            <MemberPicker
              users={users}
              selectedUsers={formData.assignedTo}
              onChange={(selected) => setFormData({ ...formData, assignedTo: selected })}
            />
            {formData.assignedTo.length > 0 && (
              <AvatarGroup users={formData.assignedTo} max={5} />
            )}
          </div>
        </div>

        {/* Priority & Progress */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Progress</label>
            <select
              value={formData.progress}
              onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <Input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <Input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            />
          </div>
        </div>

        {/* Checklist */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Checklist</label>
          <div className="space-y-2">
            {formData.checklist.map((item, index) => (
              <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleChecklistItem(index)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className={`flex-1 text-sm ${item.done ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                  {item.text}
                </span>
                <button
                  type="button"
                  onClick={() => removeChecklistItem(index)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <form onSubmit={handleAddChecklistItem} className="flex gap-2">
              <Input
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="Add checklist item"
                className="flex-1"
              />
              <Button type="submit" size="sm">Add</Button>
            </form>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Attachments</label>
          <div className="space-y-2">
            {formData.attachments.map((attachment, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{attachment.name}</div>
                    <div className="text-xs text-gray-500">{attachment.size}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            <label className="block">
              <input
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 transition-colors">
                {uploading ? (
                  <span className="text-sm text-gray-500">Uploading...</span>
                ) : (
                  <span className="text-sm text-gray-600">Click to upload file</span>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Completed Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.completed}
            onChange={(e) => setFormData({ ...formData, completed: e.target.checked })}
            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <label className="text-sm font-medium text-gray-700">Mark as completed</label>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-gray-200">
          <Button onClick={handleDelete} variant="danger">
            Delete Task
          </Button>
          <div className="flex gap-3">
            <Button onClick={onClose} variant="secondary">
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TaskDetailsModal;
