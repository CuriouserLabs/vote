import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { useUser } from '../contexts/UserContext';
import './HomePage.css';

export default function HomePage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  const createSession = () => {
    const id = nanoid(8);
    const path = selectedMode === 'poker' ? `/room/${id}` : `/retro/${id}`;
    navigate(path);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    const input = joinCode.trim();
    if (!input) return;

    const match = input.match(/\/(room|retro)\/([a-zA-Z0-9_-]{8,})/);
    if (match) {
      navigate(`/${match[1]}/${match[2]}`);
      return;
    }

    if (input.length < 6) {
      setJoinError('Invalid code. Please check the link and try again.');
      return;
    }

    const path = selectedMode === 'poker' ? `/room/${input}` : `/retro/${input}`;
    navigate(path);
  };

  const resetMode = () => {
    setSelectedMode(null);
    setJoinCode('');
    setJoinError('');
  };

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1>Plan smarter,<br />ship faster.</h1>
        <p className="home-tagline">
          Real-time collaboration for agile teams — no logins, no setup, just paste a link.
        </p>
      </div>

      {!selectedMode ? (
        <div className="mode-selector">
          <button className="mode-card mode-poker" onClick={() => setSelectedMode('poker')}>
            <div className="mode-icon">&#9827;</div>
            <h2>Sprint Poker</h2>
            <p>Estimate story points together with your team in real time.</p>
          </button>

          <button className="mode-card mode-retro" onClick={() => setSelectedMode('retro')}>
            <div className="mode-icon">&#128260;</div>
            <h2>Retro Board</h2>
            <p>Reflect on your sprint — what went well, what to improve.</p>
          </button>
        </div>
      ) : (
        <div className="session-actions">
          <button className="back-to-modes" onClick={resetMode}>
            ← Back
          </button>

          <div className="session-mode-badge" data-mode={selectedMode}>
            {selectedMode === 'poker' ? '♣ Sprint Poker' : '🔄 Retro Board'}
          </div>

          <div className="home-actions">
            <div className="action-card create-card">
              <div className="action-icon">{selectedMode === 'poker' ? '♣' : '🔄'}</div>
              <h2>{selectedMode === 'poker' ? 'Create a Room' : 'Create a Retro'}</h2>
              <p>
                {selectedMode === 'poker'
                  ? 'Start a new planning session and share the link with your team.'
                  : 'Start a new retrospective and invite your team to reflect.'}
              </p>
              <button className="btn-primary" onClick={createSession}>
                {selectedMode === 'poker' ? 'Create Room' : 'Create Retro'}
              </button>
            </div>

            <div className="action-divider">or</div>

            <div className="action-card join-card">
              <div className="action-icon">&#128279;</div>
              <h2>Join a Session</h2>
              <p>Paste a session link or code to join an existing session.</p>
              <form onSubmit={handleJoin}>
                <input
                  type="text"
                  placeholder="Paste session link or code"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value);
                    setJoinError('');
                  }}
                />
                {joinError && <p className="join-error">{joinError}</p>}
                <button className="btn-secondary" type="submit" disabled={!joinCode.trim()}>
                  Join Session
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="home-footer-tip">
        Signed in as <strong>{user.displayName}</strong> · Not you? Click your name in the header to change it.
      </div>
    </div>
  );
}
