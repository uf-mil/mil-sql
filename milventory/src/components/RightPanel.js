import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import InventoryTable from './InventoryTable';

const RightPanel = () => {
  const { selectedBox, rightTabWidth, setRightTabWidth, rightPaneCollapsed, setRightPaneCollapsed } = useInventory();
  const [isResizingRightTab, setIsResizingRightTab] = useState(false);
  const rightTabRef = React.useRef(null);
  const rightTabResizeRef = React.useRef(null);

  const handleRightTabResizeStart = (e) => {
    setIsResizingRightTab(true);
    e.preventDefault();
  };

  React.useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingRightTab) {
        const startX = rightTabResizeRef.current?.getBoundingClientRect().left || 0;
        const diff = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(800, rightTabWidth + diff));
        setRightTabWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingRightTab(false);
    };

    if (isResizingRightTab) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingRightTab, rightTabWidth, setRightTabWidth]);

  const handleToggleCollapse = () => {
    setRightPaneCollapsed(!rightPaneCollapsed);
  };

  // Calculate button position - right edge of the right pane
  const buttonRight = rightPaneCollapsed ? 40 : rightTabWidth;

  if (rightPaneCollapsed) {
    return (
      <>
        <div className="right-tab collapsed" ref={rightTabRef}></div>
        <button
          className="collapse-button collapse-button-left"
          onClick={handleToggleCollapse}
          title="Inventory Details"
          style={{ right: `${buttonRight}px` }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </>
    );
  }

  return (
    <>
      <div className="right-tab" ref={rightTabRef} style={{ width: `${rightTabWidth}px` }}>
        <div
          ref={rightTabResizeRef}
          className={`right-tab-resize ${isResizingRightTab ? 'dragging' : ''}`}
          onMouseDown={handleRightTabResizeStart}
        />
        <h2>{selectedBox || 'Select an item'}</h2>
        <div className="pane-inventory">
          {selectedBox ? (
            <InventoryTable />
          ) : (
            <div className="inventory-list empty">Click on any inventory box to view its contents.</div>
          )}
        </div>
      </div>
      <button
        className="collapse-button collapse-button-left"
        onClick={handleToggleCollapse}
        title="Collapse Inventory Details"
        style={{ right: `${buttonRight}px` }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </>
  );
};

export default RightPanel;

