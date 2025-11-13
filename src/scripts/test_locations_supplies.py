"""
Test script for locations and supplies data using the test API.

This script:
1. Creates sample locations (3 containers) via API
2. Creates sample supplies via API
3. Displays data in an interactive GUI window
4. Allows moving supplies between containers via API

Usage:
    python src/scripts/test_locations_supplies.py
"""
import os
import sys
import json
import time
import requests
import tkinter as tk
from tkinter import messagebox
from pathlib import Path

# Add src/scripts to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from helpers import TEST_API_URL

# Container names for this test
CONTAINER_NAMES = ['Container A', 'Container B', 'Container C']

# Sample supplies (9 distinct supplies, 3 per container)
SAMPLE_SUPPLIES = [
    # Container A
    {'name': 'Supply A1', 'amount': 10, 'location': 'Container A'},
    {'name': 'Supply A2', 'amount': 15, 'location': 'Container A'},
    {'name': 'Supply A3', 'amount': 20, 'location': 'Container A'},
    # Container B
    {'name': 'Supply B1', 'amount': 12, 'location': 'Container B'},
    {'name': 'Supply B2', 'amount': 18, 'location': 'Container B'},
    {'name': 'Supply B3', 'amount': 25, 'location': 'Container B'},
    # Container C
    {'name': 'Supply C1', 'amount': 8, 'location': 'Container C'},
    {'name': 'Supply C2', 'amount': 14, 'location': 'Container C'},
    {'name': 'Supply C3', 'amount': 22, 'location': 'Container C'},
]

# DISTRIBUTED SUPPLY amounts per container
DISTRIBUTED_SUPPLY_AMOUNTS = {
    'Container A': 5,
    'Container B': 10,
    'Container C': 15,
}


def check_api_available():
    """Check if the test API is available."""
    try:
        # Get base URL (remove trailing /api if present)
        base_url = TEST_API_URL
        if base_url.endswith('/api'):
            base_url = base_url[:-4]  # Remove '/api'
        elif base_url.endswith('/api/'):
            base_url = base_url[:-5]  # Remove '/api/'
        
        # Ensure base URL ends with /
        if not base_url.endswith('/'):
            base_url += '/'
        
        response = requests.get(f"{base_url}health", timeout=2)
        return response.status_code == 200
    except Exception as e:
        print(f"  Debug: API check failed: {e}")
        return False


def create_test_locations():
    """Create test container locations via API."""
    print("📦 Creating test locations...")
    
    locations_created = 0
    locations_skipped = 0
    
    for i, container_name in enumerate(CONTAINER_NAMES):
        location_data = {
            'name': container_name,
            'x': 200 + i * 300,
            'y': 200,
            'width': 200,
            'height': 200,
            'type': 'cabinet'
        }
        
        try:
            response = requests.post(f"{TEST_API_URL}/locations", json=location_data, timeout=5)
            if response.status_code == 201:
                locations_created += 1
                print(f"  ✓ Created {container_name}")
            elif response.status_code == 409:
                locations_skipped += 1
                print(f"  ⊘ {container_name} already exists, skipping")
            else:
                print(f"  ✗ Failed to create {container_name}: {response.status_code} - {response.text}")
            # Small delay to avoid exhausting connection pool
            time.sleep(0.1)
        except requests.exceptions.RequestException as e:
            print(f"  ✗ Error creating {container_name}: {e}")
            time.sleep(0.1)
    
    return locations_created, locations_skipped


