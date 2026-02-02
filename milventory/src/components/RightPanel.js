import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import EditForm from './EditForm';
import InventoryTable from './InventoryTable';

const RightPanel = () => {
  const { selectedBox, rightTabWidth, setRightTabWidth } = useInventory();
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

  return (
    <div className="right-tab" ref={rightTabRef}>
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
      <EditForm />
    </div>
  );
};

export default RightPanel;

