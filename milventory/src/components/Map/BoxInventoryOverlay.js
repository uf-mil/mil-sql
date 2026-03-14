import React, { useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { escapeHtml } from '../../utils';

const BoxInventoryOverlay = () => {
  const { selectedBox, inventoryData, addModeItem, setMasterFilterLocation } = useInventory();
  
  const boxData = selectedBox ? inventoryData.get(selectedBox) : null;
  const inventory = boxData ? boxData.inventory : [];
  const isFileCabinet = selectedBox && selectedBox.startsWith('Tall Cabinet');

  const SHELF_NAMES = [
    'Shelf 6 (Top)',
    'Shelf 5',
    'Shelf 4',
    'Shelf 3',
    'Shelf 2',
    'Shelf 1 (Bottom)'
  ];

  // Group inventory items by shelf for file cabinets
  const shelves = useMemo(() => {
    if (!isFileCabinet) {
      return null;
    }
    
    return SHELF_NAMES.map((name, shelfNum) => {
      const items = inventory.filter(item => (item.shelf ?? 0) === shelfNum);
      return { name, shelfNum, items };
    });
  }, [inventory, isFileCabinet]);

  if (!selectedBox || !boxData || addModeItem) return null;

  // Position overlay to the right of the box with some padding
  const overlayX = boxData.x + boxData.width + 10;
  const overlayY = boxData.y;
  const overlayWidth = 250;
  const maxHeight = 400;

  if (isFileCabinet && shelves) {
    // Render shelves for Tall Cabinet
    return (
      <g className="box-inventory-overlay" transform={`translate(${overlayX}, ${overlayY})`}>
        <foreignObject width={overlayWidth} height={maxHeight} x="0" y="0">
          <div className="box-inventory-table" xmlns="http://www.w3.org/1999/xhtml">
            <div className="box-inventory-header">
              <h4>{selectedBox}</h4>
            </div>
            <button
              onClick={() => setMasterFilterLocation(selectedBox)}
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Master Filter
            </button>
            <div className="box-inventory-content">
              {shelves.map((shelf, idx) => (
                shelf.items.length > 0 && (
                  <div key={idx} className="box-inventory-shelf">
                    <div className="box-inventory-shelf-name">{shelf.name}</div>
                    <table className="box-inventory-mini-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th className="qty-cell">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shelf.items.length === 0 ? (
                          <tr>
                            <td colSpan="2" className="box-inventory-empty">Empty</td>
                          </tr>
                        ) : (
                          shelf.items.map((item, itemIdx) => (
                            <tr key={itemIdx}>
                              <td className="name-cell">{escapeHtml(item.name)}</td>
                              <td className="qty-cell">{escapeHtml(String(item.qty))}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              ))}
              {shelves.every(shelf => shelf.items.length === 0) && (
                <div className="box-inventory-empty">Empty</div>
              )}
            </div>
          </div>
        </foreignObject>
      </g>
    );
  }

  // Regular box - single table
  return (
    <g className="box-inventory-overlay" transform={`translate(${overlayX}, ${overlayY})`}>
      <foreignObject width={overlayWidth} height={maxHeight} x="0" y="0">
        <div className="box-inventory-table" xmlns="http://www.w3.org/1999/xhtml">
          <div className="box-inventory-header">
            <h4>{selectedBox}</h4>
          </div>
          <button
            onClick={() => setMasterFilterLocation(selectedBox)}
            style={{
              width: '100%',
              padding: '0.5rem',
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Master Filter
          </button>
          <div className="box-inventory-content">
            <table className="box-inventory-mini-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="qty-cell">Qty</th>
                </tr>
              </thead>
              <tbody>
                {inventory.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="box-inventory-empty">Empty</td>
                  </tr>
                ) : (
                  inventory.map((item, idx) => (
                    <tr key={idx}>
                      <td className="name-cell">{escapeHtml(item.name)}</td>
                      <td className="qty-cell">{escapeHtml(String(item.qty))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </foreignObject>
    </g>
  );
};

export default BoxInventoryOverlay;

