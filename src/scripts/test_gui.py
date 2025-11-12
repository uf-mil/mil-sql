"""
GUI Test Runner for mil-sql tests.

Opens a tkinter window with buttons to run individual tests.
Automatically discovers test_*.py files in the scripts directory.

Usage:
    python src/scripts/test_gui.py
"""
import tkinter as tk
from tkinter import scrolledtext, ttk
import subprocess
import sys
import os
import json
from pathlib import Path
import threading
import re


class TestRunnerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Mil-SQL Test Runner")
        self.root.geometry("800x600")
        
        # Get scripts directory
        self.scripts_dir = Path(__file__).parent
        
        # Discover test files
        self.test_files = self.discover_tests()
        
        # Create UI
        self.create_ui()
        
    def discover_tests(self):
        """Discover all test_*.py files in the scripts directory."""
        test_files = []
        for test_file in self.scripts_dir.glob("test_*.py"):
            if test_file.name != "test_gui.py":  # Exclude this file
                # Extract test name from filename: test_<name>.py -> <name>
                match = re.match(r"test_(.+)\.py$", test_file.name, re.IGNORECASE)
                if match:
                    test_name = match.group(1).replace("_", " ").title()
                    test_files.append((test_name, test_file))
        return sorted(test_files)
    
    def create_ui(self):
        """Create the user interface."""
        # Top frame for buttons
        button_frame = tk.Frame(self.root, padx=10, pady=10)
        button_frame.pack(fill=tk.X)
        
        tk.Label(button_frame, text="Available Tests:", font=("Arial", 12, "bold")).pack(anchor=tk.W)
        
        # Create buttons for each test
        if not self.test_files:
            tk.Label(button_frame, text="No test files found (test_*.py)", fg="gray").pack(anchor=tk.W, pady=5)
        else:
            buttons_frame = tk.Frame(button_frame)
            buttons_frame.pack(fill=tk.X, pady=5)
            
            for test_name, test_file in self.test_files:
                btn = tk.Button(
                    buttons_frame,
                    text=f"▶ {test_name}",
                    command=lambda tf=test_file: self.run_test(tf),
                    width=20,
                    height=2,
                    font=("Arial", 10)
                )
                btn.pack(side=tk.LEFT, padx=5, pady=5)
            
            # Run all tests button
            tk.Button(
                buttons_frame,
                text="▶ Run All Tests",
                command=self.run_all_tests,
                width=20,
                height=2,
                font=("Arial", 10, "bold"),
                bg="#4CAF50",
                fg="white"
            ).pack(side=tk.LEFT, padx=5, pady=5)
        
        # Output area
        output_frame = tk.Frame(self.root, padx=10, pady=10)
        output_frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(output_frame, text="Test Output:", font=("Arial", 12, "bold")).pack(anchor=tk.W)
        
        self.output_text = scrolledtext.ScrolledText(
            output_frame,
            wrap=tk.WORD,
            width=80,
            height=20,
            font=("Consolas", 9)
        )
        self.output_text.pack(fill=tk.BOTH, expand=True, pady=5)
        
        # Status bar
        self.status_var = tk.StringVar(value="Ready")
        status_bar = tk.Label(
            self.root,
            textvariable=self.status_var,
            relief=tk.SUNKEN,
            anchor=tk.W,
            padx=10
        )
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)
        
        # Clear button
        clear_btn = tk.Button(
            output_frame,
            text="Clear Output",
            command=self.clear_output,
            width=15
        )
        clear_btn.pack(anchor=tk.E, pady=5)
    
    def clear_output(self):
        """Clear the output text area."""
        self.output_text.delete(1.0, tk.END)
        self.status_var.set("Ready")
    
    def log(self, message, tag=None):
        """Add a message to the output area."""
        self.output_text.insert(tk.END, message + "\n", tag)
        self.output_text.see(tk.END)
        self.root.update()
    
    def run_test(self, test_file):
        """Run a single test file."""
        test_name = test_file.stem.replace("test_", "").replace("_", " ").title()
        self.log(f"\n{'='*60}")
        self.log(f"Running: {test_name}")
        self.log(f"File: {test_file.name}")
        self.log(f"{'='*60}\n")
        self.status_var.set(f"Running: {test_name}...")
        
        # Run test in a separate thread to avoid blocking UI
        thread = threading.Thread(target=self._run_test_thread, args=(test_file,), daemon=True)
        thread.start()
    
    def _run_test_thread(self, test_file):
        """Run test in a separate thread and capture output."""
        try:
            # Get the test filename relative to scripts directory
            test_filename = test_file.name
            
            # Run test in Docker container
            # Use docker-compose exec to run the test in the api container
            compose_cmd = ["docker-compose", "-p", "mysql_service", "exec", "-T", "api", "python", f"src/scripts/{test_filename}"]
            
            # Run the test
            process = subprocess.Popen(
                compose_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',  # Replace invalid characters instead of failing
                bufsize=1,
                universal_newlines=True,
                cwd=str(self.scripts_dir.parent.parent)  # Run from project root
            )
            
            # Capture all output to detect JSON data
            output_lines = []
            json_data = None
            in_json_block = False
            json_lines = []
            
            # Stream output in real-time
            for line in process.stdout:
                line_stripped = line.rstrip()
                output_lines.append(line_stripped)
                self.log(line_stripped)
                
                # Detect JSON data block
                if "TABLE_DATA_JSON_START" in line_stripped:
                    in_json_block = True
                    json_lines = []
                elif "TABLE_DATA_JSON_END" in line_stripped:
                    in_json_block = False
                    # Parse JSON
                    try:
                        json_str = "\n".join(json_lines)
                        json_data = json.loads(json_str)
                    except json.JSONDecodeError as e:
                        self.log(f"\n⚠ Could not parse table data JSON: {e}", "error")
                elif in_json_block:
                    json_lines.append(line_stripped)
            
            process.wait()
            
            # If we got JSON data, open viewer window locally
            if json_data and process.returncode == 0:
                self.log("\n🪟 Opening table viewer window locally...")
                self.root.after(100, lambda: self._open_table_viewer(json_data))
            
            if process.returncode == 0:
                self.log(f"\n✓ Test completed successfully!", "success")
                self.status_var.set("Test passed!")
            else:
                self.log(f"\n✗ Test failed with exit code {process.returncode}", "error")
                self.status_var.set("Test failed!")
                
        except Exception as e:
            self.log(f"\n✗ Error running test: {e}", "error")
            self.status_var.set(f"Error: {str(e)}")
    
    def _open_table_viewer(self, table_data):
        """Open a table viewer window with the provided data."""
        try:
            # Check which format we have
            if 'locations' in table_data and 'supplies' in table_data:
                # Format from test_locations_supplies.py - use interactive viewer
                try:
                    # Import the interactive viewer from test_locations_supplies
                    import importlib.util
                    viewer_path = self.scripts_dir / "test_locations_supplies.py"
                    spec = importlib.util.spec_from_file_location("test_locations_supplies", viewer_path)
                    test_module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(test_module)
                    
                    # Convert JSON data back to tuples
                    locations_data = [tuple(row) for row in table_data['locations']['data']]
                    supplies_data = [tuple(row) for row in table_data['supplies']['data']]
                    
                    # Use the interactive viewer
                    test_module.create_table_viewer(locations_data, supplies_data)
                except Exception as e:
                    # Fallback to simple viewer
                    self.log(f"\n⚠ Could not load interactive viewer, using simple viewer: {e}", "error")
                    locations_data = [tuple(row) for row in table_data['locations']['data']]
                    supplies_data = [tuple(row) for row in table_data['supplies']['data']]
                    self._create_table_viewer_window(locations_data, supplies_data)
            elif 'successful_tables' in table_data or 'failed_tables' in table_data:
                # Format from test_tables.py - show table creation results
                self._create_all_tables_viewer_window(table_data)
            else:
                self.log(f"\n⚠ Unknown table data format", "error")
        except Exception as e:
            self.log(f"\n⚠ Could not open table viewer: {e}", "error")
            import traceback
            self.log(traceback.format_exc(), "error")
    
    def _create_table_viewer_window(self, locations_data, supplies_data):
        """Create a tkinter window to display table contents."""
        root = tk.Tk()
        root.title("Database Table Contents - Locations & Supplies")
        root.geometry("1200x700")
        
        # Create notebook for tabs
        notebook = ttk.Notebook(root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Locations tab
        locations_frame = ttk.Frame(notebook)
        notebook.add(locations_frame, text=f"Locations ({len(locations_data)} rows)")
        
        # Locations treeview
        loc_tree = ttk.Treeview(locations_frame, columns=('name', 'x', 'y', 'width', 'height', 'type'), show='headings', height=20)
        loc_tree.heading('name', text='Name')
        loc_tree.heading('x', text='X')
        loc_tree.heading('y', text='Y')
        loc_tree.heading('width', text='Width')
        loc_tree.heading('height', text='Height')
        loc_tree.heading('type', text='Type')
        
        # Configure column widths
        loc_tree.column('name', width=150, anchor=tk.W)
        loc_tree.column('x', width=60, anchor=tk.CENTER)
        loc_tree.column('y', width=60, anchor=tk.CENTER)
        loc_tree.column('width', width=80, anchor=tk.CENTER)
        loc_tree.column('height', width=80, anchor=tk.CENTER)
        loc_tree.column('type', width=100, anchor=tk.W)
        
        # Add scrollbar for locations
        loc_scroll = ttk.Scrollbar(locations_frame, orient=tk.VERTICAL, command=loc_tree.yview)
        loc_tree.configure(yscrollcommand=loc_scroll.set)
        
        loc_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        loc_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Populate locations data
        for row in locations_data:
            loc_tree.insert('', tk.END, values=row)
        
        # Supplies tab
        supplies_frame = ttk.Frame(notebook)
        notebook.add(supplies_frame, text=f"Supplies ({len(supplies_data)} rows)")
        
        # Supplies treeview
        sup_tree = ttk.Treeview(supplies_frame, columns=('id', 'name', 'amount', 'last_order_date', 'location'), show='headings', height=20)
        sup_tree.heading('id', text='ID')
        sup_tree.heading('name', text='Name')
        sup_tree.heading('amount', text='Amount')
        sup_tree.heading('last_order_date', text='Last Order Date')
        sup_tree.heading('location', text='Location')
        
        # Configure column widths
        sup_tree.column('id', width=50, anchor=tk.CENTER)
        sup_tree.column('name', width=200, anchor=tk.W)
        sup_tree.column('amount', width=80, anchor=tk.CENTER)
        sup_tree.column('last_order_date', width=120, anchor=tk.CENTER)
        sup_tree.column('location', width=150, anchor=tk.W)
        
        # Add scrollbar for supplies
        sup_scroll = ttk.Scrollbar(supplies_frame, orient=tk.VERTICAL, command=sup_tree.yview)
        sup_tree.configure(yscrollcommand=sup_scroll.set)
        
        sup_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sup_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Populate supplies data
        for row in supplies_data:
            sup_tree.insert('', tk.END, values=row)
        
        # Status bar
        status_frame = tk.Frame(root)
        status_frame.pack(fill=tk.X, padx=10, pady=5)
        status_label = tk.Label(status_frame, text=f"Locations: {len(locations_data)} | Supplies: {len(supplies_data)}", 
                                relief=tk.SUNKEN, anchor=tk.W, padx=10)
        status_label.pack(fill=tk.X)
        
        # Close button
        button_frame = tk.Frame(root)
        button_frame.pack(pady=10)
        tk.Button(button_frame, text="Close", command=root.destroy, width=15, height=2).pack()
        
        root.mainloop()
    
    def _create_all_tables_viewer_window(self, table_data):
        """Create a tkinter window to display table creation results."""
        root = tk.Tk()
        database_name = table_data.get('database', 'Unknown')
        summary = table_data.get('summary', {})
        successful_tables = table_data.get('successful_tables', [])
        failed_tables = table_data.get('failed_tables', [])
        
        root.title(f"Table Creation Results - {database_name}")
        root.geometry("800x600")
        
        # Main frame
        main_frame = tk.Frame(root, padx=20, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = tk.Label(
            main_frame, 
            text=f"Database: {database_name}",
            font=("Arial", 14, "bold")
        )
        title_label.pack(anchor=tk.W, pady=(0, 10))
        
        # Summary section
        summary_frame = tk.LabelFrame(main_frame, text="Summary", padx=10, pady=10)
        summary_frame.pack(fill=tk.X, pady=10)
        
        summary_text = f"""Created: {summary.get('created', 0)}/{summary.get('total', 0)} tables
Successful: {summary.get('successful_count', 0)} tables
Failed: {summary.get('failed_count', 0)} tables
All Valid: {'Yes ✓' if summary.get('all_valid', False) else 'No ✗'}"""
        
        summary_label = tk.Label(
            summary_frame,
            text=summary_text,
            font=("Consolas", 10),
            justify=tk.LEFT
        )
        summary_label.pack(anchor=tk.W)
        
        # Successful tables section
        if successful_tables:
            success_frame = tk.LabelFrame(main_frame, text=f"✓ Successful Tables ({len(successful_tables)})", padx=10, pady=10)
            success_frame.pack(fill=tk.BOTH, expand=True, pady=10)
            
            success_listbox = tk.Listbox(success_frame, font=("Consolas", 10))
            success_listbox.pack(fill=tk.BOTH, expand=True)
            
            for table_name in sorted(successful_tables):
                success_listbox.insert(tk.END, f"  ✓ {table_name}")
        else:
            success_frame = tk.LabelFrame(main_frame, text="✓ Successful Tables (0)", padx=10, pady=10)
            success_frame.pack(fill=tk.X, pady=10)
            tk.Label(success_frame, text="No successful tables", fg="gray").pack()
        
        # Failed tables section
        if failed_tables:
            failed_frame = tk.LabelFrame(main_frame, text=f"✗ Failed Tables ({len(failed_tables)})", padx=10, pady=10)
            failed_frame.pack(fill=tk.BOTH, expand=True, pady=10)
            
            failed_listbox = tk.Listbox(failed_frame, font=("Consolas", 10), fg="red")
            failed_listbox.pack(fill=tk.BOTH, expand=True)
            
            for table_name in sorted(failed_tables):
                failed_listbox.insert(tk.END, f"  ✗ {table_name}")
        else:
            failed_frame = tk.LabelFrame(main_frame, text="✗ Failed Tables (0)", padx=10, pady=10)
            failed_frame.pack(fill=tk.X, pady=10)
            tk.Label(failed_frame, text="No failed tables", fg="green").pack()
        
        # Status bar
        status_frame = tk.Frame(root)
        status_frame.pack(fill=tk.X, padx=10, pady=5)
        status_label = tk.Label(
            status_frame, 
            text=f"Total: {summary.get('total', 0)} tables | Successful: {len(successful_tables)} | Failed: {len(failed_tables)}", 
            relief=tk.SUNKEN, 
            anchor=tk.W, 
            padx=10
        )
        status_label.pack(fill=tk.X)
        
        # Close button
        button_frame = tk.Frame(root)
        button_frame.pack(pady=10)
        tk.Button(button_frame, text="Close", command=root.destroy, width=15, height=2).pack()
        
        root.mainloop()
    
    def run_all_tests(self):
        """Run all discovered tests sequentially."""
        if not self.test_files:
            self.log("No tests to run.")
            return
        
        self.log(f"\n{'='*60}")
        self.log(f"Running All Tests ({len(self.test_files)} test(s))")
        self.log(f"{'='*60}\n")
        self.status_var.set(f"Running all tests...")
        
        # Run tests in sequence
        thread = threading.Thread(target=self._run_all_tests_thread, daemon=True)
        thread.start()
    
    def _run_all_tests_thread(self):
        """Run all tests in a separate thread."""
        passed = 0
        failed = 0
        
        for test_name, test_file in self.test_files:
            self.log(f"\n{'='*60}")
            self.log(f"Running: {test_name}")
            self.log(f"{'='*60}\n")
            self.status_var.set(f"Running: {test_name}... ({passed + failed + 1}/{len(self.test_files)})")
            
            try:
                # Get the test filename relative to scripts directory
                test_filename = test_file.name
                
                # Run test in Docker container
                compose_cmd = ["docker-compose", "-p", "mysql_service", "exec", "-T", "api", "python", f"src/scripts/{test_filename}"]
                
                process = subprocess.Popen(
                    compose_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',  # Replace invalid characters instead of failing
                    bufsize=1,
                    universal_newlines=True,
                    cwd=str(self.scripts_dir.parent.parent)  # Run from project root
                )
                
                for line in process.stdout:
                    self.log(line.rstrip())
                
                process.wait()
                
                if process.returncode == 0:
                    self.log(f"\n✓ {test_name} PASSED\n", "success")
                    passed += 1
                else:
                    self.log(f"\n✗ {test_name} FAILED\n", "error")
                    failed += 1
                    
            except Exception as e:
                self.log(f"\n✗ {test_name} ERROR: {e}\n", "error")
                failed += 1
        
        # Summary
        self.log(f"\n{'='*60}")
        self.log(f"Test Summary: {passed} passed, {failed} failed out of {len(self.test_files)} total")
        self.log(f"{'='*60}\n")
        
        if failed == 0:
            self.status_var.set(f"All tests passed! ({passed}/{len(self.test_files)})")
        else:
            self.status_var.set(f"Some tests failed: {passed} passed, {failed} failed")


def main():
    """Main entry point."""
    # GUI runs locally on Windows desktop
    # Tests are executed in Docker containers via docker-compose exec
    
    root = tk.Tk()
    app = TestRunnerGUI(root)
    
    # Configure text tags for colors
    app.output_text.tag_config("success", foreground="green")
    app.output_text.tag_config("error", foreground="red")
    
    # Welcome message
    app.log("Mil-SQL Test Runner")
    app.log("=" * 60)
    app.log(f"Found {len(app.test_files)} test(s)")
    app.log("Tests will run in Docker containers.")
    app.log("Click a button above to run a test, or 'Run All Tests' to run everything.\n")
    
    root.mainloop()


if __name__ == "__main__":
    main()

