// Script to generate inventory-locations.json
// Run with: node generate-locations.js > public/inventory-locations.json
// Or: node generate-locations.js (and redirect output manually)

const fs = require('fs');
const path = require('path');

// Inventory bounds configuration
const inventoryBounds = {
  "viewBox": {
    "x": 0,
    "y": 0,
    "width": 4000,
    "height": 4000
  },
  "room": {
    "x": 80,
    "y": 80,
    "width": 3600,
    "height": 3840,
    "rx": 18,
    "ry": 18
  }
};

// Configuration constants
const drawerSize = 150;
const drawerSpacing = 5;
const topStartX = 720;
const topY = 80;

// Top drawers A-K (11 drawers)
// Every 3rd drawer (C, F, I) is double width
const drawerLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
const topDrawers = [];
let currentX = topStartX;

drawerLabels.forEach((label, index) => {
  const isThird = (index + 1) % 3 === 0; // C, F, I (indices 2, 5, 8)
  const width = isThird ? drawerSize * 2 : drawerSize;
  
  topDrawers.push({
    title: `Drawer ${label}`,
    x: currentX,
    y: topY,
    width: width,
    height: drawerSize,
    fill: 'var(--drawer)',
    inventory: []
  });
  
  // Move X position for next drawer
  currentX += width + drawerSpacing;
});

// Top cabinets 1-4 (each is 2 drawers wide, positioned below drawers)
// 2 drawers of space between each cabinet
const cabinetWidth = drawerSize * 2 + drawerSpacing;
const cabinetHeight = drawerSize + drawerSpacing;
const cabinetSpacing = drawerSize * 2 + drawerSpacing*2; // 2 drawers of space between cabinets
const cabinetY = topY + drawerSize + 20;

const topCabinets = [];
let cabinetX = topStartX;
for (let i = 0; i < 4; i++) {
  topCabinets.push({
    title: `Cabinet ${i + 1}`,
    x: cabinetX,
    y: cabinetY,
    width: cabinetWidth,
    height: cabinetHeight,
    fill: 'var(--table)',
    inventory: []
  });
  // Move X position for next cabinet (cabinet width + 2 drawers of space)
  cabinetX += cabinetWidth + cabinetSpacing;
}

// Right side drawers L-AA
// Note: Drawer N is taller (height 205), which affects spacing
const rightX = 3500;
const rightDrawerLabels = ['L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA'];
const rightDrawers = [];
let rightYStart = 840;
let rightY = rightYStart; // Starting Y position

rightDrawerLabels.forEach((label, index) => {
  const height = label === 'N' ? 2*drawerSize + drawerSpacing : drawerSize; // Drawer N is taller
  rightDrawers.push({
    title: `Drawer ${label}`,
    x: rightX,
    y: rightY,
    width: drawerSize,
    height: height,
    fill: 'var(--drawer)',
    inventory: []
  });
  // Move Y position for next drawer (accounting for drawer height and spacing)
  rightY += height + drawerSpacing;
});

// Right side cabinets 5-12 (positioned to the left of drawers, aligned with drawer pairs)
const rightCabinetWidth = drawerSize + drawerSpacing; // 105
const rightCabinetHeight = drawerSize * 2 + drawerSpacing; // 205
const rightCabinetX = rightX - rightCabinetWidth - 20; // 1825

const rightCabinets = [];
// Cabinets align with drawer positions (every 2 drawers, starting with L-M)
let cabinetYPos = rightYStart; // Start aligned with Drawer L
for (let i = 0; i < 8; i++) {
  rightCabinets.push({
    title: `Cabinet ${i + 5}`,
    x: rightCabinetX,
    y: cabinetYPos,
    width: rightCabinetWidth,
    height: rightCabinetHeight,
    fill: 'var(--table)',
    inventory: []
  });
  // Move to next cabinet position (every 2 drawers)
  // Account for Drawer N being taller
  if (i === 0) {
    // After Cabinet 5 (L-M), skip to after N
    cabinetYPos = rightYStart + drawerSize*2 + drawerSpacing*2; // After Drawer N
  } else {
    cabinetYPos += (drawerSize + drawerSpacing) * 2; // Normal spacing
  }
}

