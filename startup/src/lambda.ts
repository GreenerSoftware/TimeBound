// https://aws.amazon.com/blogs/mobile/understanding-amazon-cognito-user-pool-oauth-2-0-grants/
import {
  ScheduledEvent,
} from 'aws-lambda';
import { AutoScalingClient, UpdateAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
import { RDSClient, StartDBInstanceCommand } from "@aws-sdk/client-rds";
import { slackLog } from './slack';

const autoScalingClient = new AutoScalingClient();
const rdsClient = new RDSClient();

export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('event:', JSON.stringify(event));

  // Start ec2
  await slackLog('Starting ec2 in asg:', process.env.AUTO_SCALING_GROUP_NAME);
  const asgCommand = new UpdateAutoScalingGroupCommand({
    AutoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME,
    MinSize: 1,
    MaxSize: 1,
    DesiredCapacity: 1,
  });
  const asgResponse = await autoScalingClient.send(asgCommand);
  if (asgResponse.$metadata.httpStatusCode !== 200) await slackLog('asg', JSON.stringify(asgResponse, null, 2));

  // Start rds
  await slackLog('Starting RDS:', process.env.RDS_INSTANCE_IDENTIFIER);
  const rdsComand = new StartDBInstanceCommand({
    DBInstanceIdentifier: process.env.RDS_INSTANCE_IDENTIFIER,
  });
  const rdsResponse = await rdsClient.send(rdsComand);
  if (rdsResponse.$metadata.httpStatusCode !== 200) await slackLog('rds', JSON.stringify(rdsResponse, null, 2));
}
