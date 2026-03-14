import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Theme } from '@carbon/react';

import { auth, openEventStream } from './api';
import AppShell from './components/Layout/AppShell';
import Login from './components/Auth/Login';
import Dashboard from './components/Dashboard/Dashboard';
import PiDetail from './components/PiDetail/PiDetail';
import NotificationPanel from './components/Notifications/NotificationPanel';

// ─── Auth context ────────────────────────────────────────────────────────────

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ─── Notification context ─────────────────────────────────────────────────────

export const NotifContext = createContext(null);
export const useNotif = () => useContext(NotifContext);

// ─── Protected route ──────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifications, setNotifications]   = useState([]);
  const [unreadCount, setUnreadCount]        = useState(0);

  // Verify stored token on mount
  useEffect(() => {
    const token = localStorage.getItem('pi_fleet_token');
    if (!token) { setUser(null); return; }

    auth.verify()
      .then(({ username }) => setUser({ username }))
      .catch(() => { localStorage.removeItem('pi_fleet_token'); setUser(null); });
  }, []);

  // Open SSE event stream once authenticated
  useEffect(() => {
    if (!user) return;
    const es = openEventStream(
      notif => {
        setNotifications(prev => [notif, ...prev].slice(0, 100));
        setUnreadCount(c => c + 1);
      },
      () => {} // silently reconnect
    );
    return () => es.close();
  }, [user]);

  const login = async (username, password) => {
    const { token, username: u } = await auth.login(username, password);
    localStorage.setItem('pi_fleet_token', token);
    setUser({ username: u });
  };

  const logout = () => {
    auth.logout();
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
  };

  if (user === undefined) {
    // Still verifying token — render nothing (avoids flash)
    return null;
  }

  return (
    <Theme theme="g100">
      <AuthContext.Provider value={{ user, login, logout }}>
        <NotifContext.Provider value={{
          notifications, setNotifications,
          unreadCount, setUnreadCount,
          panelOpen: notifPanelOpen,
          openPanel:  () => setNotifPanelOpen(true),
          closePanel: () => setNotifPanelOpen(false),
        }}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={
                user ? <Navigate to="/" replace /> : <Login />
              } />
              <Route path="/*" element={
                <RequireAuth>
                  <AppShell>
                    <Routes>
                      <Route index element={<Navigate to="/dashboard" replace />} />
                      <Route path="dashboard" element={<Dashboard />} />
                      <Route path="pi/:id"    element={<PiDetail />} />
                      <Route path="*"         element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </AppShell>
                  {notifPanelOpen && <NotificationPanel />}
                </RequireAuth>
              } />
            </Routes>
          </BrowserRouter>
        </NotifContext.Provider>
      </AuthContext.Provider>
    </Theme>
  );
}
