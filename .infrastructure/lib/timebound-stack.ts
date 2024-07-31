
import { Construct } from 'constructs';
import {
  BuildsBucket,
  githubActions,
  QueueFunction,
  ScheduledFunction,
  ZipFunction,
} from '@scloud/cdk-patterns';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { InstanceClass, InstanceSize, InstanceType, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion, ParameterGroup } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { EC2WebApp } from './EC2WebApp.js';
import { Schedule } from 'aws-cdk-lib/aws-events';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Bucket } from 'aws-cdk-lib/aws-s3';

// Credentials
// PERSONAL_ACCESS_TOKEN - create a Github personal access token (classic) with 'repo' scope and set this in .infrastructure/secrets/github.sh using export PERSONAL_ACCESS_TOKEN=ghp_...
// AWS_PROFILE           - if you've set up a profile to access this account, set this in .infrastructure/secrets/aws.sh using export AWS_PROFILE=...

// Route 53
const DOMAIN_NAME = 'timebound.greenersoftware.net';
const ZONE_ID = 'Z0657472310GZQ6PZIX06';

// Github - set in secrets/github.sh
// const OWNER = 'GreenerSoftware';
// const REPO = 'timebound';

const startupSchedule = Schedule.cron({ minute: '00', hour: '07' }); // UTC time
const shutdownSchedule = Schedule.cron({ minute: '00', hour: '23' }); // UTC time

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`No environment variable value for ${key}`);
  return value;
}

