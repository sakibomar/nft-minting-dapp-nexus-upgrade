/**
 * @file useSocket.js
 * @description Custom hook for Socket.io real-time event handling.
 */

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getSocketCandidates, rememberApiBase } from '../utils/api';

export default function useSocket(onEvent) {
  const socketRef = useRef(null);
  const callbackRef = useRef(onEvent);

  // Keep callback ref current
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const candidates = getSocketCandidates();
    const socketOptions = {
      path: import.meta.env.VITE_SOCKET_PATH || '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 4000,
    };
    let activeSocket = null;
    let disposed = false;
    let connected = false;

    const bindEvents = (socket) => {
      socket.on('nft:minted', (data) => callbackRef.current?.('nft:minted', data));
      socket.on('nft:burned', (data) => callbackRef.current?.('nft:burned', data));
      socket.on('nft:transfer', (data) => callbackRef.current?.('nft:transfer', data));

      socket.on('marketplace:listed', (data) => callbackRef.current?.('marketplace:listed', data));
      socket.on('marketplace:sale', (data) => callbackRef.current?.('marketplace:sale', data));
      socket.on('marketplace:bid', (data) => callbackRef.current?.('marketplace:bid', data));
      socket.on('marketplace:settled', (data) => callbackRef.current?.('marketplace:settled', data));
      socket.on('marketplace:cancelled', (data) => callbackRef.current?.('marketplace:cancelled', data));
      socket.on('marketplace:priceUpdated', (data) => callbackRef.current?.('marketplace:priceUpdated', data));

      socket.on('offer:made', (data) => callbackRef.current?.('offer:made', data));
      socket.on('offer:accepted', (data) => callbackRef.current?.('offer:accepted', data));
      socket.on('offer:cancelled', (data) => callbackRef.current?.('offer:cancelled', data));
    };

    const connectSocket = (index) => {
      if (disposed || index >= candidates.length) {
        return;
      }

      const target = candidates[index];
      const socket = io(target || undefined, socketOptions);
      activeSocket = socket;
      socketRef.current = socket;
      bindEvents(socket);

      socket.on('connect', () => {
        connected = true;
        rememberApiBase(target || '');
      });

      socket.on('connect_error', () => {
        if (disposed || connected || index >= candidates.length - 1) {
          return;
        }

        socket.disconnect();
        connectSocket(index + 1);
      });
    };

    connectSocket(0);

    return () => {
      disposed = true;
      connected = false;
      if (activeSocket) {
        activeSocket.disconnect();
      }
    };
  }, []);

  return socketRef;
}
