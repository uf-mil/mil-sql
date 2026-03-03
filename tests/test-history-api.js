/**
 * History API Integration Tests
 * 
 * These tests verify that backend API behavior matches what a user would experience
 * in the browser. If these tests pass, a user will 100% succeed at doing the same
 * thing in their browser (as long as the UI-only logic isn't broken).
 * 
 * Test Flow:
 * 1. Create ItemA
 * 2. Assert CREATE entry in history table
 * 3. Delete ItemA
 * 4. Assert DELETE entry in history table
 * 5. Undo delete ItemA
 * 6. Assert ItemA exists in master table
 * 7. Assert DELETE entry removed from history table
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const tough = require('tough-cookie');

// Configure axios to use cookies (same as browser)
const cookieJar = new tough.CookieJar();
const axiosWithCookies = wrapper(axios);

// Configuration
const API_BASE = process.env.API_URL || 'http://localhost:5000/api';
const TEST_EMAIL = 'test@ufl.edu';
const TEST_PASSWORD = 'test';

// Test state
let testResults = {
  passed: 0,
  failed: 0,
  errors: [],
};

// Helper to make authenticated requests (same as browser)
const api = axiosWithCookies.create({
  baseURL: API_BASE,
  withCredentials: true,
  jar: cookieJar,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Assertion helper
function assert(condition, message) {
  if (condition) {
    testResults.passed++;
    log(`  ✓ ${message}`, 'green');
    return true;
  } else {
    testResults.failed++;
    testResults.errors.push(message);
    log(`  ✗ ${message}`, 'red');
    return false;
  }
}

function assertEqual(actual, expected, message) {
  const passed = actual === expected;
  if (passed) {
    testResults.passed++;
    log(`  ✓ ${message}`, 'green');
  } else {
    testResults.failed++;
    testResults.errors.push(`${message} - Expected: ${expected}, Got: ${actual}`);
    log(`  ✗ ${message} - Expected: ${expected}, Got: ${actual}`, 'red');
  }
  return passed;
}

function assertExists(value, message) {
  return assert(value != null && value !== undefined, message);
}

function assertNotExists(value, message) {
  return assert(value == null || value === undefined, message);
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// API helpers (same as browser would use)
async function login() {
  const response = await api.post('/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  return response.data.user;
}

async function createSupply(name, description, teams = [], categories = []) {
  const response = await api.post('/supplies', {
    name,
    description,
    teams,
    categories,
  });
  return response.data;
}

async function deleteSupply(supplyId) {
  await api.delete(`/supplies/${supplyId}`);
}

async function getSupply(supplyId) {
  try {
    const response = await api.get(`/supplies/${supplyId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function getAllSupplies() {
  const response = await api.get('/supplies');
  return response.data || [];
}

async function getSupplyHistory(filters = {}) {
  const params = new URLSearchParams();
  if (filters.supply_id) params.append('supply_id', filters.supply_id);
  if (filters.action_type) params.append('action_type', filters.action_type);
  
  const url = params.toString() ? `/supplies/history?${params}` : '/supplies/history';
  const response = await api.get(url);
  return response.data.history || [];
}

async function undoSupplyHistory(historyId) {
  const response = await api.post(`/supplies/history/${historyId}/undo`);
  return response.data;
}

async function getCategories() {
  const response = await api.get('/categories');
  return response.data.categories || [];
}

async function getTeams() {
  const response = await api.get('/teams');
  return response.data.teams || [];
}

// Test functions
async function testCreateItem() {
  log('\n[TEST 1] Creating ItemA...', 'cyan');
  
  const categories = await getCategories();
  const teams = await getTeams();
  
  if (categories.length === 0 || teams.length === 0) {
    log('  ✗ Cannot create item: need at least one category and one team', 'red');
    testResults.failed++;
    return null;
  }
  
  const timestamp = Date.now();
  const itemName = `ItemA-${timestamp}`;
  
  // Ensure we have valid team and category data
  const teamName = teams[0]?.name || teams[0];
  const categoryId = categories[0]?.id || categories[0];
  
  if (!teamName || !categoryId) {
    log('  ✗ Cannot create item: invalid team or category data', 'red');
    testResults.failed++;
    return null;
  }
  
  const supply = await createSupply(
    itemName,
    'Test item for history API tests',
    [teamName],
    [categoryId]
  );
  
  assertExists(supply, 'ItemA was created');
  assertExists(supply.id, 'ItemA has an ID');
  assertEqual(supply.name, itemName, 'ItemA has correct name');
  
  await delay(500); // Give DB time to commit
  
  return { supply, itemName };
}

async function testAssertCreateInHistory(itemName, supplyId) {
  log('\n[TEST 2] Asserting CREATE entry in history table...', 'cyan');
  
  const history = await getSupplyHistory({ supply_id: supplyId });
  
  const createEntry = history.find(
    entry => entry.action_type === 'CREATE' && 
             (entry.supply_name === itemName || entry.new_name === itemName)
  );
  
  assertExists(createEntry, 'CREATE entry exists in history');
  
  if (createEntry) {
    assertEqual(createEntry.action_type, 'CREATE', 'History entry has correct action type');
    assertEqual(createEntry.supply_id, supplyId, 'History entry has correct supply_id');
    assertEqual(createEntry.new_name, itemName, 'History entry has correct item name');
    assertExists(createEntry.id, 'History entry has an ID');
  }
  
  return createEntry;
}

async function testDeleteItem(supplyId, itemName) {
  log('\n[TEST 3] Deleting ItemA...', 'cyan');
  
  await deleteSupply(supplyId);
  
  // Verify item is deleted
  const deletedItem = await getSupply(supplyId);
  assertNotExists(deletedItem, 'ItemA is deleted from master table');
  
  await delay(500); // Give DB time to commit
  
  return true;
}

async function testAssertDeleteInHistory(supplyId, itemName) {
  log('\n[TEST 4] Asserting DELETE entry in history table...', 'cyan');
  
  // After deletion, supply_id is NULL, so we need to search all history by name
  // or search by action_type DELETE
  const history = await getSupplyHistory({ action_type: 'DELETE' });
  
  const deleteEntry = history.find(
    entry => (entry.supply_name === itemName || entry.old_name === itemName) &&
             entry.action_type === 'DELETE'
  );
  
  assertExists(deleteEntry, 'DELETE entry exists in history');
  
  if (deleteEntry) {
    assertEqual(deleteEntry.action_type, 'DELETE', 'History entry has correct action type');
    assertEqual(deleteEntry.old_name, itemName, 'History entry has correct item name');
    assertExists(deleteEntry.id, 'History entry has an ID');
    // After deletion, supply_id should be NULL (due to ON DELETE SET NULL)
    assertEqual(deleteEntry.supply_id, null, 'History entry has NULL supply_id after deletion');
  }
  
  return deleteEntry;
}

async function testUndoDelete(deleteHistoryId, supplyId, itemName) {
  log('\n[TEST 5] Undoing delete ItemA...', 'cyan');
  
  const result = await undoSupplyHistory(deleteHistoryId);
  
  assertExists(result, 'Undo operation returned a result');
  assertEqual(result.success, true, 'Undo operation was successful');
  
  await delay(500); // Give DB time to commit
  
  // Return the restored supply_id if available (for DELETE undo, it might be a new ID)
  return result.restored_supply_id || supplyId;
}

async function testAssertItemExists(supplyId, itemName, restoredSupplyId = null) {
  log('\n[TEST 6] Asserting ItemA exists in master table...', 'cyan');
  
  // After DELETE undo, the supply might have a new ID, so try both
  let supply = null;
  if (restoredSupplyId) {
    supply = await getSupply(restoredSupplyId);
    if (supply) {
      supplyId = restoredSupplyId; // Update for subsequent tests
    }
  }
  
  // If not found by restored ID, try original ID
  if (!supply) {
    supply = await getSupply(supplyId);
  }
  
  // If still not found, try finding by name
  if (!supply) {
    const allSupplies = await getAllSupplies();
    supply = allSupplies.find(s => s.name === itemName);
    if (supply) {
      supplyId = supply.id; // Update for subsequent tests
    }
  }
  
  assertExists(supply, 'ItemA exists in master table');
  
  if (supply) {
    assertEqual(supply.name, itemName, 'ItemA has correct name');
  }
  
  return { supply, supplyId };
}

async function testAssertDeleteRemovedFromHistory(supplyId, deleteHistoryId, itemName) {
  log('\n[TEST 7] Asserting DELETE entry removed from history table...', 'cyan');
  
  // After undo, supply_id might be different (new ID), so search all history by name
  const allHistory = await getSupplyHistory();
  
  const deleteEntry = allHistory.find(entry => entry.id === deleteHistoryId);
  
  assertNotExists(deleteEntry, 'DELETE entry is removed from history');
  
  // Also verify CREATE entry still exists (search by name since supply_id might have changed)
  const createEntry = allHistory.find(
    entry => entry.action_type === 'CREATE' && 
             (entry.supply_name === itemName || entry.new_name === itemName)
  );
  
  assertExists(createEntry, 'CREATE entry still exists in history after undo');
  
  // Note: The CREATE entry's supply_id may be NULL if the supply was deleted and recreated
  // This is expected behavior - history entries reflect the state when they were created
  // and are not updated when supplies are recreated
  
  return true;
}

// Main test runner
async function runTests() {
  log('\n' + '='.repeat(70), 'bright');
  log('HISTORY API INTEGRATION TESTS', 'bright');
  log('='.repeat(70), 'bright');
  log('\nThese tests verify backend API behavior matches browser behavior.\n', 'yellow');
  
  let testState = {
    supplyId: null,
    itemName: null,
    createHistoryId: null,
    deleteHistoryId: null,
  };
  
  try {
    // Login
    log('[SETUP] Logging in...', 'cyan');
    const user = await login();
    assertExists(user, 'Login successful');
    log(`  ✓ Logged in as ${user.email}\n`, 'green');
    
    // Test 1: Create ItemA
    const createResult = await testCreateItem();
    if (!createResult) {
      log('\n✗ Cannot continue tests without creating item', 'red');
      return;
    }
    testState.supplyId = createResult.supply.id;
    testState.itemName = createResult.itemName;
    
    // Test 2: Assert CREATE in history
    const createEntry = await testAssertCreateInHistory(testState.itemName, testState.supplyId);
    if (createEntry) {
      testState.createHistoryId = createEntry.id;
    }
    
    // Test 3: Delete ItemA
    await testDeleteItem(testState.supplyId, testState.itemName);
    
    // Test 4: Assert DELETE in history
    const deleteEntry = await testAssertDeleteInHistory(testState.supplyId, testState.itemName);
    if (deleteEntry) {
      testState.deleteHistoryId = deleteEntry.id;
    }
    
    // Test 5: Undo delete
    let restoredSupplyId = null;
    if (testState.deleteHistoryId) {
      restoredSupplyId = await testUndoDelete(testState.deleteHistoryId, testState.supplyId, testState.itemName);
    }
    
    // Test 6: Assert item exists
    const itemResult = await testAssertItemExists(testState.supplyId, testState.itemName, restoredSupplyId);
    if (itemResult.supply) {
      testState.supplyId = itemResult.supplyId; // Update supply_id in case it changed
    }
    
    // Test 7: Assert DELETE removed from history
    if (testState.deleteHistoryId) {
      await testAssertDeleteRemovedFromHistory(
        testState.supplyId,
        testState.deleteHistoryId,
        testState.itemName
      );
    }
    
  } catch (error) {
    log(`\n✗ Test execution failed: ${error.message}`, 'red');
    if (error.response) {
      log(`  Response: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    testResults.failed++;
    testResults.errors.push(`Test execution error: ${error.message}`);
  }
  
  // Print summary
  log('\n' + '='.repeat(70), 'bright');
  log('TEST SUMMARY', 'bright');
  log('='.repeat(70), 'bright');
  log(`\nPassed: ${testResults.passed}`, testResults.passed > 0 ? 'green' : 'reset');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'reset');
  
  if (testResults.errors.length > 0) {
    log('\nErrors:', 'red');
    testResults.errors.forEach((error, idx) => {
      log(`  ${idx + 1}. ${error}`, 'red');
    });
  }
  
  log('\n' + '='.repeat(70) + '\n', 'bright');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    log(`\n✗ Unhandled error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runTests };
