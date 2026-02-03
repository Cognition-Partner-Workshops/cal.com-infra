#!/opt/homebrew/opt/node/bin/node
/**
 * @fileoverview CDK Application Entry Point for Cal.com Infrastructure
 *
 * This is the main executable that bootstraps the AWS CDK application.
 * It initializes the CDK App construct and instantiates the CalComInfrastructureStack
 * with environment-specific configuration.
 *
 * @module cal.com-infrastructure
 *
 * @example
 * // Execute via CDK CLI (recommended)
 * npx cdk synth    // Generate CloudFormation template
 * npx cdk deploy   // Deploy to AWS
 * npx cdk diff     // Preview changes before deployment
 *
 * @example
 * // Execute directly with ts-node
 * npx ts-node --prefer-ts-exts bin/cal.com-infrastructure.ts
 *
 * @requires CDK_DEFAULT_ACCOUNT - AWS account ID (set by CDK CLI or manually)
 * @requires CDK_DEFAULT_REGION - AWS region (set by CDK CLI or manually)
 */

import * as cdk from 'aws-cdk-lib/core';
import { CalComInfrastructureStack } from '../lib/cal.com-infrastructure-stack';

/**
 * CDK Application instance.
 *
 * The App construct is the root of the CDK construct tree. All stacks
 * and constructs are defined within the scope of this application.
 */
const app = new cdk.App();

/**
 * Instantiate the Cal.com Infrastructure Stack.
 *
 * The stack is configured with environment variables that specify the target
 * AWS account and region. These are typically set by the CDK CLI based on
 * your AWS credentials and configuration, but can also be set manually:
 *
 * @example
 * // Set environment variables manually
 * export CDK_DEFAULT_ACCOUNT="123456789012"
 * export CDK_DEFAULT_REGION="us-east-1"
 *
 * @see {@link CalComInfrastructureStack} for details on provisioned resources
 */
new CalComInfrastructureStack(app, 'CalComInfrastructureStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});
