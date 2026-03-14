import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import MapComponent from './components/Map/Map';
import LeftPanel from './components/Layout/LeftPanel';
import Tooltip from './components/Map/Tooltip';
import AddModal from './components/Box/AddModal';
import EditModal from './components/Box/EditForm';
import AddModePreview from './components/Map/AddModePreview';
import Login from './components/Auth/Login';
import ErrorToast from './components/Common/ErrorToast';
import ConflictErrorModal from './components/Common/ConflictErrorModal';
import HistoryModal from './components/History/HistoryModal';
import AdminDashboard from './components/Admin/AdminDashboard';
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

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            !user ? (
              <Login onLoginSuccess={handleLoginSuccess} />
            ) : (
              <InventoryProvider>
                <AppContent user={user} onLogout={handleLogout} />
              </InventoryProvider>
            )
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireLeader={true}>
              <InventoryProvider>
                <AdminDashboard />
              </InventoryProvider>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// Protected Route component
function ProtectedRoute({ children, requireLeader = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    return <Navigate to="/" replace />;
  }

  if (requireLeader && !user.is_leader) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppContent({ user, onLogout }) {
  const { wrapRef, svgRef, isLoading, error, setError, conflictError, setConflictError } = useInventory();
  const navigate = useNavigate();
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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
              {user.is_leader && (
                <button
                  onClick={() => navigate('/admin')}
                  style={{
                    marginLeft: '1rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: 'var(--accent, #4a9eff)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                >
                  Admin Dashboard
                </button>
              )}
              <button
                onClick={() => setShowHistoryModal(true)}
                style={{
                  marginLeft: '1rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  background: 'rgba(0,0,0,.3)',
                  color: 'var(--text, #e6ebf4)',
                  border: '1px solid rgba(255,255,255,.15)',
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0,0,0,.3)';
                }}
              >
                View History
              </button>
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
      <ConflictErrorModal
        visible={conflictError !== null}
        errorType={conflictError?.type}
        message={conflictError?.message}
        supplyName={conflictError?.supplyName}
        onClose={() => setConflictError(null)}
        onRefresh={() => window.location.reload()}
      />
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
    </>
  );
}

export default App;