def create_test_supplies():
    """Create test supplies via API."""
    print("📦 Creating test supplies...")
    
    supplies_created = 0
    supplies_failed = 0
    
    # First, create DISTRIBUTED SUPPLY in all containers
    for container_name in CONTAINER_NAMES:
        supply_data = {
            'name': 'DISTRIBUTED SUPPLY',
            'amount': DISTRIBUTED_SUPPLY_AMOUNTS[container_name],
            'location': container_name
        }
        
        try:
            response = requests.post(f"{TEST_API_URL}/supplies", json=supply_data, timeout=5)
            if response.status_code in [201, 200]:
                supplies_created += 1
                print(f"  ✓ Created DISTRIBUTED SUPPLY in {container_name}")
            else:
                supplies_failed += 1
                print(f"  ✗ Failed to create DISTRIBUTED SUPPLY in {container_name}: {response.status_code}")
            # Small delay to avoid exhausting connection pool
            time.sleep(0.1)
        except requests.exceptions.RequestException as e:
            supplies_failed += 1
            print(f"  ✗ Error creating DISTRIBUTED SUPPLY in {container_name}: {e}")
            time.sleep(0.1)
    
    # Then create the 9 distinct supplies
    for supply in SAMPLE_SUPPLIES:
        try:
            response = requests.post(f"{TEST_API_URL}/supplies", json=supply, timeout=5)
            if response.status_code in [201, 200]:
                supplies_created += 1
            else:
                supplies_failed += 1
                print(f"  ✗ Failed to create {supply['name']}: {response.status_code}")
            # Small delay to avoid exhausting connection pool
            time.sleep(0.1)
        except requests.exceptions.RequestException as e:
            supplies_failed += 1
            print(f"  ✗ Error creating {supply['name']}: {e}")
            time.sleep(0.1)
    
    return supplies_created, supplies_failed


def get_supplies_from_api():
    """Fetch supplies from the test API, filtered to our containers."""
    try:
        # Get all supplies and filter to our containers
        response = requests.get(f"{TEST_API_URL}/supplies", timeout=5)
        if response.status_code == 200:
            all_supplies = response.json()
            # Filter to only our containers
            filtered = [s for s in all_supplies if s['location'] in CONTAINER_NAMES]
            return filtered
        else:
            print(f"Warning: API returned status {response.status_code}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Warning: Error fetching supplies from API: {e}")
        return []


def move_supplies_via_api(from_container, to_container):
    """Move all supplies from one container to another via API."""
    try:
        # Get all supplies in source container
        response = requests.get(f"{TEST_API_URL}/supplies?location={from_container}", timeout=5)
        if response.status_code != 200:
            messagebox.showerror("Error", f"Failed to fetch supplies from {from_container}")
            return False
        
        supplies = response.json()
        if not supplies:
            messagebox.showinfo("Info", f"No supplies in {from_container} to move.")
            return False
        
        # Move each supply
        moved_count = 0
        failed_count = 0
        
        for supply in supplies:
            move_data = {
                'name': supply['name'],
                'from_location': from_container,
                'to_location': to_container,
                'amount': supply['amount']  # Move all
            }
            
            try:
                move_response = requests.post(f"{TEST_API_URL}/supplies/move", json=move_data, timeout=5)
                if move_response.status_code == 200:
                    moved_count += 1
                else:
                    failed_count += 1
                    error_msg = move_response.json().get('error', 'Unknown error')
                    print(f"Failed to move {supply['name']}: {error_msg}")
            except requests.exceptions.RequestException as e:
                failed_count += 1
                print(f"Error moving {supply['name']}: {e}")
        
        if failed_count > 0:
            messagebox.showwarning(
                "Partial Success",
                f"Moved {moved_count} supply type(s), {failed_count} failed."
            )
        else:
            # Success - no popup, just refresh
            pass
        
        return moved_count > 0
        
    except requests.exceptions.RequestException as e:
        messagebox.showerror("Error", f"Failed to move supplies: {e}")
        return False


