// Main test orchestrator - imports all modular test files
// This file serves as the entry point for all tests

// Import all test modules
import './core-functionality.test';
import './authorization.test';
import './state-machine.test';
import './account-integrity.test';
import './complex-workflows.test';

// The test runner will automatically discover and run all the describe blocks
// from the imported test files.
console.log("🚀 Running comprehensive Octasol Contract test suite...");
console.log("📁 Test modules loaded:");
console.log("  - Core Functionality Tests");
console.log("  - Authorization & Access Control Tests");
console.log("  - State Machine Integrity Tests");
console.log("  - Account & Data Integrity Tests");
console.log("  - Complex Workflow Scenario Tests");