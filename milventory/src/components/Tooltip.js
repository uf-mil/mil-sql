import React from 'react';
import { useInventory } from '../context/InventoryContext';

const Tooltip = () => {
  const { tooltip, wrapRef } = useInventory();
  
  if (!tooltip.visible || !wrapRef.current) return null;

  const style = {
    left: `${tooltip.x}px`,
    top: `${tooltip.y}px`,
  };

  return (
    <div className="tooltip visible" style={style} role="tooltip">
      <span>{tooltip.title}</span>
    </div>
  );
};

export default Tooltip;

