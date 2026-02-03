import { getChangedFiles, getCurrentBranch, getCurrentCommit, getRepositoryName } from './packages/cli/dist/lib/git.js';

async function test() {
  console.log('Testing Git Functions\n');
  console.log('='.repeat(50));
  
  // Test synchronous functions
  console.log('\nSync Functions:');
  console.log('  Current Branch:', getCurrentBranch());
  console.log('  Current Commit:', getCurrentCommit().substring(0, 10) + '...');
  console.log('  Repository:', getRepositoryName());
  
  // Test getChangedFiles with drift mode (safest as it just lists files)
  console.log('\nAsync Functions:');
  try {
    const files = await getChangedFiles('drift');
    console.log(`  getChangedFiles('drift'): Found ${files.length} YAML files`);
    if (files.length > 0) {
      console.log(`  Sample files: ${files.slice(0, 3).join(', ')}`);
    }
  } catch (error) {
    console.log(`  Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('All tests completed!');
}

test();