// Workbench
const workbench = {
  title: 'Workbench',
  x: 140,
  y: 1680,
  width: 350,
  height: 520,
  fill: '#e7ebf3',
  isWorkbench: true,
  inventory: []
};

// Tall Cabinets 100-103 (File Cabinets)
const tallCabinetX = 140;
const tallCabinetWidth = 240;
const tallCabinetHeight = 300;
const tallCabinetSpacing = 305; // Vertical spacing
const tallCabinetStartY = 2260;

const tallCabinets = [];
for (let i = 0; i < 4; i++) {
  tallCabinets.push({
    title: `Tall Cabinet ${103 - i}`, // 103, 102, 101, 100
    x: tallCabinetX,
    y: tallCabinetStartY + i * tallCabinetSpacing,
    width: tallCabinetWidth,
    height: tallCabinetHeight,
    fill: 'var(--files)',
    inventory: []
  });
}

// Tall Cabinet 104 (above right drawer section)
// Calculate x position from room right border
const roomRightBorder = inventoryBounds.room.x + inventoryBounds.room.width; // 80 + 3600 = 3680
const tallCabinet104X = roomRightBorder - tallCabinetWidth - 30; // 3680 - 240 - 20 = 3420

const tallCabinet104 = {
  title: 'Tall Cabinet 104',
  x: tallCabinet104X,
  y: rightYStart - tallCabinetHeight - 20, // Above the right drawers
  width: tallCabinetWidth,
  height: tallCabinetHeight,
  fill: 'var(--files)',
  inventory: []
};

// Tables A-H (2 columns x 4 rows)
// Pattern: A,B in col1 rows 0,1; C,D in col2 rows 0,1; E,F in col1 rows 2,3; G,H in col2 rows 2,3
const tableWidth = 720;
const tableHeight = 300;
const tableCol1X = 800;
const tableCol2X = 2100;
const tableRows = [1080, 1385, 2160, 2465]; // 4 rows

const tables = [];
const tableLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

tableLabels.forEach((label, index) => {
  // Pattern: pairs alternate columns, then move to next row pair
  // A,B (0,1): col0 rows 0,1
  // C,D (2,3): col1 rows 0,1
  // E,F (4,5): col0 rows 2,3
  // G,H (6,7): col1 rows 2,3
  const pairIndex = Math.floor(index / 2); // 0,0,1,1,2,2,3,3
  const colIndex = pairIndex % 2; // 0,0,1,1,0,0,1,1
  const rowInPair = index % 2; // 0,1,0,1,0,1,0,1
  const rowIndex = Math.floor(pairIndex / 2) * 2 + rowInPair; // 0,1,0,1,2,3,2,3
  
  tables.push({
    title: `Table ${label}`,
    x: colIndex === 0 ? tableCol1X : tableCol2X,
    y: tableRows[rowIndex],
    width: tableWidth,
    height: tableHeight,
    fill: 'var(--table)',
    inventory: []
  });
});

// Tables I-J (2 tables horizontally at bottom of room)
const roomBottomY = 80 + 3840 - 300 - 20; // Room height - table height - margin
const bottomTableY = roomBottomY; // ~3600
const bottomTableSpacing = 50; // Space between the two tables
const bottomTableStartX = 1400; // Start position for first table

const bottomTables = [
  {
    title: 'Table I',
    x: bottomTableStartX,
    y: bottomTableY,
    width: tableWidth,
    height: tableHeight,
    fill: 'var(--table)',
    inventory: []
  },
  {
    title: 'Table J',
    x: bottomTableStartX + tableWidth + bottomTableSpacing,
    y: bottomTableY,
    width: tableWidth,
    height: tableHeight,
    fill: 'var(--table)',
    inventory: []
  }
];

