#!/opt/homebrew/opt/node/bin/node
import * as cdk from 'aws-cdk-lib/core';
import { CalComInfrastructureStack } from '../lib/cal.com-infrastructure-stack';

const app = new cdk.App();
new CalComInfrastructureStack(app, 'CalComStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});