export default class TimeboundStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // This only needs to be created once per account.
    githubActions(this).ghaOidcProvider();

    // Bucket for Lambda builds
    const builds = new BuildsBucket(this);

    // DNS zone
    const zone = this.zone(DOMAIN_NAME, ZONE_ID);

    // Slack
    const slackQueue = this.slack(builds);

    // Cloudfront function association:
    const defaultBehavior: Partial<cloudfront.BehaviorOptions> = {
      functionAssociations: [{
        function: new cloudfront.Function(this, 'staticURLs', {
          code: cloudfront.FunctionCode.fromFile({ filePath: './lib/cfFunction.js' }),
          comment: 'Rewrite static URLs to .html so they get forwarded to s3',
        }),
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      }],
    };

    // Cloudfront -> ALB -> ASG -> EC2
    const ec2Webapp = new EC2WebApp(this, 'alwaysOn', {
      zone,
      domainName: DOMAIN_NAME,
      defaultIndex: true,
      redirectWww: true,
      distributionProps: {
        defaultBehavior: defaultBehavior as cloudfront.BehaviorOptions,
      },
    });

    // RDS
    const rds = this.rds(ec2Webapp);

    // Scheduling
    this.startup(ec2Webapp, rds, builds, slackQueue);
    this.shutdown(ec2Webapp, rds, builds, slackQueue);

    // Set up OIDC access from Github Actions - this enables builds to deploy updates to the infrastructure
    githubActions(this).ghaOidcRole({ owner: env('OWNER'), repo: env('REPO') });
  }

  /**
   * NB: creating a hosted zone is not free. You will be charged $0.50 per month for each hosted zone.
   * @param zoneName The name of the hosted zone - this is assumed to be the same as the domain name and will be used by other constructs (e.g. for SSL certificates),
   * @param zoneId Optional. The ID of an existing hosted zone. If you already have a hosted zone, you can pass the zoneId to this function to get a reference to it, rather than creating a new one.
   */
  zone(zoneName: string, zoneId?: string): IHostedZone {
    if (zoneId) {
      return HostedZone.fromHostedZoneAttributes(this, 'zone', {
        hostedZoneId: zoneId,
        zoneName,
      });
    }

    // Fall back to creating a new HostedZone - costs $0.50 per month
    return new HostedZone(this, 'zone', {
      zoneName,
    });
  }

  /**
   * Component to send Slack messages for general logging.
   */
  slack(builds: Bucket): Queue {
    const { queue } = QueueFunction.node(this, 'slack', {
      environment: {
        SLACK_WEBHOOK: process.env.SLACK_WEBHOOK || '',
      },
      functionProps: {
        code: Code.fromBucket(builds, 'slack.zip'),
      },
    });
    console.log('builds:', builds);
    return queue;
  }

  /**
   * Based on: https://github.com/aws-samples/aws-cdk-examples/blob/main/typescript/rds/mysql/mysql.ts
   */
  rds(ec2Webapp: EC2WebApp): DatabaseInstance {
    const vpc = ec2Webapp.vpc;

    // Database connection details
    const mysqlUsername = "admin";
    const databaseName = "db";
    const mysqlSecret = new Secret(this, 'MysqlCredentials', {
      secretName: 'MysqlCredentials',
      description: 'Mysql Database Crendetials',
      generateSecretString: {
        excludeCharacters: "\"@/\\ '",
        generateStringKey: 'password',
        passwordLength: 30,
        secretStringTemplate: JSON.stringify({ username: mysqlUsername }),
      },
    });
    const mysqlCredentials = Credentials.fromSecret(
      mysqlSecret,
      mysqlUsername,
    );

    // Database security group
    const dbsg = new SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Database',
      securityGroupName: 'Database',
    });
    dbsg.addIngressRule(dbsg, Port.allTraffic(), 'all from self');
    dbsg.addIngressRule(ec2Webapp.asg.connections.securityGroups[0], Port.tcpRange(3306, 3306), 'inbound from ec2 asg');

    // Create database instance
    const databaseInstance = new DatabaseInstance(this, 'MysqlDatabase', {
      databaseName,
      instanceIdentifier: 'database',
      credentials: mysqlCredentials,
      engine: DatabaseInstanceEngine.mysql({
        version: MysqlEngineVersion.VER_8_0_37,
      }),
      backupRetention: Duration.days(7),
      allocatedStorage: 20,
      securityGroups: [dbsg],
      allowMajorVersionUpgrade: true,
      autoMinorVersionUpgrade: true,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
      // vpcSubnets: {
      //   subnets: vpc.privateSubnets,
      // },
      vpc,
      removalPolicy: RemovalPolicy.DESTROY,
      storageEncrypted: true,
      monitoringInterval: Duration.seconds(60),
      parameterGroup: new ParameterGroup(this, 'ParameterGroup', {
        engine: DatabaseInstanceEngine.mysql({
          version: MysqlEngineVersion.VER_8_0_37,
        }),
      }),
      // subnetGroup: new SubnetGroup(this, 'DatabaseSubnetGroup', {
      //   vpc,
      //   description: 'Database subnet group',
      //   vpcSubnets: {
      //     subnets: vpc.privateSubnets,
      //   },
      //   subnetGroupName: 'Database subnet group',
      // }),
      publiclyAccessible: false,
    });
    databaseInstance.addRotationSingleUser();

    // new CfnOutput(this, 'MysqlEndpoint', {
    //   exportName: 'MysqlEndPoint',
    //   value: databaseInstance.dbInstanceEndpointAddress,
    // });

    // new CfnOutput(this, 'MysqlUserName', {
    //   exportName: 'MysqlUserName',
    //   value: mysqlUsername,
    // });

    // new CfnOutput(this, 'MysqlDbName', {
    //   exportName: 'MysqlDbName',
    //   value: props.dbName!,
    // });

    return databaseInstance;
  }

  startup(ec2Webapp: EC2WebApp, rds: DatabaseInstance, builds: Bucket, slackQueue: Queue) {
    const startup = ZipFunction.node(this, 'startup', {
      environment: {
        AUTO_SCALING_GROUP_NAME: ec2Webapp.asg.autoScalingGroupName,
        RDS_INSTANCE_IDENTIFIER: rds.instanceIdentifier,
        SLACK_QUEUE_URL: slackQueue.queueUrl,
      },
      functionProps: {
        code: Code.fromBucket(builds, 'startup.zip'),
      }
    });
    slackQueue.grantSendMessages(startup);

    // ASG permissions
    startup.role?.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        'autoscaling:UpdateAutoScalingGroup',
        'autoscaling:SetDesiredCapacity',
      ],
      resources: [ec2Webapp.asg.autoScalingGroupArn],
      sid: 'ASGStart',
    }));

    // RDS permissions
    startup.role?.addToPrincipalPolicy(new PolicyStatement({
      actions: ['rds:StartDbInstance'],
      resources: [rds.instanceArn],
      sid: 'RDSStart',
    }));

    // Schedule
    new ScheduledFunction(this, 'startupSchedule', {
      schedule: startupSchedule,
      lambda: startup,
    });
  }

  shutdown(ec2Webapp: EC2WebApp, rds: DatabaseInstance, builds: Bucket, slackQueue: Queue) {
    const shutdown = ZipFunction.node(this, 'shutdown', {
      environment: {
        AUTO_SCALING_GROUP_NAME: ec2Webapp.asg.autoScalingGroupName,
        RDS_INSTANCE_IDENTIFIER: rds.instanceIdentifier,
        SLACK_QUEUE_URL: slackQueue.queueUrl,
      },
      functionProps: {
        code: Code.fromBucket(builds, 'shutdown.zip'),
      }
    });
    console.log('builds:', builds);
    slackQueue.grantSendMessages(shutdown);

    // ASG permissions
    shutdown.role?.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        'autoscaling:UpdateAutoScalingGroup',
        'autoscaling:SetDesiredCapacity',
      ],
      resources: [ec2Webapp.asg.autoScalingGroupArn],
      sid: 'ASGStop',
    }));

    // RDS permissions
    shutdown.role?.addToPrincipalPolicy(new PolicyStatement({
      actions: ['rds:StopDbInstance'],
      resources: [rds.instanceArn],
      sid: 'RDSStop',
    }));

    // Schedule
    new ScheduledFunction(this, 'shutdownSchedule', {
      schedule: shutdownSchedule,
      lambda: shutdown,
    });
  }

}
