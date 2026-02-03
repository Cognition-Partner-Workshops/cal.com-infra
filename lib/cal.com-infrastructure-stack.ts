import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { CfnOutput } from 'aws-cdk-lib/core';

export class CalComInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'CalComVPC', {
      maxAzs: 3,
      natGateways: 2,
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

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'CalComDBSecurityGroup', {
      vpc,
      description: 'Security group for Cal.com RDS PostgreSQL database',
      allowAllOutbound: true,
    });

    const appSecurityGroup = new ec2.SecurityGroup(this, 'CalComAppSecurityGroup', {
      vpc,
      description: 'Security group for Cal.com application servers',
      allowAllOutbound: true,
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, 'CalComALBSecurityGroup', {
      vpc,
      description: 'Security group for Cal.com Application Load Balancer',
      allowAllOutbound: true,
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from anywhere'
    );

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from anywhere'
    );

    appSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB to app servers'
    );

    dbSecurityGroup.addIngressRule(
      appSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from app servers'
    );

    dbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from anywhere for development'
    );

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

    const dbInstance = new rds.DatabaseInstance(this, 'CalComDatabasePublic', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: 'calcom',
      credentials: rds.Credentials.fromSecret(dbCredentials),
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      storageType: rds.StorageType.GP3,
      backupRetention: cdk.Duration.days(14),
      deleteAutomatedBackups: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
      publiclyAccessible: true,
      multiAz: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      enablePerformanceInsights: true,
      monitoringInterval: cdk.Duration.seconds(60),
    });


    const cluster = new ecs.Cluster(this, 'CalComCluster', {
      vpc,
      containerInsights: true,
      clusterName: 'calcom-cluster',
    });

    const ecrRepository = new ecr.Repository(this, 'CalComECRRepository', {
      repositoryName: 'calcom-app',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'CalComALB', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      loadBalancerName: 'calcom-alb',
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'CalComTargetGroup', {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        healthyHttpCodes: '200-399',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    alb.addListener('CalComHTTPListener', {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'CalComTaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      family: 'calcom-task',
    });

    const dbUsername = dbCredentials.secretValueFromJson('username').unsafeUnwrap();
    const dbPassword = dbCredentials.secretValueFromJson('password').unsafeUnwrap();
    const databaseUrl = `postgresql://${dbUsername}:${dbPassword}@${dbInstance.dbInstanceEndpointAddress}:${dbInstance.dbInstanceEndpointPort}/calcom?sslmode=no-verify`;

    taskDefinition.addContainer('CalComContainer', {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository, 'latest'),
      memoryLimitMiB: 2048,
      cpu: 1024,
      portMappings: [
        {
          containerPort: 3000,
          protocol: ecs.Protocol.TCP,
        },
      ],
      environment: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_WEBAPP_URL: `http://${alb.loadBalancerDnsName}`,
        NEXTAUTH_URL: `http://${alb.loadBalancerDnsName}`,
        DATABASE_HOST: dbInstance.dbInstanceEndpointAddress,
        DATABASE_PORT: dbInstance.dbInstanceEndpointPort,
        DATABASE_NAME: 'calcom',
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: databaseUrl,
        NEXTAUTH_SECRET: 'calcom-nextauth-secret-change-in-production',
        CALENDSO_ENCRYPTION_KEY: 'calcom-encryption-key-change-in-prod',
      },
      secrets: {
        DATABASE_USERNAME: ecs.Secret.fromSecretsManager(dbCredentials, 'username'),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbCredentials, 'password'),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'calcom',
      }),
    });

    const fargateService = new ecs.FargateService(this, 'CalComService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      securityGroups: [appSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      serviceName: 'calcom-service',
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
    });

    fargateService.attachToApplicationTargetGroup(targetGroup);

    const scaling = fargateService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnRequestCount('RequestScaling', {
      targetGroup,
      requestsPerTarget: 1000,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    new CfnOutput(this, 'DBEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'Primary database endpoint address',
    });

    new CfnOutput(this, 'DBPort', {
      value: dbInstance.dbInstanceEndpointPort,
      description: 'Database port',
    });

    new CfnOutput(this, 'DBName', {
      value: 'calcom',
      description: 'Database name',
    });

    new CfnOutput(this, 'DBCredentialsSecretArn', {
      value: dbCredentials.secretArn,
      description: 'ARN of the secret containing database credentials',
    });

    new CfnOutput(this, 'DBCredentialsSecretName', {
      value: dbCredentials.secretName,
      description: 'Name of the secret containing database credentials',
    });

    new CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID',
    });

    new CfnOutput(this, 'ALBDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
    });

    new CfnOutput(this, 'ALBArn', {
      value: alb.loadBalancerArn,
      description: 'Application Load Balancer ARN',
    });

    new CfnOutput(this, 'ECSClusterArn', {
      value: cluster.clusterArn,
      description: 'ECS Cluster ARN',
    });

    new CfnOutput(this, 'ECSServiceArn', {
      value: fargateService.serviceArn,
      description: 'ECS Service ARN',
    });

    new CfnOutput(this, 'ECRRepositoryUri', {
      value: ecrRepository.repositoryUri,
      description: 'ECR Repository URI for cal.com container images',
    });
  }
}
