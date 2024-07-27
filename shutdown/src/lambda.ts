// https://aws.amazon.com/blogs/mobile/understanding-amazon-cognito-user-pool-oauth-2-0-grants/
import {
  ScheduledEvent,
} from 'aws-lambda';
import { AutoScalingClient, UpdateAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
import { RDSClient, StopDBInstanceCommand } from "@aws-sdk/client-rds";
import { slackLog } from './slack';

process.env.COMPONENT = 'shutdown';

const autoScalingClient = new AutoScalingClient();
const rdsClient = new RDSClient();

export async function handler(event: ScheduledEvent): Promise<void> {
  await slackLog('event', JSON.stringify(event));

  // Shut down ec2
  await slackLog('Shutting down EC2 instances in asg:', process.env.AUTO_SCALING_GROUP_NAME);
  const asgCommand = new UpdateAutoScalingGroupCommand({
    AutoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME,
    MinSize: 0,
    MaxSize: 0,
    DesiredCapacity: 0,
  });
  const asgResponse = await autoScalingClient.send(asgCommand);
  await slackLog('asg', JSON.stringify(asgResponse, null, 2));

  // stop rds
  await slackLog('Stopping RDS instance:', process.env.RDS_INSTANCE_IDENTIFIER);
  const rdsComand = new StopDBInstanceCommand({
    DBInstanceIdentifier: process.env.RDS_INSTANCE_IDENTIFIER,
  });
  const rdsResponse = await rdsClient.send(rdsComand);
  await slackLog('rds', JSON.stringify(rdsResponse, null, 2));
};
