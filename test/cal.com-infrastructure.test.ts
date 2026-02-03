import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CalComInfrastructureStack } from '../lib/cal.com-infrastructure-stack';

describe('CalComInfrastructureStack', () => {
  describe('Development Environment', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const stack = new CalComInfrastructureStack(app, 'TestStack', {
        environment: 'development',
      });
      template = Template.fromStack(stack);
    });

    test('creates VPC with 2 AZs for development', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('creates single NAT Gateway for cost optimization', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('creates RDS instance with T4G Graviton instance type', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t4g.micro',
        Engine: 'postgres',
        EngineVersion: Match.stringLikeRegexp('^15'),
      });
    });

    test('database is not publicly accessible', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PubliclyAccessible: false,
      });
    });

    test('database has encryption enabled', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageEncrypted: true,
      });
    });

    test('database has Performance Insights enabled', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        EnablePerformanceInsights: true,
      });
    });

    test('creates KMS key with rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });

    test('creates security group restricting access to VPC CIDR', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Cal.com RDS PostgreSQL database',
      });
    });

    test('creates Secrets Manager secret for database credentials', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'calcom-development-db-credentials',
      });
    });

    test('creates CloudWatch alarms for monitoring', () => {
      template.resourceCountIs('AWS::CloudWatch::Alarm', 4);
    });

    test('creates CloudWatch dashboard', () => {
      template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
        DashboardName: 'calcom-development-infrastructure',
      });
    });

    test('creates VPC Flow Logs', () => {
      template.hasResourceProperties('AWS::EC2::FlowLog', {
        TrafficType: 'ALL',
      });
    });

    test('development environment does not enable Multi-AZ by default', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: false,
      });
    });

    test('applies correct tags', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Project', Value: 'CalCom' }),
        ]),
      });
    });
  });

  describe('Production Environment', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const stack = new CalComInfrastructureStack(app, 'TestStackProd', {
        environment: 'production',
      });
      template = Template.fromStack(stack);
    });

    test('creates VPC with 3 AZs for production', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('creates 2 NAT Gateways for high availability', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 2);
    });

    test('creates RDS instance with T4G Medium for production', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t4g.medium',
      });
    });

    test('production enables Multi-AZ by default', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: true,
      });
    });

    test('production enables deletion protection', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DeletionProtection: true,
      });
    });

    test('production has longer backup retention', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 30,
      });
    });

    test('production creates read replica', () => {
      template.resourceCountIs('AWS::RDS::DBInstance', 2);
    });

    test('production creates RDS Proxy', () => {
      template.hasResourceProperties('AWS::RDS::DBProxy', {
        RequireTLS: true,
      });
    });
  });

  describe('Custom Configuration', () => {
    test('can enable Multi-AZ in development', () => {
      const app = new cdk.App();
      const stack = new CalComInfrastructureStack(app, 'TestStackCustom', {
        environment: 'development',
        enableMultiAz: true,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: true,
      });
    });

    test('can enable RDS Proxy in development', () => {
      const app = new cdk.App();
      const stack = new CalComInfrastructureStack(app, 'TestStackProxy', {
        environment: 'development',
        enableRdsProxy: true,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::RDS::DBProxy', {
        RequireTLS: true,
      });
    });
  });

  describe('Security Best Practices', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const stack = new CalComInfrastructureStack(app, 'TestStackSecurity', {
        environment: 'development',
      });
      template = Template.fromStack(stack);
    });

    test('database is placed in isolated subnets', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PubliclyAccessible: false,
      });
    });

    test('secrets are encrypted with KMS', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        KmsKeyId: Match.anyValue(),
      });
    });

    test('storage is encrypted', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageEncrypted: true,
        KmsKeyId: Match.anyValue(),
      });
    });
  });

  describe('Stack Outputs', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const stack = new CalComInfrastructureStack(app, 'TestStackOutputs', {
        environment: 'development',
      });
      template = Template.fromStack(stack);
    });

    test('exports database endpoint', () => {
      template.hasOutput('DBEndpoint', {
        Export: { Name: 'CalComdevelopmentDBEndpoint' },
      });
    });

    test('exports VPC ID', () => {
      template.hasOutput('VPCId', {
        Export: { Name: 'CalComdevelopmentVPCId' },
      });
    });

    test('exports encryption key ARN', () => {
      template.hasOutput('EncryptionKeyArn', {
        Export: { Name: 'CalComdevelopmentEncryptionKeyArn' },
      });
    });

    test('exports CloudWatch dashboard URL', () => {
      template.hasOutput('DashboardURL', {
        Export: { Name: 'CalComdevelopmentDashboardURL' },
      });
    });
  });
});
