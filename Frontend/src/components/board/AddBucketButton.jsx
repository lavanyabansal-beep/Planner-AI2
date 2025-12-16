import { useState } from 'react';
import Button from '../common/Button';
import Input from '../common/Input';

const AddBucketButton = ({ onAdd }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onAdd(title.trim());
      setTitle('');
      setIsAdding(false);
    } catch (err) {
      console.error('Failed to add bucket:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setTitle('');
    setIsAdding(false);
  };

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="flex-shrink-0 w-80 h-full min-h-[200px] bg-white/50 hover:bg-white/70 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-all duration-200 group"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-medium">Add Bucket</span>
        </div>
      </button>
    );
  }

  return (
    <div className="flex-shrink-0 w-80 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bucket name"
          autoFocus
          disabled={loading}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={loading || !title.trim()} size="sm" className="flex-1">
            Add
          </Button>
          <Button type="button" onClick={handleCancel} variant="secondary" size="sm" disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddBucketButton;
