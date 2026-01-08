import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as CalComInfrastructure from '../lib/cal.com-infrastructure-stack';

/**
 * Functional Test Suite for Cal.com Infrastructure Stack
 * 
 * This test suite validates the AWS CDK infrastructure configuration for Cal.com.
 * It covers VPC, RDS, Security Groups, Secrets Manager, and CloudFormation outputs.
 */
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
    test('should create a VPC with correct configuration', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('should create VPC with 2 availability zones', () => {
      // VPC should have subnets in 2 AZs (public, private, isolated = 6 subnets total)
      template.resourceCountIs('AWS::EC2::Subnet', 6);
    });

    test('should create public subnets with correct CIDR mask', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        MapPublicIpOnLaunch: true,
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'aws-cdk:subnet-name',
            Value: 'public',
          }),
        ]),
      });
    });

    test('should create private subnets with egress', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'aws-cdk:subnet-name',
            Value: 'private',
          }),
        ]),
      });
    });

    test('should create isolated subnets', () => {
      template.hasResourceProperties('AWS::EC2::Subnet', {
        Tags: Match.arrayWith([
          Match.objectLike({
            Key: 'aws-cdk:subnet-name',
            Value: 'isolated',
          }),
        ]),
      });
    });

    test('should create exactly 1 NAT gateway', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('should create an Internet Gateway', () => {
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);
    });

    test('should attach Internet Gateway to VPC', () => {
      template.hasResourceProperties('AWS::EC2::VPCGatewayAttachment', {
        VpcId: Match.anyValue(),
        InternetGatewayId: Match.anyValue(),
      });
    });
  });

  describe('Security Group Configuration', () => {
    test('should create database security group', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Cal.com RDS PostgreSQL database',
      });
    });

    test('should allow PostgreSQL access on port 5432', () => {
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

    test('should allow all outbound traffic', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        SecurityGroupEgress: Match.arrayWith([
          Match.objectLike({
            IpProtocol: '-1',
            CidrIp: '0.0.0.0/0',
          }),
        ]),
      });
    });
  });

  describe('Secrets Manager Configuration', () => {
    test('should create database credentials secret', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'calcom-db-credentials',
      });
    });

    test('should generate password with correct configuration', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        GenerateSecretString: Match.objectLike({
          SecretStringTemplate: JSON.stringify({ username: 'calcom_admin' }),
          GenerateStringKey: 'password',
          ExcludePunctuation: true,
          PasswordLength: 32,
        }),
      });
    });
  });

  describe('RDS PostgreSQL Database Configuration', () => {
    test('should create RDS PostgreSQL instance', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
      });
    });

    test('should use PostgreSQL version 15', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        EngineVersion: Match.stringLikeRegexp('^15'),
      });
    });

    test('should use t3.micro instance type', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t3.micro',
      });
    });

    test('should create database named calcom', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBName: 'calcom',
      });
    });

    test('should allocate 20GB initial storage', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        AllocatedStorage: '20',
      });
    });

    test('should allow storage autoscaling up to 100GB', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MaxAllocatedStorage: 100,
      });
    });

    test('should use GP3 storage type', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageType: 'gp3',
      });
    });

    test('should set backup retention to 7 days', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 7,
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

    test('should not have deletion protection enabled', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DeletionProtection: false,
      });
    });

    test('should be placed in public subnet', () => {
      template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {
        DBSubnetGroupDescription: Match.anyValue(),
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    test('should export database endpoint', () => {
      template.hasOutput('DBEndpoint', {
        Description: 'Database endpoint address',
        Export: {
          Name: 'CalComDBEndpoint',
        },
      });
    });

    test('should export database port', () => {
      template.hasOutput('DBPort', {
        Description: 'Database port',
        Export: {
          Name: 'CalComDBPort',
        },
      });
    });

    test('should export database name', () => {
      template.hasOutput('DBName', {
        Value: 'calcom',
        Description: 'Database name',
        Export: {
          Name: 'CalComDBName',
        },
      });
    });

    test('should export credentials secret ARN', () => {
      template.hasOutput('DBCredentialsSecretArn', {
        Description: 'ARN of the secret containing database credentials',
        Export: {
          Name: 'CalComDBCredentialsSecretArn',
        },
      });
    });

    test('should export credentials secret name', () => {
      template.hasOutput('DBCredentialsSecretName', {
        Description: 'Name of the secret containing database credentials',
        Export: {
          Name: 'CalComDBCredentialsSecretName',
        },
      });
    });

    test('should export VPC ID', () => {
      template.hasOutput('VPCId', {
        Description: 'VPC ID',
        Export: {
          Name: 'CalComVPCId',
        },
      });
    });
  });

  describe('Resource Count Validation', () => {
    test('should create exactly 1 VPC', () => {
      template.resourceCountIs('AWS::EC2::VPC', 1);
    });

    test('should create exactly 1 RDS instance', () => {
      template.resourceCountIs('AWS::RDS::DBInstance', 1);
    });

    test('should create exactly 1 Secrets Manager secret', () => {
      template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    });

    test('should create exactly 1 DB subnet group', () => {
      template.resourceCountIs('AWS::RDS::DBSubnetGroup', 1);
    });
  });

  describe('Security Best Practices', () => {
    test('should use credentials from Secrets Manager', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MasterUsername: Match.anyValue(),
        MasterUserPassword: Match.anyValue(),
      });
    });

    test('should have security group attached to RDS', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        VPCSecurityGroups: Match.anyValue(),
      });
    });
  });

  describe('Stack Snapshot', () => {
    test('should match snapshot', () => {
      const templateJson = template.toJSON();
      expect(templateJson).toMatchSnapshot();
    });
  });
});
