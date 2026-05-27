import { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import './LoginScreen.css';

export default function LoginScreen() {
  const { login } = useUser();
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim().length > 0) {
      login(name);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-icon">&#9830;</div>
        <h1>Scrum Suite</h1>
        <p className="login-subtitle">Plan, reflect, improve</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoFocus
          />
          <button type="submit" disabled={!name.trim()}>
            Get Started
          </button>
        </form>
      </div>
    </div>
  );
}
