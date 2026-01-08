import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CalComInfrastructureStack } from '../../lib/cal.com-infrastructure-stack';

interface PerformanceResult {
  testName: string;
  durationMs: number;
  thresholdMs: number;
  passed: boolean;
  details?: Record<string, unknown>;
}

interface PerformanceReport {
  timestamp: string;
  results: PerformanceResult[];
  allPassed: boolean;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    totalDurationMs: number;
  };
}

const THRESHOLDS = {
  STACK_SYNTHESIS: 10000, // 10 seconds
  TEMPLATE_GENERATION: 5000, // 5 seconds
  RESOURCE_COUNT_CHECK: 1000, // 1 second
};

function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return { result, durationMs: Math.round(end - start) };
}

describe('CDK Performance Tests', () => {
  let app: cdk.App;
  let stack: CalComInfrastructureStack;
  let template: Template;
  const results: PerformanceResult[] = [];

  beforeAll(() => {
    // Measure stack synthesis time
    const synthResult = measureTime(() => {
      const testApp = new cdk.App();
      return new CalComInfrastructureStack(testApp, 'TestStack', {
        env: { account: '123456789012', region: 'us-east-1' },
      });
    });

    app = new cdk.App();
    stack = synthResult.result;

    results.push({
      testName: 'Stack Synthesis',
      durationMs: synthResult.durationMs,
      thresholdMs: THRESHOLDS.STACK_SYNTHESIS,
      passed: synthResult.durationMs <= THRESHOLDS.STACK_SYNTHESIS,
    });

    // Measure template generation time
    const templateResult = measureTime(() => {
      return Template.fromStack(stack);
    });

    template = templateResult.result;

    results.push({
      testName: 'Template Generation',
      durationMs: templateResult.durationMs,
      thresholdMs: THRESHOLDS.TEMPLATE_GENERATION,
      passed: templateResult.durationMs <= THRESHOLDS.TEMPLATE_GENERATION,
    });
  });

  afterAll(() => {
    const report: PerformanceReport = {
      timestamp: new Date().toISOString(),
      results,
      allPassed: results.every((r) => r.passed),
      summary: {
        totalTests: results.length,
        passedTests: results.filter((r) => r.passed).length,
        failedTests: results.filter((r) => !r.passed).length,
        totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      },
    };

    console.log('\n=== CDK Performance Test Report ===');
    console.log(JSON.stringify(report, null, 2));
  });

  test('Stack synthesis should complete within threshold', () => {
    const synthResult = results.find((r) => r.testName === 'Stack Synthesis');
    expect(synthResult).toBeDefined();
    expect(synthResult!.passed).toBe(true);
    console.log(`Stack synthesis: ${synthResult!.durationMs}ms (threshold: ${synthResult!.thresholdMs}ms)`);
  });

  test('Template generation should complete within threshold', () => {
    const templateResult = results.find((r) => r.testName === 'Template Generation');
    expect(templateResult).toBeDefined();
    expect(templateResult!.passed).toBe(true);
    console.log(`Template generation: ${templateResult!.durationMs}ms (threshold: ${templateResult!.thresholdMs}ms)`);
  });

  test('Resource count check should complete within threshold', () => {
    const countResult = measureTime(() => {
      const resources = template.toJSON().Resources || {};
      return Object.keys(resources).length;
    });

    results.push({
      testName: 'Resource Count Check',
      durationMs: countResult.durationMs,
      thresholdMs: THRESHOLDS.RESOURCE_COUNT_CHECK,
      passed: countResult.durationMs <= THRESHOLDS.RESOURCE_COUNT_CHECK,
      details: { resourceCount: countResult.result },
    });

    console.log(`Resource count: ${countResult.result} resources in ${countResult.durationMs}ms`);
    expect(countResult.durationMs).toBeLessThanOrEqual(THRESHOLDS.RESOURCE_COUNT_CHECK);
  });

  test('VPC resource should be present', () => {
    const checkResult = measureTime(() => {
      try {
        template.hasResourceProperties('AWS::EC2::VPC', {});
        return true;
      } catch {
        return false;
      }
    });

    results.push({
      testName: 'VPC Resource Check',
      durationMs: checkResult.durationMs,
      thresholdMs: THRESHOLDS.RESOURCE_COUNT_CHECK,
      passed: checkResult.result && checkResult.durationMs <= THRESHOLDS.RESOURCE_COUNT_CHECK,
      details: { hasVpc: checkResult.result },
    });

    console.log(`VPC check: ${checkResult.durationMs}ms`);
    expect(checkResult.result).toBe(true);
  });

  test('RDS instance should be present', () => {
    const checkResult = measureTime(() => {
      try {
        template.hasResourceProperties('AWS::RDS::DBInstance', {});
        return true;
      } catch {
        return false;
      }
    });

    results.push({
      testName: 'RDS Resource Check',
      durationMs: checkResult.durationMs,
      thresholdMs: THRESHOLDS.RESOURCE_COUNT_CHECK,
      passed: checkResult.result && checkResult.durationMs <= THRESHOLDS.RESOURCE_COUNT_CHECK,
      details: { hasRds: checkResult.result },
    });

    console.log(`RDS check: ${checkResult.durationMs}ms`);
    expect(checkResult.result).toBe(true);
  });

  test('Security group should be present', () => {
    const checkResult = measureTime(() => {
      try {
        template.hasResourceProperties('AWS::EC2::SecurityGroup', {});
        return true;
      } catch {
        return false;
      }
    });

    results.push({
      testName: 'Security Group Check',
      durationMs: checkResult.durationMs,
      thresholdMs: THRESHOLDS.RESOURCE_COUNT_CHECK,
      passed: checkResult.result && checkResult.durationMs <= THRESHOLDS.RESOURCE_COUNT_CHECK,
      details: { hasSecurityGroup: checkResult.result },
    });

    console.log(`Security group check: ${checkResult.durationMs}ms`);
    expect(checkResult.result).toBe(true);
  });
});
