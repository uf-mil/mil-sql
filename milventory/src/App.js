import React, { useState, useEffect } from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import MapComponent from './components/Map';
import LeftPanel from './components/LeftPanel';
import Tooltip from './components/Tooltip';
import AddModal from './components/AddModal';
import EditModal from './components/EditForm';
import AddModePreview from './components/AddModePreview';
import Login from './components/Login';
import ErrorToast from './components/ErrorToast';
import { auth } from './api';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication status on mount
    auth.getCurrentUser()
      .then((userData) => {
        setUser(userData);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    await auth.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <InventoryProvider>
      <AppContent user={user} onLogout={handleLogout} />
    </InventoryProvider>
  );
}

function AppContent({ user, onLogout }) {
  const { wrapRef, svgRef, isLoading, error, setError } = useInventory();

  // Handle 401 errors by logging out
  useEffect(() => {
    if (error && error.includes('Session expired')) {
      const timer = setTimeout(() => {
        onLogout();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [error, onLogout]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        color: 'var(--text)',
      }}>
        <div>Loading inventory data...</div>
      </div>
    );
  }

  return (
    <>
      <LeftPanel />
      <div className="wrap" ref={wrapRef}>
        <div className="titlebar">
          Zoom: <span className="kbd">wheel</span> · Pan: <span className="kbd">drag</span> · Hover for name · Click for details
          {user && (
            <span style={{ float: 'right', marginRight: '1rem' }}>
              Logged in as {user.first_name} {user.last_name} ({user.email})
              <button
                onClick={onLogout}
                style={{
                  marginLeft: '1rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Logout
              </button>
            </span>
          )}
        </div>
        <MapComponent ref={svgRef} />
        <Tooltip />
      </div>
      <AddModal />
      <EditModal />
      <AddModePreview />
      <ErrorToast error={error} onClose={() => setError(null)} />
    </>
  );
}

export default App;