def create_table_viewer(locations_data=None, supplies_data=None, cleanup_callback=None):
    """
    Create and display the interactive table viewer window.
    
    Args:
        locations_data: Optional list of location tuples (for test_gui.py integration)
        supplies_data: Optional list of supply tuples (for test_gui.py integration)
        cleanup_callback: Optional callback function to call when window closes
    """
    try:
        import tkinter as tk
    except ImportError:
        print("✗ Tkinter not available. Cannot display GUI.")
        return
    
    root = tk.Tk()
    root.title("Container Supplies - Test API")
    root.geometry("900x600")
    
    # Set up cleanup callback if provided
    if cleanup_callback:
        def on_closing():
            cleanup_callback()
            root.destroy()
        root.protocol("WM_DELETE_WINDOW", on_closing)
    
    # Check API availability
    api_available = check_api_available()
    if not api_available:
        warning_label = tk.Label(
            root,
            text="⚠ Test API not available!\nMake sure 'api-test' service is running on port 5001.",
            fg="red",
            font=("Arial", 12, "bold"),
            justify=tk.CENTER
        )
        warning_label.pack(pady=20)
        root.mainloop()
        return
    
    # Main frame
    main_frame = tk.Frame(root, padx=20, pady=20)
    main_frame.pack(fill=tk.BOTH, expand=True)
    
    # Title
    title_label = tk.Label(main_frame, text="Container Supplies (Test API)", font=("Arial", 16, "bold"))
    title_label.pack(pady=(0, 20))
    
    # Container frames (3 columns)
    containers_frame = tk.Frame(main_frame)
    containers_frame.pack(fill=tk.BOTH, expand=True)
    
    container_frames = {}
    container_labels = {}
    
    # Define functions before creating buttons (to avoid closure issues)
    def update_display(supplies_data=None):
        """Update the display with current supplies."""
        if supplies_data is None:
            supplies_data = get_supplies_from_api()
        
        # Group supplies by location
        supplies_by_location = {}
        for supply in supplies_data:
            # Handle both dict (from API) and tuple (from test_gui.py) formats
            if isinstance(supply, dict):
                location = supply['location']
                name = supply['name']
                amount = supply['amount']
            else:
                # Tuple format: (id, name, amount, last_order_date, location)
                supply_id, name, amount, last_order_date, location = supply
                supply = {'id': supply_id, 'name': name, 'amount': amount, 'location': location}
            
            if location not in supplies_by_location:
                supplies_by_location[location] = []
            supplies_by_location[location].append(supply)
        
        # Update each container display
        for container_name in CONTAINER_NAMES:
            if container_name in container_frames:
                listbox = container_frames[container_name]
                listbox.delete(0, tk.END)
                
                if container_name in supplies_by_location:
                    total_items = 0
                    for supply in supplies_by_location[container_name]:
                        if isinstance(supply, dict):
                            name = supply['name']
                            amount = supply['amount']
                        else:
                            _, name, amount, _, _ = supply
                        total_items += amount
                        listbox.insert(tk.END, f"{name}: {amount}")
                    
                    # Update container label
                    if container_name in container_labels:
                        container_labels[container_name].config(
                            text=f"{container_name} ({len(supplies_by_location[container_name])} types, {total_items} total items)"
                        )
                else:
                    listbox.insert(0, "(empty)")
                    if container_name in container_labels:
                        container_labels[container_name].config(text=f"{container_name} (empty)")
    
    def refresh_display():
        """Refresh the display from API."""
        supplies = get_supplies_from_api()
        update_display(supplies)
    
    def move_and_refresh(from_container, to_container):
        """Move supplies and refresh display."""
        if move_supplies_via_api(from_container, to_container):
            refresh_display()
    
    # Now create the UI elements
    for i, container_name in enumerate(CONTAINER_NAMES):
        # Container column
        col_frame = tk.Frame(containers_frame)
        col_frame.grid(row=0, column=i, padx=20, sticky="nsew")
        containers_frame.columnconfigure(i, weight=1)
        
        # Container label
        label = tk.Label(col_frame, text=f"{container_name}", font=("Arial", 12, "bold"))
        label.pack(pady=(0, 10))
        container_labels[container_name] = label
        
        # Supplies listbox
        listbox = tk.Listbox(col_frame, width=30, height=15, font=("Consolas", 10))
        listbox.pack(fill=tk.BOTH, expand=True)
        container_frames[container_name] = listbox
        
        # Move buttons for this container
        buttons_frame = tk.Frame(col_frame)
        buttons_frame.pack(pady=10)
        
        for other_container in CONTAINER_NAMES:
            if other_container != container_name:
                btn_text = f"Move to {other_container}"
                btn = tk.Button(
                    buttons_frame,
                    text=btn_text,
                    command=lambda f=container_name, t=other_container: move_and_refresh(f, t),
                    width=20,
                    height=2,
                    font=("Arial", 10, "bold"),
                    bg="#4CAF50",
                    fg="white"
                )
                btn.pack(pady=5, fill=tk.X)
    
    # Refresh button
    refresh_btn = tk.Button(
        main_frame,
        text="🔄 Refresh",
        command=refresh_display,
        width=20,
        height=2,
        font=("Arial", 10, "bold"),
        bg="#2196F3",
        fg="white"
    )
    refresh_btn.pack(pady=10)
    
    # Initial display
    if locations_data and supplies_data:
        # Use provided data (from test_gui.py)
        update_display(supplies_data)
    else:
        # Fetch from API (standalone mode)
        refresh_display()
    
    root.mainloop()


