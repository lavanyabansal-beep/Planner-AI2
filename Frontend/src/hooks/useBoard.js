import { useState, useEffect } from 'react';
import { boardsAPI, bucketsAPI, tasksAPI, usersAPI } from '../services/api';

const useBoard = (boardId) => {
  const [board, setBoard] = useState(null);
  const [buckets, setBuckets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all data for the board
  const fetchBoardData = async () => {
    if (!boardId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [boardsData, bucketsData, tasksData, usersData] = await Promise.all([
        boardsAPI.getAll(),
        bucketsAPI.getByBoard(boardId),
        tasksAPI.getAll(),
        usersAPI.getAll(),
      ]);

      const currentBoard = boardsData.find(b => b._id === boardId);
      setBoard(currentBoard);
      setBuckets(bucketsData);
      setTasks(tasksData.filter(t => bucketsData.some(b => b._id === t.bucketId)));
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching board data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoardData();
  }, [boardId]);

  // ===== BUCKET OPERATIONS =====
  const createBucket = async (title) => {
    try {
      const order = buckets.length;
      const newBucket = await bucketsAPI.create({ boardId, title, order });
      setBuckets([...buckets, newBucket]);
      return newBucket;
    } catch (err) {
      console.error('Error creating bucket:', err);
      throw err;
    }
  };

  const updateBucket = async (bucketId, updates) => {
    try {
      const updated = await bucketsAPI.update(bucketId, updates);
      setBuckets(buckets.map(b => b._id === bucketId ? updated : b));
      return updated;
    } catch (err) {
      console.error('Error updating bucket:', err);
      throw err;
    }
  };

  const deleteBucket = async (bucketId) => {
    try {
      await bucketsAPI.delete(bucketId);
      setBuckets(buckets.filter(b => b._id !== bucketId));
      // Remove tasks in this bucket
      setTasks(tasks.filter(t => t.bucketId !== bucketId));
    } catch (err) {
      console.error('Error deleting bucket:', err);
      throw err;
    }
  };

  // ===== TASK OPERATIONS =====
  const createTask = async (bucketId, taskData) => {
    try {
      const newTask = await tasksAPI.create(bucketId, taskData);
      setTasks([...tasks, newTask]);
      return newTask;
    } catch (err) {
      console.error('Error creating task:', err);
      throw err;
    }
  };

  const updateTask = async (taskId, updates) => {
    try {
      const updated = await tasksAPI.update(taskId, updates);
      setTasks(tasks.map(t => t._id === taskId ? updated : t));
      return updated;
    } catch (err) {
      console.error('Error updating task:', err);
      throw err;
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await tasksAPI.delete(taskId);
      setTasks(tasks.filter(t => t._id !== taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
      throw err;
    }
  };

  const moveTask = async (taskId, fromBucketId, toBucketId) => {
    try {
      // Optimistic update
      setTasks(tasks.map(t => 
        t._id === taskId ? { ...t, bucketId: toBucketId } : t
      ));

      await tasksAPI.move(taskId, fromBucketId, toBucketId);
    } catch (err) {
      console.error('Error moving task:', err);
      // Revert on error
      await fetchBoardData();
      throw err;
    }
  };

  const getTasksByBucket = (bucketId) => {
    return tasks.filter(t => t.bucketId === bucketId);
  };

  return {
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
    refetch: fetchBoardData,
  };
};

export default useBoard;
