import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import SOTInventoryTable from './SOTInventoryTable';

const LeftPanel = () => {
  const { leftPaneWidth, setLeftPaneWidth, leftPaneCollapsed, setLeftPaneCollapsed } = useInventory();
  const [isResizing, setIsResizing] = useState(false);
  const leftPaneRef = React.useRef(null);
  const resizeRef = React.useRef(null);

  const handleResizeStart = (e) => {
    setIsResizing(true);
    e.preventDefault();
  };

  React.useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizing) {
        const newWidth = Math.max(200, Math.min(600, e.clientX));
        setLeftPaneWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, setLeftPaneWidth]);

  const handleToggleCollapse = () => {
    setLeftPaneCollapsed(!leftPaneCollapsed);
  };

  const buttonLeft = leftPaneCollapsed ? 40 : leftPaneWidth;

  if (leftPaneCollapsed) {
    return (
      <>
        <div className="left-pane collapsed" ref={leftPaneRef}></div>
        <button
          className="collapse-button collapse-button-right"
          onClick={handleToggleCollapse}
          title="SOT Inventory Table"
          style={{ left: `${buttonLeft}px` }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </>
    );
  }

  return (
    <>
      <div className="left-pane" ref={leftPaneRef} style={{ width: `${leftPaneWidth}px` }}>
        <div
          ref={resizeRef}
          className={`left-pane-resize ${isResizing ? 'dragging' : ''}`}
          onMouseDown={handleResizeStart}
        />
        <SOTInventoryTable />
      </div>
      <button
        className="collapse-button collapse-button-right"
        onClick={handleToggleCollapse}
        title="Collapse SOT Inventory Table"
        style={{ left: `${buttonLeft}px` }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </>
  );
};

export default LeftPanel;




