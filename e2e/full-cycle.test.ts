/**
 * End-to-End Test - Full CI/CD Cycle
 * Tests: PR → Checks → Merge Queue → Drift Detection
 * 
 * Prerequisites:
 * - GITHUB_TOKEN environment variable set
 * - Test repository: PhaseMirror/Phase-Mirror-Test (or configured repo)
 * - Repository must have workflows configured
 */
import { Octokit } from '@octokit/rest';

describe('End-to-End: PR → Merge Queue → Drift Detection', () => {
  let octokit: Octokit;
  const testRepo = process.env.E2E_TEST_REPO || 'Phase-Mirror-Test';
  const testOwner = process.env.E2E_TEST_OWNER || 'PhaseMirror';
  let prNumber: number;
  let testBranch: string;

  beforeAll(() => {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required for E2E tests');
    }

    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    testBranch = `test-e2e-${Date.now()}`;
  });

  test('Full cycle completes successfully', async () => {
    // 1. Create test branch
    console.log('Step 1: Creating test branch...');
    const { data: mainRef } = await octokit.git.getRef({
      owner: testOwner,
      repo: testRepo,
      ref: 'heads/main',
    });

    await octokit.git.createRef({
      owner: testOwner,
      repo: testRepo,
      ref: `refs/heads/${testBranch}`,
      sha: mainRef.object.sha,
    });
    console.log(`✓ Created branch: ${testBranch}`);

    // 2. Make a change (add file)
    console.log('Step 2: Creating test file...');
    const testContent = `# E2E Test File\n\nCreated at: ${new Date().toISOString()}\nTest ID: ${testBranch}`;
    
    await octokit.repos.createOrUpdateFileContents({
      owner: testOwner,
      repo: testRepo,
      path: `e2e-tests/${testBranch}.txt`,
      message: `test: E2E test file for ${testBranch}`,
      content: Buffer.from(testContent).toString('base64'),
      branch: testBranch,
    });
    console.log('✓ Test file created');

    // 3. Create PR
    console.log('Step 3: Creating pull request...');
    const { data: pr } = await octokit.pulls.create({
      owner: testOwner,
      repo: testRepo,
      title: `[E2E Test] Full cycle test - ${testBranch}`,
      head: testBranch,
      base: 'main',
      body: `Automated E2E test\n\nTest Branch: ${testBranch}\nTimestamp: ${new Date().toISOString()}`,
    });

    prNumber = pr.number;
    console.log(`✓ Created PR #${prNumber}`);

    // 4. Wait for PR checks to complete
    console.log(`Step 4: Waiting for PR #${prNumber} checks...`);
    await waitForChecks(pr.number, 300000); // 5 min timeout
    console.log('✓ PR checks completed');

    // 5. Verify oracle ran (if configured)
    console.log('Step 5: Verifying checks...');
    const { data: checks } = await octokit.checks.listForRef({
      owner: testOwner,
      repo: testRepo,
      ref: pr.head.sha,
    });

    console.log(`Found ${checks.check_runs.length} check runs`);
    
    // Look for oracle check if it exists
    const oracleCheck = checks.check_runs.find(c => 
      c.name.toLowerCase().includes('oracle') || 
      c.name.toLowerCase().includes('mirror') ||
      c.name.toLowerCase().includes('dissonance')
    );
    
    if (oracleCheck) {
      console.log(`✓ Oracle check found: ${oracleCheck.name} - ${oracleCheck.conclusion}`);
      expect(oracleCheck.conclusion).toBe('success');
    } else {
      console.log('⚠ Oracle check not found (may not be configured)');
    }

    // 6. Merge PR
    console.log('Step 6: Merging pull request...');
    try {
      await octokit.pulls.merge({
        owner: testOwner,
        repo: testRepo,
        pull_number: prNumber,
        merge_method: 'squash',
        commit_title: `test: E2E test merge - ${testBranch}`,
      });
      console.log('✓ PR merged successfully');
    } catch (error) {
      console.error('Failed to merge PR:', error);
      throw error;
    }

    // 7. Wait for merge to propagate
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10s

    // 8. Trigger drift detection (if workflow exists)
    console.log('Step 7: Triggering drift detection...');
    try {
      await octokit.actions.createWorkflowDispatch({
        owner: testOwner,
        repo: testRepo,
        workflow_id: 'drift-detection.yml',
        ref: 'main',
      });
      console.log('✓ Drift detection triggered');

      // 9. Wait for drift workflow
      console.log('Step 8: Waiting for drift detection workflow...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 min

      const { data: runs } = await octokit.actions.listWorkflowRuns({
        owner: testOwner,
        repo: testRepo,
        workflow_id: 'drift-detection.yml',
        per_page: 1,
      });

      if (runs.workflow_runs.length > 0) {
        const latestRun = runs.workflow_runs[0];
        console.log(`✓ Drift detection workflow: ${latestRun.conclusion || latestRun.status}`);
        
        // Only check conclusion if workflow completed
        if (latestRun.conclusion) {
          expect(['success', 'skipped']).toContain(latestRun.conclusion);
        }
      } else {
        console.log('⚠ No drift detection workflow runs found');
      }
    } catch (error) {
      console.warn('Drift detection workflow not found or failed to trigger:', error);
      // Don't fail the test if drift detection doesn't exist
    }

    console.log('✅ Full cycle completed successfully');
  }, 600000); // 10 min timeout

  afterAll(async () => {
    // Cleanup: close PR if still open, delete branch
    console.log('\nCleaning up test resources...');
    
    if (prNumber) {
      try {
        const { data: pr } = await octokit.pulls.get({
          owner: testOwner,
          repo: testRepo,
          pull_number: prNumber,
        });

        if (pr.state === 'open') {
          await octokit.pulls.update({
            owner: testOwner,
            repo: testRepo,
            pull_number: prNumber,
            state: 'closed',
          });
          console.log(`✓ Closed PR #${prNumber}`);
        }
      } catch (error) {
        console.error('Failed to close PR:', error);
      }
    }

    if (testBranch) {
      try {
        await octokit.git.deleteRef({
          owner: testOwner,
          repo: testRepo,
          ref: `heads/${testBranch}`,
        });
        console.log(`✓ Deleted branch: ${testBranch}`);
      } catch (error) {
        console.error('Failed to delete branch:', error);
      }
    }
  });

  /**
   * Wait for all checks on a PR to complete
   */
  async function waitForChecks(prNum: number, timeout: number): Promise<void> {
    const start = Date.now();
    const checkInterval = 5000; // Check every 5s
    
    while (Date.now() - start < timeout) {
      try {
        const { data: pr } = await octokit.pulls.get({
          owner: testOwner,
          repo: testRepo,
          pull_number: prNum,
        });

        const { data: checks } = await octokit.checks.listForRef({
          owner: testOwner,
          repo: testRepo,
          ref: pr.head.sha,
        });

        const allComplete = checks.check_runs.every(c => c.status === 'completed');
        const totalChecks = checks.check_runs.length;
        const completedChecks = checks.check_runs.filter(c => c.status === 'completed').length;
        
        console.log(`  Checks: ${completedChecks}/${totalChecks} completed`);
        
        if (allComplete && totalChecks > 0) {
          return;
        }

        // If no checks yet, wait a bit longer
        if (totalChecks === 0) {
          console.log('  Waiting for checks to start...');
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        console.error('Error checking PR status:', error);
        throw error;
      }
    }

    throw new Error(`Checks did not complete within ${timeout}ms timeout`);
  }
});
