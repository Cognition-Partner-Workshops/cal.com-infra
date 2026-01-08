import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as CalComInfrastructure from '../lib/cal.com-infrastructure-stack';

describe('CalComInfrastructureStack', () => {
  let app: cdk.App;
  let stack: CalComInfrastructure.CalComInfrastructureStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new CalComInfrastructure.CalComInfrastructureStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  describe('VPC Configuration', () => {
    test('should create a VPC with 2 availability zones', () => {
      template.resourceCountIs('AWS::EC2::VPC', 1);
    });

    test('should create public subnets', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        MapPublicIpOnLaunch: true,
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'aws-cdk:subnet-type',
            Value: 'Public',
          }),
        ]),
      });
    });

    test('should create private subnets with egress', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'aws-cdk:subnet-type',
            Value: 'Private',
          }),
        ]),
      });
    });

    test('should create isolated subnets', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'aws-cdk:subnet-type',
            Value: 'Isolated',
          }),
        ]),
      });
    });

    test('should create a NAT gateway', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('should create an Internet Gateway', () => {
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);
    });
  });

  describe('Security Group Configuration', () => {
    test('should create a security group for the database', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Cal.com RDS PostgreSQL database',
      });
    });

    test('should allow PostgreSQL port 5432 ingress', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            IpProtocol: 'tcp',
            FromPort: 5432,
            ToPort: 5432,
            CidrIp: '0.0.0.0/0',
          }),
        ]),
      });
    });
  });

  describe('Secrets Manager Configuration', () => {
    test('should create a secret for database credentials', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'calcom-db-credentials',
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
    test('should create a PostgreSQL database instance', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
        DBName: 'calcom',
      });
    });

    test('should use t3.micro instance type', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t3.micro',
      });
    });

    test('should configure storage settings', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        AllocatedStorage: '20',
        MaxAllocatedStorage: 100,
        StorageType: 'gp3',
      });
    });

    test('should configure backup retention', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 7,
        DeleteAutomatedBackups: true,
      });
    });

    test('should be publicly accessible', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PubliclyAccessible: true,
      });
    });

    test('should not be multi-AZ', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: false,
      });
    });

    test('should not have deletion protection', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DeletionProtection: false,
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    test('should output database endpoint', () => {
      template.hasOutput('DBEndpoint', {
        Description: 'Database endpoint address',
        Export: {
          Name: 'CalComDBEndpoint',
        },
      });
    });

    test('should output database port', () => {
      template.hasOutput('DBPort', {
        Description: 'Database port',
        Export: {
          Name: 'CalComDBPort',
        },
      });
    });

    test('should output database name', () => {
      template.hasOutput('DBName', {
        Value: 'calcom',
        Description: 'Database name',
        Export: {
          Name: 'CalComDBName',
        },
      });
    });

    test('should output credentials secret ARN', () => {
      template.hasOutput('DBCredentialsSecretArn', {
        Description: 'ARN of the secret containing database credentials',
        Export: {
          Name: 'CalComDBCredentialsSecretArn',
        },
      });
    });

    test('should output credentials secret name', () => {
      template.hasOutput('DBCredentialsSecretName', {
        Description: 'Name of the secret containing database credentials',
        Export: {
          Name: 'CalComDBCredentialsSecretName',
        },
      });
    });

    test('should output VPC ID', () => {
      template.hasOutput('VPCId', {
        Description: 'VPC ID',
        Export: {
          Name: 'CalComVPCId',
        },
      });
    });
  });

  describe('Stack Properties', () => {
    test('should create stack with provided id', () => {
      expect(stack.stackName).toBe('TestStack');
    });

    test('should create stack with custom props', () => {
      const customApp = new cdk.App();
      const customStack = new CalComInfrastructure.CalComInfrastructureStack(customApp, 'CustomStack', {
        env: { account: '123456789012', region: 'us-west-2' },
      });
      expect(customStack.account).toBe('123456789012');
      expect(customStack.region).toBe('us-west-2');
    });
  });

  describe('Resource Count Verification', () => {
    test('should create exactly 6 subnets (2 AZs x 3 types)', () => {
      template.resourceCountIs('AWS::EC2::Subnet', 6);
    });

    test('should create route tables', () => {
      const routeTables = template.findResources('AWS::EC2::RouteTable');
      expect(Object.keys(routeTables).length).toBeGreaterThanOrEqual(3);
    });

    test('should create exactly 1 RDS instance', () => {
      template.resourceCountIs('AWS::RDS::DBInstance', 1);
    });

    test('should create exactly 1 secret', () => {
      template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    });
  });
});
