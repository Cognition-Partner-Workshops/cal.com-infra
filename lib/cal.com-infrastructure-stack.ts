/**
 * @fileoverview AWS CDK Infrastructure Stack for Cal.com Database Layer
 *
 * This module defines the core AWS infrastructure required to run the Cal.com
 * application's database layer. It provisions a complete networking environment
 * with a VPC, security groups, and a managed PostgreSQL database instance.
 *
 * @module cal.com-infrastructure-stack
 * @requires aws-cdk-lib/core
 * @requires aws-cdk-lib/aws-ec2
 * @requires aws-cdk-lib/aws-rds
 * @requires aws-cdk-lib/aws-secretsmanager
 */

import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { CfnOutput } from 'aws-cdk-lib/core';

/**
 * CalComInfrastructureStack provisions the foundational AWS infrastructure
 * for the Cal.com application's database layer.
 *
 * This stack creates the following AWS resources:
 * - A VPC with public, private, and isolated subnets across 2 availability zones
 * - A security group allowing PostgreSQL (port 5432) access
 * - An AWS Secrets Manager secret for database credentials
 * - An RDS PostgreSQL 15 database instance
 *
 * The infrastructure is optimized for cost efficiency (t3.micro, single NAT gateway,
 * single AZ database) rather than high availability, making it suitable for
 * development or small-scale production environments.
 *
 * @extends cdk.Stack
 *
 * @example
 * // Create the infrastructure stack
 * const app = new cdk.App();
 * new CalComInfrastructureStack(app, 'CalComInfrastructureStack', {
 *   env: {
 *     account: process.env.CDK_DEFAULT_ACCOUNT,
 *     region: process.env.CDK_DEFAULT_REGION
 *   }
 * });
 */
export class CalComInfrastructureStack extends cdk.Stack {
  /**
   * Creates an instance of CalComInfrastructureStack.
   *
   * @param {Construct} scope - The parent construct (typically a cdk.App instance)
   * @param {string} id - The unique identifier for this stack within the scope
   * @param {cdk.StackProps} [props] - Optional stack properties including environment configuration
   */
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Virtual Private Cloud (VPC) for network isolation.
     *
     * Configuration:
     * - 2 Availability Zones for redundancy
     * - 1 NAT Gateway (cost optimization vs. HA)
     * - Three subnet tiers:
     *   - Public: Internet-facing resources (load balancers, bastion hosts)
     *   - Private with Egress: Application servers with outbound internet access
     *   - Isolated: Database instances with no internet access
     *
     * Each subnet uses a /24 CIDR mask (256 IP addresses per subnet).
     */
    const vpc = new ec2.Vpc(this, 'CalComVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    /**
     * Security Group for the RDS database instance.
     *
     * This security group controls network access to the PostgreSQL database.
     * Currently configured to allow inbound connections on port 5432 from any
     * IPv4 address (0.0.0.0/0) for development convenience.
     *
     * @security For production environments, restrict the ingress rule to specific
     * CIDR blocks or security groups (e.g., application server security groups).
     */
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'CalComDBSecurityGroup', {
      vpc,
      description: 'Security group for Cal.com RDS PostgreSQL database',
      allowAllOutbound: true,
    });

    /**
     * Ingress rule allowing PostgreSQL connections from any IPv4 address.
     *
     * @warning This rule allows access from 0.0.0.0/0 which is suitable for
     * development but should be restricted in production environments.
     */
    dbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from anywhere'
    );

    /**
     * AWS Secrets Manager secret for database credentials.
     *
     * Stores the database username and auto-generated password securely.
     * The password is generated with the following characteristics:
     * - 32 characters in length
     * - No punctuation characters (for connection string compatibility)
     * - No spaces
     *
     * The secret can be retrieved using the AWS CLI:
     * @example
     * aws secretsmanager get-secret-value --secret-id calcom-db-credentials
     */
    const dbCredentials = new secretsmanager.Secret(this, 'CalComDBCredentials', {
      secretName: 'calcom-db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'calcom_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    /**
     * RDS PostgreSQL database instance for Cal.com application data.
     *
     * Instance Configuration:
     * - Engine: PostgreSQL 15 (latest stable version)
     * - Instance Type: t3.micro (burstable, Free Tier eligible, ~$10-15/month)
     * - Storage: 20GB GP3 SSD with auto-scaling up to 100GB
     * - Backup: 7-day automated backup retention
     * - Availability: Single-AZ (no automatic failover)
     *
     * Network Configuration:
     * - Deployed in public subnets for development accessibility
     * - Publicly accessible (has public IP address)
     * - Protected by CalComDBSecurityGroup
     *
     * Data Protection:
     * - Removal policy set to SNAPSHOT (creates final snapshot on deletion)
     * - Deletion protection disabled for development flexibility
     *
     * @note For production, consider:
     * - Enabling Multi-AZ for high availability
     * - Using larger instance types (t3.small or larger)
     * - Deploying to private subnets with VPN/bastion access
     * - Enabling deletion protection
     */
    const dbInstance = new rds.DatabaseInstance(this, 'CalComDatabasePublic', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: 'calcom',
      credentials: rds.Credentials.fromSecret(dbCredentials),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
      publiclyAccessible: true,
      multiAz: false,
    });

    /**
     * CloudFormation Stack Outputs
     *
     * The following outputs expose key infrastructure values for consumption by
     * external systems, applications, and operational scripts. These values are
     * accessible via:
     * - AWS CloudFormation Console
     * - AWS CLI: aws cloudformation describe-stacks --stack-name CalComInfrastructureStack
     * - CDK: cdk.Fn.importValue('ExportName')
     * - scripts/get-credentials.sh utility script
     */

    /**
     * Database endpoint hostname for client connections.
     * Format: <identifier>.<region>.rds.amazonaws.com
     */
    new CfnOutput(this, 'DBEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'Database endpoint address',
      exportName: 'CalComDBEndpoint',
    });

    /**
     * Database port number (standard PostgreSQL port 5432).
     */
    new CfnOutput(this, 'DBPort', {
      value: dbInstance.dbInstanceEndpointPort,
      description: 'Database port',
      exportName: 'CalComDBPort',
    });

    /**
     * Database name for the Cal.com application.
     * This is the default database created during RDS instance provisioning.
     */
    new CfnOutput(this, 'DBName', {
      value: 'calcom',
      description: 'Database name',
      exportName: 'CalComDBName',
    });

    /**
     * ARN of the Secrets Manager secret containing database credentials.
     * Use this ARN for programmatic access via AWS SDK or IAM policies.
     */
    new CfnOutput(this, 'DBCredentialsSecretArn', {
      value: dbCredentials.secretArn,
      description: 'ARN of the secret containing database credentials',
      exportName: 'CalComDBCredentialsSecretArn',
    });

    /**
     * Human-readable name of the Secrets Manager secret.
     * Use this for AWS CLI access: aws secretsmanager get-secret-value --secret-id <name>
     */
    new CfnOutput(this, 'DBCredentialsSecretName', {
      value: dbCredentials.secretName,
      description: 'Name of the secret containing database credentials',
      exportName: 'CalComDBCredentialsSecretName',
    });

    /**
     * VPC identifier for deploying additional resources in the same network.
     * Use this to deploy application servers, Lambda functions, or other
     * services that need to communicate with the database.
     */
    new CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID',
      exportName: 'CalComVPCId',
    });
  }
}
