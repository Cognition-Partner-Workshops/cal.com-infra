import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { CfnOutput } from 'aws-cdk-lib/core';

export interface CalComInfrastructureStackProps extends cdk.StackProps {
  environment?: 'development' | 'staging' | 'production';
  enableMultiAz?: boolean;
  enableReadReplica?: boolean;
  enableRdsProxy?: boolean;
}

export class CalComInfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbCredentials: secretsmanager.Secret;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: CalComInfrastructureStackProps) {
    super(scope, id, props);

    const environment = props?.environment ?? 'development';
    const isProduction = environment === 'production';
    const enableMultiAz = props?.enableMultiAz ?? isProduction;
    const enableReadReplica = props?.enableReadReplica ?? isProduction;
    const enableRdsProxy = props?.enableRdsProxy ?? isProduction;

    const vpc = new ec2.Vpc(this, 'CalComVPC', {
      maxAzs: isProduction ? 3 : 2,
      natGateways: isProduction ? 2 : 1,
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
      flowLogs: {
        'vpc-flow-logs': {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(
            new logs.LogGroup(this, 'VPCFlowLogsGroup', {
              logGroupName: `/aws/vpc/calcom-${environment}-flow-logs`,
              retention: logs.RetentionDays.ONE_MONTH,
              removalPolicy: cdk.RemovalPolicy.DESTROY,
            })
          ),
          trafficType: ec2.FlowLogTrafficType.ALL,
        },
      },
    });
    this.vpc = vpc;

    const encryptionKey = new kms.Key(this, 'CalComEncryptionKey', {
      alias: `calcom-${environment}-encryption-key`,
      description: 'KMS key for Cal.com infrastructure encryption',
      enableKeyRotation: true,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'CalComDBSecurityGroup', {
      vpc,
      description: 'Security group for Cal.com RDS PostgreSQL database',
      allowAllOutbound: false,
    });

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from within VPC only'
    );

    dbSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS outbound for Secrets Manager rotation'
    );
    this.dbSecurityGroup = dbSecurityGroup;

    const dbCredentials = new secretsmanager.Secret(this, 'CalComDBCredentials', {
      secretName: `calcom-${environment}-db-credentials`,
      description: 'Database credentials for Cal.com PostgreSQL',
      encryptionKey: encryptionKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'calcom_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });
    this.dbCredentials = dbCredentials;

    const parameterGroup = new rds.ParameterGroup(this, 'CalComDBParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      description: 'Optimized parameter group for Cal.com PostgreSQL',
      parameters: {
        'shared_preload_libraries': 'pg_stat_statements',
        'log_statement': 'ddl',
        'log_min_duration_statement': '1000',
        'max_connections': isProduction ? '200' : '100',
        'work_mem': isProduction ? '64MB' : '32MB',
        'maintenance_work_mem': isProduction ? '512MB' : '256MB',
        'effective_cache_size': isProduction ? '3GB' : '1GB',
        'random_page_cost': '1.1',
      },
    });

    const instanceType = isProduction
      ? ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM)
      : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO);

    const dbInstance = new rds.DatabaseInstance(this, 'CalComDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: instanceType,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: 'calcom',
      credentials: rds.Credentials.fromSecret(dbCredentials),
      allocatedStorage: 20,
      maxAllocatedStorage: isProduction ? 500 : 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      storageEncryptionKey: encryptionKey,
      backupRetention: cdk.Duration.days(isProduction ? 30 : 7),
      deleteAutomatedBackups: !isProduction,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: isProduction,
      publiclyAccessible: false,
      multiAz: enableMultiAz,
      autoMinorVersionUpgrade: true,
      enablePerformanceInsights: true,
      performanceInsightRetention: isProduction
        ? rds.PerformanceInsightRetention.MONTHS_1
        : rds.PerformanceInsightRetention.DEFAULT,
      performanceInsightEncryptionKey: encryptionKey,
      monitoringInterval: cdk.Duration.seconds(isProduction ? 15 : 60),
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      parameterGroup: parameterGroup,
      instanceIdentifier: `calcom-${environment}-db`,
    });
    this.dbInstance = dbInstance;

    if (enableReadReplica) {
      new rds.DatabaseInstanceReadReplica(this, 'CalComDatabaseReadReplica', {
        sourceDatabaseInstance: dbInstance,
        instanceType: instanceType,
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [dbSecurityGroup],
        storageEncrypted: true,
        storageEncryptionKey: encryptionKey,
        publiclyAccessible: false,
        autoMinorVersionUpgrade: true,
        enablePerformanceInsights: true,
        performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
        monitoringInterval: cdk.Duration.seconds(60),
        instanceIdentifier: `calcom-${environment}-db-replica`,
      });
    }

    if (enableRdsProxy) {
      const proxySecurityGroup = new ec2.SecurityGroup(this, 'CalComRDSProxySecurityGroup', {
        vpc,
        description: 'Security group for Cal.com RDS Proxy',
        allowAllOutbound: false,
      });

      proxySecurityGroup.addIngressRule(
        ec2.Peer.ipv4(vpc.vpcCidrBlock),
        ec2.Port.tcp(5432),
        'Allow PostgreSQL access from within VPC'
      );

      proxySecurityGroup.addEgressRule(
        dbSecurityGroup,
        ec2.Port.tcp(5432),
        'Allow connection to RDS instance'
      );

      dbSecurityGroup.addIngressRule(
        proxySecurityGroup,
        ec2.Port.tcp(5432),
        'Allow connections from RDS Proxy'
      );

      const rdsProxy = new rds.DatabaseProxy(this, 'CalComRDSProxy', {
        proxyTarget: rds.ProxyTarget.fromInstance(dbInstance),
        secrets: [dbCredentials],
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        securityGroups: [proxySecurityGroup],
        dbProxyName: `calcom-${environment}-proxy`,
        debugLogging: !isProduction,
        requireTLS: true,
        idleClientTimeout: cdk.Duration.minutes(30),
        maxConnectionsPercent: 90,
        maxIdleConnectionsPercent: 10,
      });

      new CfnOutput(this, 'RDSProxyEndpoint', {
        value: rdsProxy.endpoint,
        description: 'RDS Proxy endpoint for connection pooling',
        exportName: `CalCom${environment}RDSProxyEndpoint`,
      });
    }

    const cpuAlarm = new cloudwatch.Alarm(this, 'CalComDBCPUAlarm', {
      alarmName: `calcom-${environment}-db-cpu-high`,
      alarmDescription: 'Database CPU utilization is high',
      metric: dbInstance.metricCPUUtilization({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const connectionsAlarm = new cloudwatch.Alarm(this, 'CalComDBConnectionsAlarm', {
      alarmName: `calcom-${environment}-db-connections-high`,
      alarmDescription: 'Database connections are approaching limit',
      metric: dbInstance.metricDatabaseConnections({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: isProduction ? 150 : 75,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const freeStorageAlarm = new cloudwatch.Alarm(this, 'CalComDBStorageAlarm', {
      alarmName: `calcom-${environment}-db-storage-low`,
      alarmDescription: 'Database free storage space is low',
      metric: dbInstance.metricFreeStorageSpace({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 5 * 1024 * 1024 * 1024,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const readLatencyAlarm = new cloudwatch.Alarm(this, 'CalComDBReadLatencyAlarm', {
      alarmName: `calcom-${environment}-db-read-latency-high`,
      alarmDescription: 'Database read latency is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'ReadLatency',
        dimensionsMap: {
          DBInstanceIdentifier: dbInstance.instanceIdentifier,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 0.02,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const dashboard = new cloudwatch.Dashboard(this, 'CalComDashboard', {
      dashboardName: `calcom-${environment}-infrastructure`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database CPU Utilization',
        left: [dbInstance.metricCPUUtilization()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Database Connections',
        left: [dbInstance.metricDatabaseConnections()],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database Read/Write IOPS',
        left: [
          dbInstance.metricReadIOPS(),
          dbInstance.metricWriteIOPS(),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Database Free Storage Space',
        left: [dbInstance.metricFreeStorageSpace()],
        width: 12,
      }),
    );

    const readLatencyMetric = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'ReadLatency',
      dimensionsMap: {
        DBInstanceIdentifier: dbInstance.instanceIdentifier,
      },
    });

    const writeLatencyMetric = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'WriteLatency',
      dimensionsMap: {
        DBInstanceIdentifier: dbInstance.instanceIdentifier,
      },
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Database Read/Write Latency',
        left: [
          readLatencyMetric,
          writeLatencyMetric,
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Database Freeable Memory',
        left: [dbInstance.metricFreeableMemory()],
        width: 12,
      }),
    );

    new CfnOutput(this, 'DBEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'Database endpoint address',
      exportName: `CalCom${environment}DBEndpoint`,
    });

    new CfnOutput(this, 'DBPort', {
      value: dbInstance.dbInstanceEndpointPort,
      description: 'Database port',
      exportName: `CalCom${environment}DBPort`,
    });

    new CfnOutput(this, 'DBName', {
      value: 'calcom',
      description: 'Database name',
      exportName: `CalCom${environment}DBName`,
    });

    new CfnOutput(this, 'DBCredentialsSecretArn', {
      value: dbCredentials.secretArn,
      description: 'ARN of the secret containing database credentials',
      exportName: `CalCom${environment}DBCredentialsSecretArn`,
    });

    new CfnOutput(this, 'DBCredentialsSecretName', {
      value: dbCredentials.secretName,
      description: 'Name of the secret containing database credentials',
      exportName: `CalCom${environment}DBCredentialsSecretName`,
    });

    new CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID',
      exportName: `CalCom${environment}VPCId`,
    });

    new CfnOutput(this, 'EncryptionKeyArn', {
      value: encryptionKey.keyArn,
      description: 'ARN of the KMS encryption key',
      exportName: `CalCom${environment}EncryptionKeyArn`,
    });

    new CfnOutput(this, 'DashboardURL', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=calcom-${environment}-infrastructure`,
      description: 'CloudWatch Dashboard URL',
      exportName: `CalCom${environment}DashboardURL`,
    });

    cdk.Tags.of(this).add('Project', 'CalCom');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}
