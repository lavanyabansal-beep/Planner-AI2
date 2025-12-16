import { useState, useEffect } from 'react';
import { boardsAPI } from '../services/api';
import BoardView from '../components/board/BoardView';
import TaskDetailsModal from '../components/task/TaskDetailsModal';
import AddMemberModal from '../components/members/AddMemberModal';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';
import useBoard from '../hooks/useBoard';

const Home = () => {
  const [boards, setBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState(null);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);

  const {
    board,
    buckets,
    tasks,
    users,
    loading,
    error,
    createBucket,
    updateBucket,
    deleteBucket,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    getTasksByBucket,
    refetch,
  } = useBoard(selectedBoardId);

  // Fetch all boards
  useEffect(() => {
    const fetchBoards = async () => {
      try {
        const data = await boardsAPI.getAll();
        setBoards(data);
        if (data.length > 0 && !selectedBoardId) {
          setSelectedBoardId(data[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch boards:', err);
      } finally {
        setLoadingBoards(false);
      }
    };

    fetchBoards();
  }, []);

  const handleTaskClick = (task) => {
    setSelectedTask(task);
  };

  const handleMemberAdded = () => {
    refetch();
  };

  if (loadingBoards) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">No boards found</h2>
          <p className="text-gray-600">Create a board to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold text-gray-900">Planner AI</h1>
              
              {/* Board Selector */}
              <select
                value={selectedBoardId || ''}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 font-medium"
              >
                {boards.map(b => (
                  <option key={b._id} value={b._id}>{b.title}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => setShowAddMember(true)} variant="secondary" size="sm">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Add Member
                </div>
              </Button>
              
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">{users.length} members</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={refetch}>Retry</Button>
            </div>
          </div>
        ) : (
          <BoardView
            buckets={buckets}
            tasks={tasks}
            onCreateBucket={createBucket}
            onUpdateBucket={updateBucket}
            onDeleteBucket={deleteBucket}
            onCreateTask={createTask}
            onMoveTask={moveTask}
            onTaskClick={handleTaskClick}
            getTasksByBucket={getTasksByBucket}
          />
        )}
      </main>

      {/* Modals */}
      <TaskDetailsModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
        users={users}
        onUpdate={updateTask}
        onDelete={deleteTask}
      />

      <AddMemberModal
        isOpen={showAddMember}
        onClose={() => setShowAddMember(false)}
        onMemberAdded={handleMemberAdded}
      />
    </div>
  );
};

export default Home;