/** Outside the room rect, just below the lab (room bottom ~3920). */
const statusLocations = [
  {
    title: 'To Be Delivered',
    x: 400,
    y: 4000,
    width: 800,
    height: 800,
    fill: 'var(--table)',
    inventory: []
  },
  {
    title: 'Lost Items',
    x: 1250,
    y: 4000,
    width: 800,
    height: 800,
    fill: 'var(--table)',
    inventory: []
  },
  {
    title: 'Unsorted Items',
    x: 2100,
    y: 4000,
    width: 800,
    height: 800,
    fill: 'var(--table)',
    inventory: []
  }
];

// Combine all boxes in the desired order
const allBoxes = [
  ...topDrawers,
  ...topCabinets,
  ...rightDrawers,
  ...rightCabinets,
  workbench,
  ...tallCabinets,
  tallCabinet104,
  ...tables,
  ...bottomTables,
  ...statusLocations
];

// Create the full JSON structure
const output = {
  "inventory-bounds": inventoryBounds,
  "boxes": allBoxes
};

// Format function to align columns
function formatInventoryData(data) {
  // Define attribute order
  const attributeOrder = ['title', 'x', 'y', 'width', 'height', 'fill', 'isWorkbench', 'inventory'];
  
  // Find the maximum width for each attribute's value across all boxes
  const maxValueWidths = {};
  
  attributeOrder.forEach(attr => {
    let maxWidth = 0;
    data.boxes.forEach(box => {
      if (box[attr] !== undefined) {
        const value = box[attr];
        let valueStr;
        
        if (Array.isArray(value)) {
          valueStr = JSON.stringify(value);
        } else if (typeof value === 'string') {
          valueStr = `"${value}"`;
        } else if (typeof value === 'boolean') {
          valueStr = String(value);
        } else {
          valueStr = String(value);
        }
        
        maxWidth = Math.max(maxWidth, valueStr.length);
      }
    });
    maxValueWidths[attr] = maxWidth;
  });
  
  // Format each box with aligned columns (all attributes on one line)
  const formatBox = (box) => {
    const parts = [];
    
    attributeOrder.forEach(attr => {
      if (box[attr] !== undefined) {
        const value = box[attr];
        let valueStr;
        
        if (Array.isArray(value)) {
          valueStr = JSON.stringify(value);
        } else if (typeof value === 'string') {
          valueStr = `"${value}"`;
        } else if (typeof value === 'boolean') {
          valueStr = String(value);
        } else {
          valueStr = String(value);
        }
        
        // Pad the value to align columns
        const paddedValue = valueStr.padEnd(maxValueWidths[attr]);
        parts.push(`"${attr}": ${paddedValue}`);
      }
    });
    
    return `    { ${parts.join(', ')} }`;
  };
  
  // Format the entire JSON structure
  const formattedBoxes = data.boxes.map(formatBox);
  
  // Preserve inventory-bounds if it exists
  let formattedOutput = '';
  if (data['inventory-bounds']) {
    const bounds = JSON.stringify(data['inventory-bounds'], null, 2);
    // Indent the bounds object properly
    const indentedBounds = bounds.split('\n').map((line, idx) => {
      if (idx === 0) return line; // First line
      return '  ' + line;
    }).join('\n');
    
    formattedOutput = `{
  "inventory-bounds": ${indentedBounds},
  "boxes": [
${formattedBoxes.join(',\n')}
  ]
}
`;
  } else {
    formattedOutput = `{
  "boxes": [
${formattedBoxes.join(',\n')}
  ]
}
`;
  }
  
  return formattedOutput;
}

// Write to file
const outputPath = path.join(__dirname, 'public', 'inventory-locations.json');

// First write the raw JSON
const jsonString = JSON.stringify(output, null, 2);
fs.writeFileSync(outputPath, jsonString, 'utf8');

// Then format it with aligned columns
const formattedOutput = formatInventoryData(output);
fs.writeFileSync(outputPath, formattedOutput, 'utf8');

console.log(`✓ Generated ${outputPath}`);
console.log(`  - Inventory bounds configured`);
console.log(`  - ${allBoxes.length} boxes generated`);
console.log(`  - Formatted with aligned columns`);
