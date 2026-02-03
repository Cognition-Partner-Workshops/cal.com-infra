#!/opt/homebrew/opt/node/bin/node
import * as cdk from 'aws-cdk-lib/core';
import { CalComInfrastructureStack } from '../lib/cal.com-infrastructure-stack';

const app = new cdk.App();

const environment = (app.node.tryGetContext('environment') as 'development' | 'staging' | 'production') ?? 'development';

new CalComInfrastructureStack(app, `CalComInfrastructureStack-${environment}`, {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  environment: environment,
  enableMultiAz: app.node.tryGetContext('enableMultiAz') === 'true',
  enableReadReplica: app.node.tryGetContext('enableReadReplica') === 'true',
  enableRdsProxy: app.node.tryGetContext('enableRdsProxy') === 'true',
});