def main():
    """Main test function."""
    print("🧪 Starting Locations & Supplies Data Test (via API)")
    print(f"🌐 Test API: {TEST_API_URL}")
    print("=" * 60)
    
    # Check if API is available
    print("🔌 Checking test API availability...")
    print(f"  Testing connection to: {TEST_API_URL.replace('/api', '')}/health")
    if not check_api_available():
        print("✗ Test API is not available!")
        print(f"  Make sure the 'api-test' service is running on port 5001")
        print(f"  Run 'make up' or 'make test' to start services")
        print(f"  Expected URL: {TEST_API_URL}")
        sys.exit(1)
    
    print("✓ Test API is available")
    
    # Create test locations
    print("\n" + "=" * 60)
    loc_created, loc_skipped = create_test_locations()
    
    # Create test supplies
    print("\n" + "=" * 60)
    sup_created, sup_failed = create_test_supplies()
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ TEST SUMMARY:")
    print(f"   Locations: {loc_created} created, {loc_skipped} skipped (already existed)")
    print(f"   Supplies: {sup_created} created, {sup_failed} failed")
    print("=" * 60)
    
    # Get current data for display
    print("\n📊 Fetching current data from API...")
    supplies_data = get_supplies_from_api()
    
    # Output JSON data for test_gui.py to display
    table_data = {
        'locations': {
            'columns': ['name', 'x', 'y', 'width', 'height', 'type'],
            'data': [
                [name, 200 + i * 300, 200, 200, 200, 'cabinet']
                for i, name in enumerate(CONTAINER_NAMES)
            ]
        },
        'supplies': {
            'columns': ['id', 'name', 'amount', 'last_order_date', 'location'],
            'data': [
                [
                    s.get('id', 0),
                    s['name'],
                    s['amount'],
                    s.get('last_order_date'),
                    s['location']
                ]
                for s in supplies_data
            ]
        }
    }
    
    print("\n" + "=" * 60)
    print("TABLE_DATA_JSON_START")
    print(json.dumps(table_data, indent=2))
    print("TABLE_DATA_JSON_END")
    print("=" * 60)
    
    # Only open GUI viewer if running locally (not in Docker)
    # When running in Docker, test_gui.py will open the viewer locally
    is_docker = os.path.exists("/app") or os.getenv("HOSTNAME", "").startswith("mysql_api")
    
    if not is_docker:
        # Running locally - open GUI viewer
        print("\n🪟 Opening table viewer window...")
        create_table_viewer()
    else:
        # Running in Docker - test_gui.py will open viewer locally
        print("\n📊 Test data ready (GUI will open locally via test_gui.py)")
    
    print("\n✅ Test completed successfully!")


if __name__ == "__main__":
    main()

