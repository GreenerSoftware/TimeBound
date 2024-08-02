// https://aws.amazon.com/blogs/mobile/understanding-amazon-cognito-user-pool-oauth-2-0-grants/
import {
  ScheduledEvent,
} from 'aws-lambda';
import { AutoScalingClient, UpdateAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
import { RDSClient, StopDBInstanceCommand } from "@aws-sdk/client-rds";
import { slackLog } from './slack';

const autoScalingClient = new AutoScalingClient();
const rdsClient = new RDSClient();

export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('event:', JSON.stringify(event));

  // Shut down ec2
  await slackLog('Shutting down ec2 in asg:', process.env.AUTO_SCALING_GROUP_NAME);
  const asgCommand = new UpdateAutoScalingGroupCommand({
    AutoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME,
    MinSize: 0,
    MaxSize: 0,
    DesiredCapacity: 0,
  });
  const asgResponse = await autoScalingClient.send(asgCommand);
  if (asgResponse.$metadata.httpStatusCode !== 200) await slackLog('asg', JSON.stringify(asgResponse, null, 2));

  // stop rds
  await slackLog('Starting RDS:', process.env.RDS_INSTANCE_IDENTIFIER);
  const rdsComand = new StopDBInstanceCommand({
    DBInstanceIdentifier: process.env.RDS_INSTANCE_IDENTIFIER,
  });
  const rdsResponse = await rdsClient.send(rdsComand);
  if (rdsResponse.$metadata.httpStatusCode !== 200) await slackLog('rds', JSON.stringify(rdsResponse, null, 2));
};
