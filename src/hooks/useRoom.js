import { useEffect, useRef, useState, useCallback } from 'react';
import Peer from 'peerjs';
import { roomPeerId, send, broadcast } from '../utils/peerUtils';

const INITIAL_STATE = (user) => ({
  participants: [{ id: user.id, displayName: user.displayName, isHost: true }],
  votes: {},
  revealed: false,
  round: 1,
  storyTitle: '',
  coHosts: [],
});

const MAX_RECONNECT = 4;

export function useRoom(roomId, user) {
  const peerRef = useRef(null);
  const roleRef = useRef(null);           // 'host' | 'client'
  const connsRef = useRef({});            // host: peerId→conn map
  const connRef = useRef(null);           // client: single conn to host
  const stateRef = useRef(null);
  const lastStateRef = useRef(null);      // client: last received state (for takeover)

  const [role, setRole] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [status, setStatus] = useState('connecting');

  const pushState = useCallback((next) => {
    stateRef.current = next;
    setRoomState(next);
    broadcast(connsRef.current, { type: 'state', payload: next });
  }, []);

  const updateState = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(stateRef.current) : updater;
    pushState(next);
  }, [pushState]);

  useEffect(() => {
    let destroyed = false;
    let reconnectAttempts = 0;

    // --- Shared host connection listener (reused on co-host takeover) ---
    function attachHostListeners(hostPeer) {
      hostPeer.on('connection', (conn) => {
        conn.on('open', () => {
          connsRef.current[conn.peer] = conn;
          send(conn, { type: 'state', payload: stateRef.current });
        });

        conn.on('data', (msg) => {
          if (msg.type === 'join') {
            updateState((prev) => {
              if (prev.participants.find((p) => p.id === msg.user.id)) return prev;
              return { ...prev, participants: [...prev.participants, msg.user] };
            });
          } else if (msg.type === 'vote') {
            updateState((prev) => ({
              ...prev,
              votes: { ...prev.votes, [msg.userId]: msg.value },
            }));
          } else if (msg.type === 'leave') {
            updateState((prev) => ({
              ...prev,
              participants: prev.participants.filter((p) => p.id !== msg.userId),
              votes: Object.fromEntries(
                Object.entries(prev.votes).filter(([k]) => k !== msg.userId)
              ),
            }));
          }
        });

        conn.on('close', () => {
          delete connsRef.current[conn.peer];
        });
      });
    }

    // --- Connect as client (used on first join and on reconnect) ---
    function connectAsClient() {
      if (destroyed) return;
      const clientPeer = new Peer();
      peerRef.current = clientPeer;

      clientPeer.on('open', () => {
        if (destroyed) return;
        const conn = clientPeer.connect(roomPeerId(roomId), { reliable: true });
        connRef.current = conn;

        conn.on('open', () => {
          if (destroyed) return;
          reconnectAttempts = 0;
          setStatus('connected');
          send(conn, {
            type: 'join',
            user: { id: user.id, displayName: user.displayName, isHost: false },
          });
        });

        conn.on('data', (msg) => {
          if (msg.type === 'state') {
            lastStateRef.current = msg.payload;
            setRoomState(msg.payload);
          }
        });

        conn.on('close', () => {
          if (destroyed) return;
          const lastState = lastStateRef.current;
          if (lastState?.coHosts?.includes(user.id)) {
            attemptHostTakeover(lastState);
          } else {
            scheduleReconnect();
          }
        });

        conn.on('error', () => { if (!destroyed) scheduleReconnect(); });
      });

      clientPeer.on('error', () => { if (!destroyed) scheduleReconnect(); });
    }

    // --- Retry connecting as a regular client ---
    function scheduleReconnect() {
      if (destroyed) return;
      reconnectAttempts++;
      if (reconnectAttempts > MAX_RECONNECT) {
        setStatus('disconnected');
        return;
      }
      setStatus('reconnecting');
      peerRef.current?.destroy();
      setTimeout(() => { if (!destroyed) connectAsClient(); }, 1500);
    }

    // --- Co-host claims the room peer ID after primary host disconnects ---
    function attemptHostTakeover(lastState) {
      if (destroyed) return;
      setStatus('connecting');
      peerRef.current?.destroy();

      const hostPeer = new Peer(roomPeerId(roomId));
      peerRef.current = hostPeer;

      hostPeer.on('open', () => {
        if (destroyed) return;
        roleRef.current = 'host';
        setRole('host');
        setStatus('ready');
        connsRef.current = {};
        connRef.current = null;
        // Restore last known state, marking self as host
        const nextState = {
          ...lastState,
          participants: lastState.participants.map((p) =>
            p.id === user.id ? { ...p, isHost: true } : p
          ),
        };
        stateRef.current = nextState;
        setRoomState(nextState);
        attachHostListeners(hostPeer);
      });

      hostPeer.on('error', () => {
        // Another co-host claimed it first — fall back to client
        if (!destroyed) connectAsClient();
      });
    }

    // --- Try to claim the host peer ID ---
    const peer = new Peer(roomPeerId(roomId));
    peerRef.current = peer;

    peer.on('open', () => {
      if (destroyed) return;
      roleRef.current = 'host';
      setRole('host');
      setStatus('ready');
      const initial = INITIAL_STATE(user);
      stateRef.current = initial;
      setRoomState(initial);
      attachHostListeners(peer);
    });

    peer.on('error', (err) => {
      if (destroyed) return;
      if (err.type === 'unavailable-id') {
        roleRef.current = 'client';
        setRole('client');
        setStatus('connecting');
        peer.destroy();
        connectAsClient();
      } else {
        setStatus('error');
      }
    });

    return () => {
      destroyed = true;
      if (connRef.current?.open) {
        send(connRef.current, { type: 'leave', userId: user.id });
      }
      peerRef.current?.destroy();
    };
  }, [roomId, user.id, user.displayName, updateState]);

  const submitVote = useCallback((value) => {
    if (roleRef.current === 'host') {
      updateState((prev) => ({
        ...prev,
        votes: { ...prev.votes, [user.id]: value },
      }));
    } else {
      send(connRef.current, { type: 'vote', userId: user.id, value });
    }
  }, [user.id, updateState]);

  const revealVotes = useCallback(() => {
    updateState((prev) => ({ ...prev, revealed: true }));
  }, [updateState]);

  const resetRound = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      votes: {},
      revealed: false,
      round: prev.round + 1,
    }));
  }, [updateState]);

  const setStoryTitle = useCallback((title) => {
    updateState((prev) => ({ ...prev, storyTitle: title }));
  }, [updateState]);

  const makeCoHost = useCallback((userId) => {
    updateState((prev) => {
      const coHosts = prev.coHosts || [];
      const already = coHosts.includes(userId);
      return {
        ...prev,
        coHosts: already ? coHosts.filter((id) => id !== userId) : [...coHosts, userId],
      };
    });
  }, [updateState]);

  return { roomState, status, role, submitVote, revealVotes, resetRound, setStoryTitle, makeCoHost };
}
