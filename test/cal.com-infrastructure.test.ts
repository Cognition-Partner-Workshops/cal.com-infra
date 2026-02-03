import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CalComInfrastructureStack } from '../lib/cal.com-infrastructure-stack';

describe('CalComInfrastructureStack', () => {
  let app: cdk.App;
  let stack: CalComInfrastructureStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new CalComInfrastructureStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  describe('VPC Configuration', () => {
    test('creates a VPC with correct configuration', () => {
      template.resourceCountIs('AWS::EC2::VPC', 1);
    });

    test('creates VPC with 2 availability zones', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('creates public subnets', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        MapPublicIpOnLaunch: true,
      });
    });

    test('creates private subnets with egress', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        MapPublicIpOnLaunch: false,
      });
    });

    test('creates NAT gateway', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('creates internet gateway', () => {
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);
    });

    test('creates route tables', () => {
      const routeTables = template.findResources('AWS::EC2::RouteTable');
      expect(Object.keys(routeTables).length).toBeGreaterThan(0);
    });
  });

  describe('Security Group Configuration', () => {
    test('creates security group for database', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Cal.com RDS PostgreSQL database',
      });
    });

    test('security group allows PostgreSQL port 5432', () => {
      const securityGroups = template.findResources('AWS::EC2::SecurityGroup', {
        Properties: {
          GroupDescription: 'Security group for Cal.com RDS PostgreSQL database',
        },
      });
      const sgLogicalId = Object.keys(securityGroups)[0];
      const sg = securityGroups[sgLogicalId];
      expect(sg.Properties.SecurityGroupIngress).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            IpProtocol: 'tcp',
            FromPort: 5432,
            ToPort: 5432,
            CidrIp: '0.0.0.0/0',
          }),
        ])
      );
    });
  });

  describe('Secrets Manager Configuration', () => {
    test('creates secret for database credentials', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'calcom-db-credentials',
      });
    });

    test('secret generates password with correct settings', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        GenerateSecretString: {
          SecretStringTemplate: JSON.stringify({ username: 'calcom_admin' }),
          GenerateStringKey: 'password',
          ExcludePunctuation: true,
          IncludeSpace: false,
          PasswordLength: 32,
        },
      });
    });
  });

  describe('RDS Database Configuration', () => {
    test('creates RDS database instance', () => {
      template.resourceCountIs('AWS::RDS::DBInstance', 1);
    });

    test('database uses PostgreSQL engine', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
      });
    });

    test('database uses PostgreSQL version 15', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
        EngineVersion: Match.stringLikeRegexp('^15'),
      });
    });

    test('database uses t3.micro instance type', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t3.micro',
      });
    });

    test('database name is calcom', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBName: 'calcom',
      });
    });

    test('database has 20GB allocated storage', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        AllocatedStorage: '20',
      });
    });

    test('database has max 100GB allocated storage', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MaxAllocatedStorage: 100,
      });
    });

    test('database uses GP3 storage type', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageType: 'gp3',
      });
    });

    test('database has 7 day backup retention', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 7,
      });
    });

    test('database is publicly accessible', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PubliclyAccessible: true,
      });
    });

    test('database is not multi-AZ', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: false,
      });
    });

    test('database deletion protection is disabled', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DeletionProtection: false,
      });
    });

    test('database deletes automated backups on deletion', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DeleteAutomatedBackups: true,
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    test('exports database endpoint', () => {
      template.hasOutput('DBEndpoint', {
        Export: {
          Name: 'CalComDBEndpoint',
        },
      });
    });

    test('exports database port', () => {
      template.hasOutput('DBPort', {
        Export: {
          Name: 'CalComDBPort',
        },
      });
    });

    test('exports database name', () => {
      template.hasOutput('DBName', {
        Value: 'calcom',
        Export: {
          Name: 'CalComDBName',
        },
      });
    });

    test('exports credentials secret ARN', () => {
      template.hasOutput('DBCredentialsSecretArn', {
        Export: {
          Name: 'CalComDBCredentialsSecretArn',
        },
      });
    });

    test('exports credentials secret name', () => {
      template.hasOutput('DBCredentialsSecretName', {
        Export: {
          Name: 'CalComDBCredentialsSecretName',
        },
      });
    });

    test('exports VPC ID', () => {
      template.hasOutput('VPCId', {
        Export: {
          Name: 'CalComVPCId',
        },
      });
    });
  });

  describe('Stack Properties', () => {
    test('stack can be instantiated', () => {
      expect(stack).toBeDefined();
    });

    test('stack has correct construct id', () => {
      expect(stack.node.id).toBe('TestStack');
    });
  });
});
