import React, { useState, useEffect } from 'react';
import './App.css';

interface Todo {
  id: number;
  text: string;
  category: string;
  completed: boolean;
}

interface Category {
  name: string;
  color: string;
}

const categories: Category[] = [
  { name: 'Work', color: '#ff9900' },
  { name: 'Personal', color: '#0099ff' },
  { name: 'Shopping', color: '#ff66cc' },
];

const App: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const storedTodos = localStorage.getItem('todos');
    if (storedTodos) {
      setTodos(JSON.parse(storedTodos));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  const handleAddTodo = () => {
    if (newTodo.trim() !== '') {
      const newTodoItem: Todo = {
        id: Date.now(),
        text: newTodo,
        category: newCategory,
        completed: false,
      };
      setTodos([...todos, newTodoItem]);
      setNewTodo('');
      setNewCategory('');
    }
  };

  const handleToggleCompleted = (id: number) => {
    const updatedTodos = todos.map((todo) => {
      if (todo.id === id) {
        return { ...todo, completed: !todo.completed };
      }
      return todo;
    });
    setTodos(updatedTodos);
  };

  const handleRemoveTodo = (id: number) => {
    const updatedTodos = todos.filter((todo) => todo.id !== id);
    setTodos(updatedTodos);
  };

  const handleDarkModeToggle = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <h1>Todo App</h1>
      <div className="todo-form">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="New todo"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        >
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.name} value={category.name}>
              {category.name}
            </option>
          ))}
        </select>
        <button onClick={handleAddTodo}>Add todo</button>
      </div>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <span
              style={{
                textDecoration: todo.completed ? 'line-through' : 'none',
                color: categories.find((c) => c.name === todo.category)?.color,
              }}
            >
              {todo.text}
            </span>
            <button onClick={() => handleToggleCompleted(todo.id)}>
              {todo.completed ? 'Uncomplete' : 'Complete'}
            </button>
            <button onClick={() => handleRemoveTodo(todo.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <button onClick={handleDarkModeToggle}>
        {darkMode ? 'Light mode' : 'Dark mode'}
      </button>
    </div>
  );
};

export default App;