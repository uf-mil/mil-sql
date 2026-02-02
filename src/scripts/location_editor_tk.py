#!/usr/bin/env python3
"""
Location Editor - Desktop Application
Uses pywebview to create a native window with D3.js visualization.
Bypasses CORS by handling file I/O directly in Python.
"""

import json
import os
import sys
from pathlib import Path

try:
    import webview
except ImportError:
    print("Error: pywebview is not installed.")
    print("Install it with: pip install pywebview")
    sys.exit(1)

# Get the script directory
SCRIPT_DIR = Path(__file__).parent
JSON_FILE = SCRIPT_DIR / "inventory_locations.json"

class LocationEditorAPI:
    """API exposed to JavaScript for file operations."""
    
    def load_locations(self):
        """Load locations from JSON file."""
        try:
            if not JSON_FILE.exists():
                return {"success": True, "locations": []}
            
            with open(JSON_FILE, 'r', encoding='utf-8') as f:
                locations = json.load(f)
            return {"success": True, "locations": locations}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def save_locations(self, locations):
        """Save locations to JSON file."""
        try:
            # Validate locations
            if not isinstance(locations, list):
                return {"success": False, "error": "Locations must be an array"}
            
            # Validate each location
            for loc in locations:
                if not all(k in loc for k in ['name', 'x', 'y', 'width', 'height', 'type']):
                    return {"success": False, "error": "Invalid location data"}
            
            # Write to file
            with open(JSON_FILE, 'w', encoding='utf-8') as f:
                json.dump(locations, f, indent=2, ensure_ascii=False)
            
            return {"success": True, "count": len(locations)}
        except Exception as e:
            return {"success": False, "error": str(e)}


def create_html():
    """Create the HTML content with embedded D3.js."""
    # Read the existing HTML file
    html_file = SCRIPT_DIR / "location_editor.html"
    
    if html_file.exists():
        with open(html_file, 'r', encoding='utf-8') as f:
            html = f.read()
        
        # Replace the load/save functions to use Python API
        html = html.replace(
            '// Load locations from API (server-based)',
            '// Load locations from Python API'
        )
        html = html.replace(
            '''async function loadLocations() {
      try {
        const response = await fetch('/api/locations');
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
        locations = await response.json();
        renderLocations();
        console.log(`Loaded ${locations.length} locations from server`);
      } catch (error) {
        console.error('Error loading locations:', error);
        alert(`Failed to load locations: ${error.message}\n\nMake sure the server is running.`);
      }
    }''',
            '''async function loadLocations() {
      try {
        const result = await window.pywebview.api.load_locations();
        if (!result.success) {
          throw new Error(result.error || 'Failed to load locations');
        }
        locations = result.locations || [];
        renderLocations();
        console.log(`Loaded ${locations.length} locations`);
      } catch (error) {
        console.error('Error loading locations:', error);
        alert(`Failed to load locations: ${error.message}`);
      }
    }'''
        )
        
        html = html.replace(
            '// Save to JSON',
            '// Save to JSON via Python API'
        )
        html = html.replace(
            '''function saveLocations() {
      if (!confirm(`Save ${locations.length} locations to ${currentFileName}?`)) {
        return;
      }

      try {
        const json = JSON.stringify(locations, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`Saved ${locations.length} locations to ${currentFileName}`);
      } catch (error) {
        console.error('Error saving locations:', error);
        alert('Failed to save locations. Check console for details.');
      }
    }''',
            '''async function saveLocations() {
      if (!confirm(`Save ${locations.length} locations?`)) {
        return;
      }

      try {
        const result = await window.pywebview.api.save_locations(locations);
        if (!result.success) {
          throw new Error(result.error || 'Failed to save locations');
        }
        alert(`Saved ${result.count} locations successfully!`);
        console.log(`Saved ${result.count} locations`);
      } catch (error) {
        console.error('Error saving locations:', error);
        alert(`Failed to save locations: ${error.message}`);
      }
    }'''
        )
        
        # Remove file input fallback code
        html = html.replace(
            '// Fallback: Load from file input (if not using server)',
            '// File input removed - using Python API'
        )
        html = html.replace(
            '''function loadLocationsFromFile(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          locations = JSON.parse(e.target.result);
          currentFileName = file.name;
          renderLocations();
          console.log(`Loaded ${locations.length} locations from ${file.name}`);
          alert(`Loaded ${locations.length} locations from ${file.name}`);
        } catch (error) {
          console.error('Error parsing JSON:', error);
          alert(`Failed to parse JSON file: ${error.message}`);
        }
      };
      reader.onerror = function() {
        alert('Error reading file');
      };
      reader.readAsText(file);
    }''',
            ''
        )
        
        # Update button handlers
        html = html.replace(
            '''<input type="file" id="fileInput" accept=".json" style="display: none;">
      <button id="loadBtn">Load JSON File</button>''',
            '''<button id="loadBtn">Reload</button>'''
        )
        html = html.replace(
            '''document.getElementById('loadBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        loadLocationsFromFile(file);
      }
    });''',
            '''document.getElementById('loadBtn').addEventListener('click', loadLocations);'''
        )
        
        html = html.replace(
            '// Try to load on startup (works if running on web server)',
            '// Load on startup'
        )
        html = html.replace(
            'tryLoadFromFetch();',
            'loadLocations();'
        )
        
        return html
    else:
        # Fallback: return a simple HTML if file doesn't exist
        return f"""
<!DOCTYPE html>
<html>
<head>
    <title>Location Editor</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
</head>
<body>
    <h1>Error: location_editor.html not found</h1>
    <p>Expected at: {html_file}</p>
</body>
</html>
"""


def main():
    """Main entry point."""
    api = LocationEditorAPI()
    html = create_html()
    
    # Create the webview window
    window = webview.create_window(
        'Location Editor',
        html=html,
        js_api=api,
        width=1200,
        height=800,
        min_size=(800, 600)
    )
    
    print(f"📍 Location Editor starting...")
    print(f"📁 JSON file: {JSON_FILE}")
    print(f"Press Ctrl+C to exit\n")
    
    # Start the webview
    webview.start(debug=False)


if __name__ == "__main__":
    main()

