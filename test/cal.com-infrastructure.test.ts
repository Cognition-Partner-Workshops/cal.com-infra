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
    test('creates a VPC with correct configuration', () => {
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

    test('creates NAT Gateway', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('creates Internet Gateway', () => {
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);
    });
  });

  describe('Security Group Configuration', () => {
    test('creates database security group', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Cal.com RDS PostgreSQL database',
      });
    });

    test('allows PostgreSQL port 5432 ingress', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        SecurityGroupIngress: [
          {
            IpProtocol: 'tcp',
            FromPort: 5432,
            ToPort: 5432,
            CidrIp: '0.0.0.0/0',
            Description: 'Allow PostgreSQL access from anywhere',
          },
        ],
      });
    });
  });

  describe('Secrets Manager Configuration', () => {
    test('creates database credentials secret', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'calcom-db-credentials',
      });
    });

    test('generates password with correct settings', () => {
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
    test('creates PostgreSQL database instance', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
        DBName: 'calcom',
      });
    });

    test('uses t3.micro instance type', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DBInstanceClass: 'db.t3.micro',
      });
    });

    test('configures storage correctly', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        AllocatedStorage: '20',
        MaxAllocatedStorage: 100,
        StorageType: 'gp3',
      });
    });

    test('enables public accessibility', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        PubliclyAccessible: true,
      });
    });

    test('disables multi-AZ deployment', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: false,
      });
    });

    test('configures backup retention', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 7,
      });
    });

    test('disables deletion protection', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        DeletionProtection: false,
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    test('exports database endpoint', () => {
      template.hasOutput('DBEndpoint', {
        Description: 'Database endpoint address',
        Export: {
          Name: 'CalComDBEndpoint',
        },
      });
    });

    test('exports database port', () => {
      template.hasOutput('DBPort', {
        Description: 'Database port',
        Export: {
          Name: 'CalComDBPort',
        },
      });
    });

    test('exports database name', () => {
      template.hasOutput('DBName', {
        Value: 'calcom',
        Description: 'Database name',
        Export: {
          Name: 'CalComDBName',
        },
      });
    });

    test('exports credentials secret ARN', () => {
      template.hasOutput('DBCredentialsSecretArn', {
        Description: 'ARN of the secret containing database credentials',
        Export: {
          Name: 'CalComDBCredentialsSecretArn',
        },
      });
    });

    test('exports credentials secret name', () => {
      template.hasOutput('DBCredentialsSecretName', {
        Description: 'Name of the secret containing database credentials',
        Export: {
          Name: 'CalComDBCredentialsSecretName',
        },
      });
    });

    test('exports VPC ID', () => {
      template.hasOutput('VPCId', {
        Description: 'VPC ID',
        Export: {
          Name: 'CalComVPCId',
        },
      });
    });
  });

  describe('Resource Counts', () => {
    test('creates exactly one RDS instance', () => {
      template.resourceCountIs('AWS::RDS::DBInstance', 1);
    });

    test('creates exactly one Secrets Manager secret', () => {
      template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    });

    test('creates exactly one VPC', () => {
      template.resourceCountIs('AWS::EC2::VPC', 1);
    });
  });
});
